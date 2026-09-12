import { createHmac, timingSafeEqual } from "crypto";

/**
 * Opaque, signed, expiring invitation tokens.
 *
 * A raw connection id is never enough to open an invitation: the link carries
 * an HMAC over the connection id, the invited email and an expiry. Revocation
 * still works because acceptance re-checks the connection's live status.
 */

const TTL_MS = 21 * 24 * 60 * 60 * 1000; // 21 days

/**
 * Invitation links are signed with a dedicated secret only.
 *
 * High-privilege application secrets (the service-role key, the Lovable API
 * key) are deliberately NOT accepted as fallbacks: a public claim link must not
 * be forgeable by anything that leaks one of those, and signing must fail
 * closed rather than silently borrow a privileged key.
 */
function secret(): string {
  const s = process.env["INVITE_TOKEN_SECRET"];
  if (!s) throw new Error("Invitation signing is not configured");
  return s;
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(input: string): string {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function sign(payload: string): string {
  return b64url(createHmac("sha256", secret()).update(payload).digest());
}

/** Build the token that goes into the invitation link. */
export function signInviteToken(
  connectionId: string,
  invitedEmail: string,
  now = Date.now(),
): string {
  const payload = JSON.stringify({
    c: connectionId,
    e: invitedEmail.trim().toLowerCase(),
    x: now + TTL_MS,
  });
  const body = b64url(payload);
  return `${body}.${sign(body)}`;
}

export type InviteTokenResult =
  | { ok: true; connectionId: string; email: string; expiresAt: number }
  | { ok: false; reason: "malformed" | "invalid" | "expired" };

/** Verify a token without touching the database. */
export function verifyInviteToken(token: string, now = Date.now()): InviteTokenResult {
  const parts = (token ?? "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
  const [body, sig] = parts as [string, string];

  let expected: string;
  try {
    expected = sign(body);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "invalid" };

  let parsed: { c?: string; e?: string; x?: number };
  try {
    parsed = JSON.parse(fromB64url(body));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!parsed.c || !parsed.e || !parsed.x) return { ok: false, reason: "malformed" };
  if (now > parsed.x) return { ok: false, reason: "expired" };

  return { ok: true, connectionId: parsed.c, email: parsed.e, expiresAt: parsed.x };
}

/** Compare an authenticated user's email against the invited address. */
export function emailMatchesInvite(
  authenticatedEmail: string | null | undefined,
  invitedEmail: string,
): boolean {
  if (!authenticatedEmail) return false;
  return authenticatedEmail.trim().toLowerCase() === invitedEmail.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Typed invitation tokens
// ---------------------------------------------------------------------------

/**
 * A versioned, typed invitation token.
 *
 * The signature binds the invitation id, its context, the invited email and an
 * expiry, so one context's link can never be replayed as another's. Signature
 * validity is necessary but never sufficient: the caller must re-read the
 * invitation row afterwards, because revocation, decline, prior acceptance and
 * database expiry all live there.
 */
export const INVITE_TOKEN_VERSION = 1;

export type InvitationContext = "agent_invites_professional";

export interface TypedInviteClaims {
  invitationId: string;
  context: InvitationContext;
  email: string;
  expiresAt: number;
  version: number;
}

const TYPED_TTL_MS = 21 * 24 * 60 * 60 * 1000;

export function signTypedInviteToken(
  input: { invitationId: string; context: InvitationContext; email: string },
  now = Date.now(),
): string {
  const payload = JSON.stringify({
    v: INVITE_TOKEN_VERSION,
    i: input.invitationId,
    k: input.context,
    e: input.email.trim().toLowerCase(),
    x: now + TYPED_TTL_MS,
  });
  const body = b64url(payload);
  return `${body}.${sign(body)}`;
}

export type TypedInviteTokenResult =
  | { ok: true; claims: TypedInviteClaims }
  | { ok: false; reason: "malformed" | "invalid" | "expired" | "unsupported_version" };

export function verifyTypedInviteToken(
  token: string,
  now = Date.now(),
): TypedInviteTokenResult {
  const parts = (token ?? "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
  const [body, sig] = parts as [string, string];

  let expected: string;
  try {
    expected = sign(body);
  } catch {
    // No signing secret configured: verify nothing rather than trust anything.
    return { ok: false, reason: "invalid" };
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "invalid" };

  let parsed: { v?: number; i?: string; k?: string; e?: string; x?: number };
  try {
    parsed = JSON.parse(fromB64url(body));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!parsed.i || !parsed.k || !parsed.e || !parsed.x) return { ok: false, reason: "malformed" };
  if (parsed.v !== INVITE_TOKEN_VERSION) return { ok: false, reason: "unsupported_version" };
  if (parsed.k !== "agent_invites_professional") return { ok: false, reason: "invalid" };
  if (now > parsed.x) return { ok: false, reason: "expired" };

  return {
    ok: true,
    claims: {
      invitationId: parsed.i,
      context: parsed.k,
      email: parsed.e,
      expiresAt: parsed.x,
      version: parsed.v,
    },
  };
}
