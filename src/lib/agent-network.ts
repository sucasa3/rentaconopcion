/**
 * Agent Professional Network + Home Team review — pure and client-safe.
 *
 * Two questions, two homes for the answer:
 *   "Has the agent reviewed this client's Home Team?"  -> home_team_review_state
 *   "Who did the agent say the lender is?"             -> relationships
 *
 * Nothing here grants access to anything. An agent action can reach `asserted`
 * at most; `confirmed` belongs to the homeowner and is authoritative over any
 * agent action.
 */
import type { RelationshipStatus } from "./relationships";

export type ReviewDecision = "pending" | "assigned" | "no_lender" | "unknown";

/** Decisions that count as the agent having actually reviewed the record. */
export function isReviewed(decision: ReviewDecision | null | undefined): boolean {
  return decision === "assigned" || decision === "no_lender" || decision === "unknown";
}

/**
 * Skip is explicitly NOT a decision: it moves to the next record and leaves the
 * review state untouched, so it can never inflate progress.
 */
export function skipChangesState(): false {
  return false;
}

export interface ReviewProgress {
  reviewed: number;
  total: number;
}

export function reviewProgress(
  rows: Array<{ decision: ReviewDecision | null; onFileStatus?: RelationshipStatus | null }>,
  total: number,
): ReviewProgress {
  const reviewed = rows.filter((r) => isEffectivelyReviewed(r)).length;
  return { reviewed: Math.min(reviewed, total), total };
}

/**
 * A Home Team is complete either because the agent reviewed it, or because the
 * homeowner already confirmed the lender. The second case is derived, never
 * written as a fake agent review record — otherwise an agent-locked record
 * would make the queue impossible to finish.
 */
export function isEffectivelyReviewed(row: {
  decision?: ReviewDecision | null;
  onFileStatus?: RelationshipStatus | null;
}): boolean {
  return isReviewed(row.decision) || row.onFileStatus === "confirmed";
}

export function progressLabel(p: ReviewProgress): string {
  return `${p.reviewed} of ${p.total} client Home Team${p.total === 1 ? "" : "s"} reviewed`;
}

/** Provider evidence is always phrased as a hint, never as the answer. */
export function suggestionLabel(institution: string): string {
  return `Property data suggests: ${institution}`;
}

// --- What an agent is allowed to change ------------------------------------

export const HOMEOWNER_CONFIRMED_NOTICE =
  "Changes to a homeowner-confirmed lender require homeowner validation.";

/** A homeowner-confirmed lender is never rejected, replaced or overwritten here. */
export function agentMayChangeLender(status: RelationshipStatus | null | undefined): boolean {
  return status !== "confirmed";
}

export type BulkOutcome =
  | "assigned"
  | "unchanged"
  | "blocked_homeowner_confirmed"
  | "not_in_workspace"
  | "error";

export interface BulkResult {
  portfolioClientId: string;
  outcome: BulkOutcome;
  detail?: string;
}

/** Honest reporting: only rows that actually changed are counted as updated. */
export function summarizeBulk(results: BulkResult[]): {
  updated: number;
  blocked: number;
  unchanged: number;
  failed: number;
  message: string;
} {
  const updated = results.filter((r) => r.outcome === "assigned").length;
  const blocked = results.filter(
    (r) => r.outcome === "blocked_homeowner_confirmed" || r.outcome === "not_in_workspace",
  ).length;
  const unchanged = results.filter((r) => r.outcome === "unchanged").length;
  const failed = results.filter((r) => r.outcome === "error").length;

  const parts = [`${updated} Home Team${updated === 1 ? "" : "s"} updated`];
  if (unchanged) parts.push(`${unchanged} already set`);
  if (blocked) parts.push(`${blocked} left alone`);
  if (failed) parts.push(`${failed} failed`);
  return { updated, blocked, unchanged, failed, message: parts.join(" · ") };
}

// --- Contact provenance ----------------------------------------------------

export interface ProfessionalContactSource {
  email_normalized: string | null;
  email_verified: boolean;
  phone_normalized: string | null;
  phone_verified: boolean;
  claim_status: "unclaimed" | "invited" | "claimed";
}

export interface WorkspaceSuppliedContact {
  email?: string | null;
  phone?: string | null;
}

/**
 * Contact details an agent workspace may see.
 *
 * Verified or claimed contact is shared. Otherwise only what THIS workspace
 * supplied is shown back to it — an unverified value typed by another workspace
 * is never exposed, even when both resolve to the same person.
 */
export function visibleProfessionalContact(
  professional: ProfessionalContactSource,
  suppliedByThisWorkspace: WorkspaceSuppliedContact = {},
): { email: string | null; phone: string | null; emailShared: boolean; phoneShared: boolean } {
  const claimed = professional.claim_status === "claimed";
  const emailShared = claimed || professional.email_verified;
  const phoneShared = claimed || professional.phone_verified;
  return {
    email: emailShared
      ? professional.email_normalized
      : (suppliedByThisWorkspace.email ?? null),
    phone: phoneShared
      ? professional.phone_normalized
      : (suppliedByThisWorkspace.phone ?? null),
    emailShared,
    phoneShared,
  };
}

// --- Network list + queue ordering ----------------------------------------

export interface NetworkProfessional {
  id: string;
  full_name: string;
  org_name: string | null;
  roles: string[];
  email: string | null;
  phone: string | null;
  clientCount: number;
  hasSucasaIdentity: boolean;
  needsReview: boolean;
  lastUsedAt: string | null;
}

/** Search + recency ranking so the common case is one tap. */
export function rankProfessionals(
  people: NetworkProfessional[],
  opts: { query?: string; recentIds?: string[] } = {},
): NetworkProfessional[] {
  const q = (opts.query ?? "").trim().toLowerCase();
  const recent = opts.recentIds ?? [];
  const matches = q
    ? people.filter(
        (p) =>
          p.full_name.toLowerCase().includes(q) ||
          (p.org_name ?? "").toLowerCase().includes(q),
      )
    : people.slice();

  return matches.sort((a, b) => {
    const ra = recent.indexOf(a.id);
    const rb = recent.indexOf(b.id);
    if (ra !== rb) return (ra < 0 ? 999 : ra) - (rb < 0 ? 999 : rb);
    if (b.clientCount !== a.clientCount) return b.clientCount - a.clientCount;
    return a.full_name.localeCompare(b.full_name);
  });
}

export interface ReviewQueueItem {
  portfolioClientId: string;
  clientName: string;
  address: string | null;
  suggestions: Array<{ candidateId: string; institution: string; confidence: number | null }>;
  onFile: {
    relationshipId: string;
    professionalId: string;
    professionalName: string;
    status: RelationshipStatus;
  } | null;
  decision: ReviewDecision | null;
}

/** Unreviewed first, records with a usable hint before records without. */
export function orderReviewQueue(items: ReviewQueueItem[]): ReviewQueueItem[] {
  return items.slice().sort((a, b) => {
    const ar = isQueueItemComplete(a) ? 1 : 0;
    const br = isQueueItemComplete(b) ? 1 : 0;
    if (ar !== br) return ar - br;
    const as = a.suggestions.length ? 0 : 1;
    const bs = b.suggestions.length ? 0 : 1;
    if (as !== bs) return as - bs;
    return a.clientName.localeCompare(b.clientName);
  });
}

/** True when this record is locked to agent edits by a homeowner confirmation. */
export function isLockedByHomeowner(item: ReviewQueueItem): boolean {
  return item.onFile?.status === "confirmed";
}
