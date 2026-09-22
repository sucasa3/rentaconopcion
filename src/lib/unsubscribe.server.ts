/**
 * One-click unsubscribe tokens for marketing and relationship email.
 *
 * The token is signed with a server-held secret and carries only what is needed
 * to record the opt-out: a keyed (pseudonymous) identifier for the recipient,
 * the channel it covers, and an expiry. No readable email address, no name, no
 * account id. It works with no session and after a session has expired.
 *
 * Server-only.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { identifierHmac, normalizeEmailKey } from "./suppression.server";

const TTL_MS = 400 * 24 * 60 * 60 * 1000; // long-lived: an old email must still work

function secret(): string {
  const s =
    process.env["INVITE_TOKEN_SECRET"] ??
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
    process.env["LOVABLE_API_KEY"];
  if (!s) throw new Error("No secret available for unsubscribe tokens");
  return s;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export interface UnsubscribePayload {
  /** Keyed identifier for the recipient's email address. */
  e: string;
  /** Channel this link covers. */
  c: "email";
  /** Expiry, ms since epoch. */
  x: number;
}

export function signUnsubscribeToken(email: string, now = Date.now()): string | null {
  const key = normalizeEmailKey(email);
  if (!key) return null;
  const payload: UnsubscribePayload = {
    e: identifierHmac("email", key),
    c: "email",
    x: now + TTL_MS,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac("sha256", secret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyUnsubscribeToken(
  token: string | null | undefined,
  now = Date.now(),
): UnsubscribePayload | null {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = b64url(createHmac("sha256", secret()).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload: UnsubscribePayload;
  try {
    payload = JSON.parse(fromB64url(body).toString("utf8"));
  } catch {
    return null;
  }
  if (payload?.c !== "email" || typeof payload.x !== "number") return null;
  if (payload.x < now) return null;
  return payload;
}

export function unsubscribeUrl(email: string): string | null {
  const token = signUnsubscribeToken(email);
  if (!token) return null;
  const site = process.env["SITE_URL"] ?? "https://sucasa.com";
  return `${site}/api/public/unsubscribe?t=${encodeURIComponent(token)}`;
}
