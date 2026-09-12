/**
 * Professional identity registry — server side.
 *
 * People only. Organizations remain canonical in `lender_orgs`; an unresolved
 * institution string is carried as `org_name_raw` until it can be matched to a
 * real organization.
 *
 * Nothing here grants access to anything: claim and verification state live on
 * the professional record, and homeowner access is decided solely by
 * `classifyLenderAccess()` + `consent_records`.
 */
import {
  normalizeEmail,
  normalizeIdentifier,
  normalizeName,
  normalizePhone,
  resolveProfessional,
  type ProfessionalIdentityInput,
  type ProfessionalRecord,
  type ResolutionResult,
} from "./professionals";
import { logNetworkEvent } from "./network-events.server";

const COLUMNS =
  "id, user_id, org_id, org_name_raw, full_name, email_normalized, email_verified, phone_normalized, phone_verified, nmls_id, license_number, claim_status, verification_status";

/** Narrow candidate set: only records that could plausibly be the same person. */
export async function findProfessionalCandidates(
  admin: any,
  input: ProfessionalIdentityInput,
): Promise<ProfessionalRecord[]> {
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  const nmls = normalizeIdentifier(input.nmlsId);
  const name = normalizeName(input.fullName);

  const filters: string[] = [];
  if (input.userId) filters.push(`user_id.eq.${input.userId}`);
  if (email) filters.push(`email_normalized.eq.${email}`);
  if (phone) filters.push(`phone_normalized.eq.${phone}`);
  if (nmls) filters.push(`nmls_id.eq.${nmls}`);
  if (name) filters.push(`full_name.ilike.${name}`);
  if (!filters.length) return [];

  const { data } = await admin.from("professionals").select(COLUMNS).or(filters.join(",")).limit(50);
  return (data ?? []) as ProfessionalRecord[];
}

export interface ResolveOrCreateResult {
  professional: ProfessionalRecord | null;
  resolution: ResolutionResult;
  created: boolean;
  /** Records a human must disambiguate before anything is merged. */
  possibleDuplicates: ProfessionalRecord[];
}

/**
 * Resolve an identity, creating one only when nothing matches.
 *
 * A `possible` match never merges and never creates silently: the caller is
 * handed the possible duplicates so a person can decide.
 */
export async function resolveOrCreateProfessional(
  admin: any,
  input: ProfessionalIdentityInput & { createdBy?: string | null; roles?: string[] },
  opts: { createOnPossible?: boolean } = {},
): Promise<ResolveOrCreateResult> {
  const candidates = await findProfessionalCandidates(admin, input);
  const resolution = resolveProfessional(candidates, input);

  if (resolution.strength === "strong" && resolution.match) {
    await logNetworkEvent(admin, {
      action: "professional_identity_linked",
      actorUserId: input.createdBy ?? null,
      orgId: input.orgId ?? null,
      entityType: "professional",
      entityId: resolution.match.id,
      detail: `Matched on ${resolution.basis}`,
      metadata: { basis: resolution.basis },
    });
    return { professional: resolution.match, resolution, created: false, possibleDuplicates: [] };
  }

  if (resolution.strength === "possible") {
    await logNetworkEvent(admin, {
      action: "possible_duplicate_detected",
      actorUserId: input.createdBy ?? null,
      orgId: input.orgId ?? null,
      entityType: "professional",
      entityId: resolution.possible[0]?.id ?? null,
      detail: `Possible duplicate on ${resolution.basis}`,
      metadata: { basis: resolution.basis, candidate_ids: resolution.possible.map((p) => p.id) },
    });
    if (!opts.createOnPossible) {
      return {
        professional: null,
        resolution,
        created: false,
        possibleDuplicates: resolution.possible,
      };
    }
  }

  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  const { data, error } = await admin
    .from("professionals")
    .insert({
      user_id: input.userId ?? null,
      org_id: input.orgId ?? null,
      org_name_raw: input.orgNameRaw ?? null,
      roles: input.roles ?? ["loan_officer"],
      full_name: input.fullName.trim(),
      email_normalized: email,
      email_verified: Boolean(input.emailVerified && email),
      phone_normalized: phone,
      phone_verified: Boolean(input.phoneVerified && phone),
      nmls_id: normalizeIdentifier(input.nmlsId),
      license_number: input.licenseNumber ?? null,
      created_by: input.createdBy ?? null,
    })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);

  await logNetworkEvent(admin, {
    action: "professional_identity_created",
    actorUserId: input.createdBy ?? null,
    orgId: input.orgId ?? null,
    entityType: "professional",
    entityId: (data as ProfessionalRecord).id,
    detail: "New professional identity created",
    metadata: { had_possible_duplicates: resolution.strength === "possible" },
  });

  return {
    professional: data as ProfessionalRecord,
    resolution,
    created: true,
    possibleDuplicates: resolution.strength === "possible" ? resolution.possible : [],
  };
}
