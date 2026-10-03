/** Map database guard errors to short, user-facing messages. */
export function teamErrorMessage(raw: string): string {
  if (raw.includes("SEAT_LIMIT_REACHED")) return "All seats on this plan are in use. Upgrade or free a seat first.";
  if (raw.includes("TEAM_FORBIDDEN")) return "Team management is available to branch managers on Branch plans.";
  if (raw.includes("ALREADY_MEMBER")) return "That person is already on your team.";
  if (raw.includes("INVITE_PENDING")) return "An invitation to that email is already pending.";
  if (raw.includes("INVITE_EMAIL_MISMATCH")) return "Sign in with the email address this invitation was sent to.";
  if (raw.includes("INVITE_CLOSED")) return "This invitation is no longer active.";
  if (raw.includes("INVITE_INVALID")) return "This invitation link is not valid.";
  if (raw.includes("CANNOT_REMOVE_OWNER")) return "The account owner can't be removed.";
  if (raw.includes("COLLAB_FORBIDDEN")) return "Only the loan officer who owns this agent relationship, or a branch manager, can change it.";
  return raw;
}

