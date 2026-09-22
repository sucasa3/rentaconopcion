/**
 * Suppression register access.
 *
 * The register holds pseudonymous personal data: keyed HMACs of an email
 * address, a phone number and (secondary only) a normalized address. No
 * readable email, phone, name or address is ever written here.
 *
 * Every path that could re-create or re-contact a deleted person consults this
 * module: client import, single client add, discovery add, enrichment and
 * outbound campaign/outreach sending.
 */

import { createHmac } from "crypto";
import { suppressionMatches, type SuppressionCandidate } from "./account-deletion";

function secret(): string {
  return (
    process.env["INVITE_TOKEN_SECRET"] ??
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
    "sucasa-suppression-dev"
  );
}

/** Keyed, one-way identifier. The input value is never stored anywhere. */
export function identifierHmac(kind: "email" | "phone" | "address", value: string): string {
  return createHmac("sha256", secret()).update(`${kind}:${value}`).digest("hex");
}

export function normalizeEmailKey(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toLowerCase();
  return v.includes("@") ? v : null;
}

export function normalizePhoneKey(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D+/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

/** Street + zip only, collapsed — a coarse secondary factor, never an identity. */
export function normalizeAddressKey(
  street: string | null | undefined,
  zip?: string | null,
): string | null {
  const s = (street ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (s.length < 3) return null;
  return `${s}|${(zip ?? "").trim()}`;
}

export type SuppressionInput = {
  email?: string | null;
  phone?: string | null;
  street?: string | null;
  zip?: string | null;
};

export function candidateFor(input: SuppressionInput): SuppressionCandidate {
  const email = normalizeEmailKey(input.email);
  const phone = normalizePhoneKey(input.phone);
  const address = normalizeAddressKey(input.street, input.zip);
  return {
    emailHmac: email ? identifierHmac("email", email) : null,
    phoneHmac: phone ? identifierHmac("phone", phone) : null,
    addressHmac: address ? identifierHmac("address", address) : null,
  };
}

/**
 * True when this person previously asked to be deleted or opted out. Address is
 * never enough on its own, so a new occupant of the same property is not
 * suppressed.
 */
export async function isSuppressed(admin: any, input: SuppressionInput): Promise<boolean> {
  const candidate = candidateFor(input);
  if (!candidate.emailHmac && !candidate.phoneHmac) return false;

  const ors: string[] = [];
  if (candidate.emailHmac) ors.push(`email_hmac.eq.${candidate.emailHmac}`);
  if (candidate.phoneHmac) ors.push(`phone_hmac.eq.${candidate.phoneHmac}`);

  const { data } = await admin
    .from("deletion_suppressions")
    .select("email_hmac, phone_hmac, address_hmac")
    .or(ors.join(","))
    .limit(10);

  return suppressionMatches((data ?? []) as any[], candidate);
}

/**
 * Split rows into those that may be imported and those the register blocks.
 * Used by every import path so a deleted person is not silently re-created.
 */
export async function partitionSuppressed<T>(
  admin: any,
  rows: ReadonlyArray<T>,
  read: (row: T) => SuppressionInput,
): Promise<{ allowed: T[]; suppressed: T[] }> {
  const allowed: T[] = [];
  const suppressed: T[] = [];
  for (const row of rows) {
    // eslint-disable-next-line no-await-in-loop
    if (await isSuppressed(admin, read(row))) suppressed.push(row);
    else allowed.push(row);
  }
  return { allowed, suppressed };
}

/** Record a suppression entry. Idempotent on either primary identifier. */
export async function recordSuppression(
  admin: any,
  input: SuppressionInput & {
    scope?: string;
    eventType?: string;
    source?: string;
    reason?: string;
  },
): Promise<{ recorded: boolean }> {
  const candidate = candidateFor(input);
  if (!candidate.emailHmac && !candidate.phoneHmac) {
    // Address alone is never a permanent suppression identifier.
    return { recorded: false };
  }

  const row = {
    email_hmac: candidate.emailHmac,
    phone_hmac: candidate.phoneHmac,
    address_hmac: candidate.addressHmac,
    scope: input.scope ?? "all",
    event_type: input.eventType ?? "account_deleted",
    source: input.source ?? "account_settings",
    reason: input.reason ?? null,
  };

  const { error } = await admin.from("deletion_suppressions").insert(row);
  if (error && !/duplicate key|unique/i.test(error.message)) {
    // Retry without the identifier that already exists, so the other one still
    // lands; a repeat deletion must stay idempotent.
    throw new Error(error.message);
  }
  return { recorded: true };
}

/**
 * A person who deleted their account and later signs in again with valid new
 * consent is a NEW consent event, not a silent override of the old account
 * state: the prior suppression identifiers are retired and the fresh consent is
 * recorded as evidence, so the old decision is never reused or quietly lost.
 */
export async function recordConsentAfterSuppression(
  admin: any,
  input: SuppressionInput & { userId?: string | null; source?: string },
): Promise<{ renewed: boolean }> {
  const candidate = candidateFor(input);
  if (!candidate.emailHmac && !candidate.phoneHmac) return { renewed: false };

  const filters: string[] = [];
  if (candidate.emailHmac) filters.push(`email_hmac.eq.${candidate.emailHmac}`);
  if (candidate.phoneHmac) filters.push(`phone_hmac.eq.${candidate.phoneHmac}`);
  const { data: rows } = await admin
    .from("deletion_suppressions")
    .select("id, email_hmac, phone_hmac")
    .or(filters.join(","))
    .limit(10);
  const matches = suppressionMatches((rows ?? []) as any, candidate);
  if (!matches || (rows ?? []).length === 0) return { renewed: false };

  await admin
    .from("deletion_suppressions")
    .delete()
    .in("id", (rows ?? []).map((r: any) => r.id));

  await admin.from("compliance_audit_events").insert({
    category: "privacy",
    action: "consent_renewed_after_deletion",
    actor_user_id: input.userId ?? null,
    detail: "A previously suppressed person gave new consent by creating and using a new account.",
    metadata: {
      source: input.source ?? "new_account",
      subject_email_hmac: candidate.emailHmac,
      subject_phone_hmac: candidate.phoneHmac,
      retired_suppressions: (rows ?? []).length,
      at: new Date().toISOString(),
    },
  });

  return { renewed: true };
}
