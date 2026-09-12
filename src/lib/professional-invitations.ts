/**
 * Professional invitations and homeowner relationship validation — pure rules.
 *
 * Three lifecycles meet here and must never be collapsed into one:
 *
 *  1. INVITATION  — "SuCasa asked this person to join." Lives in
 *     `professional_invitations`. Changing it never changes a relationship.
 *  2. IDENTITY    — "this person proved they are them." Lives in
 *     `professionals` (claim + per-channel verification).
 *  3. ACCESS      — "may this person see this homeowner?" Decided ONLY by
 *     `classifyLenderAccess()` + `consent_records`.
 *
 * An invitation being sent, accepted or claimed grants no homeowner access at
 * all, and an agent's assertion is never a homeowner's confirmation.
 */

export const INVITATION_STATUSES = ["pending", "sent", "accepted", "declined", "revoked"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export type InvitationContext = "agent_invites_professional";

export interface InvitationRow {
  id: string;
  invitation_context: InvitationContext;
  inviter_org_id: string;
  invited_professional_id: string;
  invited_email_normalized: string;
  related_resource_relationship_id: string | null;
  status: InvitationStatus;
  sent_at: string | null;
  last_sent_at: string | null;
  send_count: number;
  accepted_at: string | null;
  accepted_by_user_id: string | null;
  declined_at: string | null;
  revoked_at: string | null;
  expires_at: string;
}

/**
 * Expiry is a property of the clock, not of a cleanup job.
 *
 * A row still labelled `sent` whose `expires_at` has passed is expired, so no
 * background process is load-bearing for security.
 */
export function isExpired(
  row: Pick<InvitationRow, "expires_at">,
  now: number = Date.now(),
): boolean {
  const t = Date.parse(row.expires_at);
  return Number.isFinite(t) && now > t;
}

/** Live = still awaiting an answer. Only one of these may exist per workspace + person. */
export function isActiveInvitation(
  row: Pick<InvitationRow, "status" | "expires_at">,
  now: number = Date.now(),
): boolean {
  return (row.status === "pending" || row.status === "sent") && !isExpired(row, now);
}

/** What the Professional Network shows. Honest about state, silent about clients. */
export type InvitationDisplayState =
  | "not_invited"
  | "invitation_sent"
  | "on_sucasa"
  | "declined"
  | "expired"
  | "revoked";

export function invitationDisplayState(
  row: Pick<InvitationRow, "status" | "expires_at"> | null | undefined,
  professional: { claim_status?: string | null } = {},
  now: number = Date.now(),
): InvitationDisplayState {
  // A claimed identity is the strongest fact, whoever invited them.
  if (professional.claim_status === "claimed") return "on_sucasa";
  if (!row) return "not_invited";
  if (row.status === "accepted") return "on_sucasa";
  if (row.status === "declined") return "declined";
  if (row.status === "revoked") return "revoked";
  if (isExpired(row, now)) return "expired";
  return "invitation_sent";
}

export const INVITATION_STATE_LABEL: Record<InvitationDisplayState, string> = {
  not_invited: "Invite to SuCasa",
  invitation_sent: "Invitation sent",
  on_sucasa: "On SuCasa",
  declined: "Declined",
  expired: "Invitation expired",
  revoked: "Invitation revoked",
};

/** Resend is offered only where an answer is still possible or the link lapsed. */
export function mayResend(state: InvitationDisplayState): boolean {
  return state === "invitation_sent" || state === "expired";
}

// ---------------------------------------------------------------------------
// Claiming
// ---------------------------------------------------------------------------

export type ClaimDecision =
  | { outcome: "claim"; professionalId: string }
  | { outcome: "already_claimed_by_you"; professionalId: string }
  | { outcome: "wrong_account"; invitedEmail: string }
  | { outcome: "email_not_verified"; invitedEmail: string }
  | { outcome: "invitation_unavailable"; state: InvitationDisplayState }
  | { outcome: "reconciliation_required"; why: "professional_linked_elsewhere" | "user_linked_elsewhere" };

export interface ClaimContext {
  invitation: Pick<InvitationRow, "status" | "expires_at" | "invited_email_normalized"> & {
    invited_professional_id: string;
  };
  /** The signed-in user. */
  authUserId: string | null;
  authEmail: string | null;
  /** Whether the auth provider itself confirmed that address. */
  authEmailVerified: boolean;
  /** user_id currently on the invited professional row, if any. */
  professionalUserId: string | null;
  /** A different professional row this user is already linked to, if any. */
  usersOtherProfessionalId?: string | null;
  now?: number;
}

/**
 * Who may claim an invited professional identity.
 *
 * "The email was delivered" is not proof of anything: the accepting user must
 * be signed in with that same address, and the auth provider must have verified
 * it. Identities are never silently merged.
 */
export function decideClaim(ctx: ClaimContext): ClaimDecision {
  const now = ctx.now ?? Date.now();
  const invitedEmail = ctx.invitation.invited_email_normalized;
  const professionalId = ctx.invitation.invited_professional_id;

  // Idempotent success: this user already holds this identity.
  if (ctx.authUserId && ctx.professionalUserId === ctx.authUserId) {
    return { outcome: "already_claimed_by_you", professionalId };
  }

  if (!isActiveInvitation(ctx.invitation, now)) {
    return {
      outcome: "invitation_unavailable",
      state: invitationDisplayState(ctx.invitation, {}, now),
    };
  }
  if (!ctx.authUserId) return { outcome: "wrong_account", invitedEmail };

  const email = (ctx.authEmail ?? "").trim().toLowerCase();
  if (!email || email !== invitedEmail) return { outcome: "wrong_account", invitedEmail };
  if (!ctx.authEmailVerified) return { outcome: "email_not_verified", invitedEmail };

  if (ctx.professionalUserId && ctx.professionalUserId !== ctx.authUserId) {
    return { outcome: "reconciliation_required", why: "professional_linked_elsewhere" };
  }
  if (ctx.usersOtherProfessionalId && ctx.usersOtherProfessionalId !== professionalId) {
    return { outcome: "reconciliation_required", why: "user_linked_elsewhere" };
  }

  return { outcome: "claim", professionalId };
}

/**
 * What accepting an EMAIL invitation proves.
 *
 * Exactly one channel: the email address that was actually signed in and
 * verified. Phone, NMLS, licence and organization remain unproven facts.
 */
export function claimVerificationPatch(): {
  claim_status: "claimed";
  email_verified: true;
} {
  return { claim_status: "claimed", email_verified: true };
}

export const CLAIM_DOES_NOT_VERIFY = [
  "phone_verified",
  "nmls_verified",
  "license_verified",
  "organization_verified",
] as const;

// ---------------------------------------------------------------------------
// Homeowner validation — two separate questions
// ---------------------------------------------------------------------------

/** Step A: is this true? Answering it is not a permission. */
export type ValidationAnswer = "yes" | "no" | "not_sure";

export interface ValidationEffect {
  /** How the relationship edge should move, if at all. */
  relationship: "confirm" | "reject" | "unchanged";
  /** Recorded outcome for the homeowner's answer. */
  recorded: "confirmed" | "rejected" | "unknown";
  /** Never true: relationship truth is not data permission. */
  grantsAccess: false;
  /** Whether it makes sense to then ask the optional connection question. */
  offerConnection: boolean;
}

export function validationEffect(answer: ValidationAnswer): ValidationEffect {
  switch (answer) {
    case "yes":
      return {
        relationship: "confirm",
        recorded: "confirmed",
        grantsAccess: false,
        offerConnection: true,
      };
    case "no":
      // Rejected, but provenance and history are kept, never deleted.
      return {
        relationship: "reject",
        recorded: "rejected",
        grantsAccess: false,
        offerConnection: false,
      };
    default:
      // "I'm not sure" answers the survey, not the relationship.
      return {
        relationship: "unchanged",
        recorded: "unknown",
        grantsAccess: false,
        offerConnection: false,
      };
  }
}

/** Step B: the separate, opt-in connection. Nothing is pre-selected. */
export const CONNECTION_SCOPE_CHOICES = [
  { scope: "contact", label: "My name and contact details" },
  { scope: "property_snapshot", label: "Basic facts about my home" },
  { scope: "valuation", label: "My estimated home value" },
  { scope: "mortgage", label: "My mortgage details" },
  { scope: "equity", label: "My estimated equity" },
] as const;

export interface ConnectionChoice {
  connect: boolean;
  scopes: string[];
}

const ALLOWED_SCOPES = new Set(CONNECTION_SCOPE_CHOICES.map((c) => c.scope as string));

/**
 * Only what the homeowner affirmatively selected is recorded, and declining
 * writes no consent at all. Accepting a Home Team connection is never marketing
 * permission.
 */
export function connectionConsent(choice: ConnectionChoice): {
  grant: boolean;
  scopes: string[];
  consentType: "connection_request";
} {
  if (!choice.connect) return { grant: false, scopes: [], consentType: "connection_request" };
  const scopes = choice.scopes.filter((s) => ALLOWED_SCOPES.has(s));
  return { grant: true, scopes, consentType: "connection_request" };
}
