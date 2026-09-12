/**
 * Conservative professional entity resolution — pure and client-safe.
 *
 * `professionals` holds PEOPLE. Organizations stay canonical in `lender_orgs`.
 *
 * Resolution is deliberately cautious: it would rather hand back a reviewable
 * possible duplicate than merge two different people. Only an existing account
 * link, an NMLS/licence match, or an individually VERIFIED email/phone is
 * strong enough to link automatically.
 */

export type ProfessionalRole = "loan_officer" | "closing_professional";

export interface ProfessionalRecord {
  id: string;
  user_id: string | null;
  org_id: string | null;
  org_name_raw: string | null;
  full_name: string;
  email_normalized: string | null;
  email_verified: boolean;
  phone_normalized: string | null;
  phone_verified: boolean;
  nmls_id: string | null;
  license_number: string | null;
  license_state: string | null;
  claim_status: "unclaimed" | "invited" | "claimed";
  verification_status: "unverified" | "pending" | "verified";
}

export interface ProfessionalIdentityInput {
  userId?: string | null;
  fullName: string;
  email?: string | null;
  emailVerified?: boolean;
  phone?: string | null;
  phoneVerified?: boolean;
  nmlsId?: string | null;
  licenseNumber?: string | null;
  /** Issuing jurisdiction. A licence number is only strong WITH its state. */
  licenseState?: string | null;
  orgId?: string | null;
  orgNameRaw?: string | null;
}

export function normalizeEmail(email: string | null | undefined): string | null {
  const v = (email ?? "").trim().toLowerCase();
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v) ? v : null;
}

export function normalizePhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return local.length === 10 ? local : null;
}

export function normalizeName(name: string | null | undefined): string {
  return (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Two-letter jurisdiction code, or null when absent/unusable. */
export function normalizeLicenseState(value: string | null | undefined): string | null {
  const v = (value ?? "").replace(/[^a-z]/gi, "").toUpperCase();
  return v.length === 2 ? v : null;
}

export function normalizeIdentifier(value: string | null | undefined): string | null {
  const v = (value ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  return v.length >= 4 ? v : null;
}

/** Generic mailboxes that are shared by a whole office — never strong evidence. */
const SHARED_MAILBOXES = new Set([
  "info",
  "office",
  "team",
  "hello",
  "contact",
  "admin",
  "sales",
  "support",
  "loans",
  "mortgage",
  "help",
  "noreply",
  "no-reply",
]);

export function isSharedMailbox(email: string | null): boolean {
  if (!email) return false;
  const local = email.split("@")[0] ?? "";
  return SHARED_MAILBOXES.has(local);
}

export type MatchStrength = "strong" | "possible" | "none";

export interface ResolutionResult {
  strength: MatchStrength;
  /** Set for a strong match: link to this record. */
  match: ProfessionalRecord | null;
  /** Set for a possible match: needs human confirmation before merging. */
  possible: ProfessionalRecord[];
  /** Which signal decided it, for the audit event. */
  basis:
    | "user_id"
    | "nmls"
    | "license_and_state"
    | "verified_email"
    | "verified_phone"
    | "name_and_org"
    | "license_without_state"
    | "unverified_contact"
    | "none";
}

/**
 * Decide whether an identity already exists.
 *
 * Strong (auto-link):   account link, NMLS, licence, individually verified
 *                       email or phone that is not a shared mailbox.
 * Possible (review):    name + organization, or unverified/shared contact.
 */
export function resolveProfessional(
  candidates: ProfessionalRecord[],
  input: ProfessionalIdentityInput,
): ResolutionResult {
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  const nmls = normalizeIdentifier(input.nmlsId);
  const license = normalizeIdentifier(input.licenseNumber);
  const licenseState = normalizeLicenseState(input.licenseState);
  const name = normalizeName(input.fullName);

  const none: ResolutionResult = { strength: "none", match: null, possible: [], basis: "none" };
  if (!candidates.length) return none;

  if (input.userId) {
    const hit = candidates.find((c) => c.user_id && c.user_id === input.userId);
    if (hit) return { strength: "strong", match: hit, possible: [], basis: "user_id" };
  }
  if (nmls) {
    const hit = candidates.find((c) => normalizeIdentifier(c.nmls_id) === nmls);
    if (hit) return { strength: "strong", match: hit, possible: [], basis: "nmls" };
  }
  if (license) {
    const sameLicense = candidates.filter((c) => normalizeIdentifier(c.license_number) === license);
    if (sameLicense.length) {
      // Licence numbers are only unique within a jurisdiction. Without a state
      // on both sides, a match is reviewable evidence, never an auto-merge.
      const sameState = sameLicense.filter(
        (c) => licenseState && normalizeLicenseState(c.license_state) === licenseState,
      );
      if (sameState.length === 1) {
        return { strength: "strong", match: sameState[0]!, possible: [], basis: "license_and_state" };
      }
      return {
        strength: "possible",
        match: null,
        possible: sameState.length ? sameState : sameLicense,
        basis: "license_without_state",
      };
    }
  }
  if (email && input.emailVerified && !isSharedMailbox(email)) {
    const hit = candidates.find((c) => c.email_verified && c.email_normalized === email);
    if (hit) return { strength: "strong", match: hit, possible: [], basis: "verified_email" };
  }
  if (phone && input.phoneVerified) {
    const hit = candidates.find((c) => c.phone_verified && c.phone_normalized === phone);
    if (hit) return { strength: "strong", match: hit, possible: [], basis: "verified_phone" };
  }

  // Everything below is reviewable, never an automatic merge.
  const contactish = candidates.filter(
    (c) =>
      (email && c.email_normalized === email) ||
      (phone && c.phone_normalized === phone),
  );
  if (contactish.length) {
    return { strength: "possible", match: null, possible: contactish, basis: "unverified_contact" };
  }

  const sameName = candidates.filter((c) => normalizeName(c.full_name) === name);
  if (sameName.length) {
    const sameOrg = sameName.filter(
      (c) =>
        (input.orgId && c.org_id === input.orgId) ||
        (input.orgNameRaw &&
          c.org_name_raw &&
          normalizeName(c.org_name_raw) === normalizeName(input.orgNameRaw)),
    );
    return {
      strength: "possible",
      match: null,
      possible: sameOrg.length ? sameOrg : sameName,
      basis: "name_and_org",
    };
  }

  return none;
}
