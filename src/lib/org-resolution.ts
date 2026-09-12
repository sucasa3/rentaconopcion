/**
 * Organization resolution for unresolved institution evidence — pure.
 *
 * RULES
 *  - A provider institution string may resolve automatically to an EXISTING
 *    canonical organization only on an exact normalized legal-name match, or an
 *    explicitly TRUSTED alias match.
 *  - Loose fuzzy similarity never auto-resolves. More than one plausible hit is
 *    `ambiguous` and waits for a human.
 *  - No match stays an unresolved candidate.
 *  - Nothing here ever CREATES an organization. Organizations are canonical in
 *    `lender_orgs` and are only created by a real paid/workspace signup.
 */

export interface OrgCandidate {
  id: string;
  name: string;
}

export interface OrgAlias {
  org_id: string;
  alias_normalized: string;
  trusted: boolean;
}

/** Canonical comparison form: casing, punctuation and legal suffixes removed. */
export function normalizeOrgName(raw: string | null | undefined): string {
  return (raw ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(inc|incorporated|llc|l l c|llp|lp|corp|corporation|co|company|the|dba)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type OrgMatchOutcome = "exact" | "trusted_alias" | "ambiguous" | "none";

export interface OrgResolution {
  outcome: OrgMatchOutcome;
  /** Set only for `exact` / `trusted_alias`: safe to link automatically. */
  orgId: string | null;
  /** Set for `ambiguous`: a person must choose. */
  candidateOrgIds: string[];
}

const NONE: OrgResolution = { outcome: "none", orgId: null, candidateOrgIds: [] };

/**
 * Decide whether an institution string is the same as an existing organization.
 *
 * `orgs` and `aliases` must already be narrowed to plausible rows by the caller;
 * this function only applies the exact/trusted rules.
 */
export function resolveOrganization(
  institutionName: string | null | undefined,
  orgs: OrgCandidate[],
  aliases: OrgAlias[] = [],
): OrgResolution {
  const key = normalizeOrgName(institutionName);
  if (!key) return NONE;

  const exact = orgs.filter((o) => normalizeOrgName(o.name) === key);
  const uniqueExact = Array.from(new Set(exact.map((o) => o.id)));
  if (uniqueExact.length === 1) {
    return { outcome: "exact", orgId: uniqueExact[0]!, candidateOrgIds: uniqueExact };
  }
  if (uniqueExact.length > 1) {
    return { outcome: "ambiguous", orgId: null, candidateOrgIds: uniqueExact };
  }

  const trusted = Array.from(
    new Set(aliases.filter((a) => a.trusted && a.alias_normalized === key).map((a) => a.org_id)),
  );
  if (trusted.length === 1) {
    return { outcome: "trusted_alias", orgId: trusted[0]!, candidateOrgIds: trusted };
  }
  if (trusted.length > 1) {
    return { outcome: "ambiguous", orgId: null, candidateOrgIds: trusted };
  }

  // Untrusted aliases and near-misses are review material, never a link.
  const untrusted = Array.from(
    new Set(aliases.filter((a) => !a.trusted && a.alias_normalized === key).map((a) => a.org_id)),
  );
  if (untrusted.length) {
    return { outcome: "ambiguous", orgId: null, candidateOrgIds: untrusted };
  }

  const near = Array.from(
    new Set(
      orgs
        .filter((o) => {
          const n = normalizeOrgName(o.name);
          return Boolean(n) && (n.startsWith(key) || key.startsWith(n));
        })
        .map((o) => o.id),
    ),
  );
  if (near.length) return { outcome: "ambiguous", orgId: null, candidateOrgIds: near };

  return NONE;
}

/** Only these outcomes may create a graph edge without human review. */
export function isAutoResolvable(outcome: OrgMatchOutcome): boolean {
  return outcome === "exact" || outcome === "trusted_alias";
}
