/**
 * The daily lender workflow: ranking, urgency, objectives and what happens
 * after an outcome is recorded.
 *
 * Pure and dependency-free so it can be unit tested. Two ideas are kept
 * deliberately separate:
 *
 *   priority     — the existing contact-priority engine. It orders the list.
 *   temperature  — an urgency label that explains the recommendation. It never
 *                  reorders the list.
 *
 * Nothing here sends anything. Every next step is administrative: a task, a
 * schedule, a prepared draft, a cadence change. Outbound contact always
 * requires the lender to act, on a permitted channel.
 */

export type Temperature = "hot" | "warm" | "nurture";

export interface UrgencyInput {
  askedToConnect: boolean;
  priority: number;
  daysSinceContact: number | null;
  followUpOverdueDays: number | null;
  annualReviewDue: boolean;
  engagedRecently: boolean;
  hasReview: boolean;
}

export interface Urgency {
  temperature: Temperature;
  /** One short line explaining the label, in the lender's terms. */
  urgencyReason: string;
}

/** Urgency label. Explains *how soon*, not *how important*. */
export function urgencyFor(i: UrgencyInput): Urgency {
  if (i.askedToConnect)
    return { temperature: "hot", urgencyReason: "They asked to hear from you" };
  if (i.followUpOverdueDays != null && i.followUpOverdueDays > 0)
    return {
      temperature: "hot",
      urgencyReason: `Follow-up is ${i.followUpOverdueDays} day${i.followUpOverdueDays === 1 ? "" : "s"} overdue`,
    };
  if (i.engagedRecently && i.hasReview)
    return { temperature: "hot", urgencyReason: "They engaged recently — the timing is live" };
  if (i.priority >= 72) return { temperature: "hot", urgencyReason: "Several signals landed at once" };
  if (i.annualReviewDue && (i.daysSinceContact == null || i.daysSinceContact >= 300))
    return { temperature: "warm", urgencyReason: "Annual review is due" };
  if (i.priority >= 45 || i.engagedRecently)
    return { temperature: "warm", urgencyReason: "Worth a touch this week" };
  return { temperature: "nurture", urgencyReason: "Keep monitoring — no rush" };
}

export interface RankInput {
  askedToConnect: boolean;
  contactable: boolean;
  priority: number;
}

/**
 * Daily ordering.
 *
 * 1. Homeowners who asked to connect, always first.
 * 2. Everyone else by the existing priority engine.
 *
 * A record with no permitted channel is pushed back but not removed: it only
 * displaces a contactable homeowner when it is clearly more important.
 */
export const UNCONTACTABLE_PENALTY = 25;

export function rankScore(i: RankInput): number {
  return i.priority - (i.contactable ? 0 : UNCONTACTABLE_PENALTY);
}

export function compareDaily(a: RankInput, b: RankInput): number {
  if (a.askedToConnect !== b.askedToConnect) return a.askedToConnect ? -1 : 1;
  return rankScore(b) - rankScore(a);
}

/** What the lender is trying to achieve on this call, by review type. */
const OBJECTIVES: Record<string, string> = {
  equity_review: "Share the updated equity picture and ask what they're planning",
  equity_milestone: "Walk through what the change in equity means for their options",
  home_equity_conversation: "Understand whether a project or expense is coming up",
  mortgage_checkup: "Review the current mortgage together and answer questions",
  refinance_review: "Compare the current loan with what's available today",
  move_planning: "Find out whether a move is on the table in the next year",
  improvement_planning: "Talk through upcoming projects and how they'd fund them",
  property_change: "Confirm what changed at the property and offer help",
  ownership_anniversary: "Mark the anniversary and offer a no-pressure check-in",
  value_milestone: "Share the updated value and invite questions",
};

export function objectiveFor(reviewType: string | null | undefined): string {
  return (
    (reviewType ? OBJECTIVES[reviewType] : null) ??
    "Reconnect, share their home update, and find out what's changed"
  );
}

/** Suggested first line. Warm, factual, never a product pitch. */
export function openerFor(i: {
  firstName: string;
  askedToConnect: boolean;
  reviewType: string | null | undefined;
}): string {
  const name = i.firstName || "there";
  if (i.askedToConnect)
    return `Hi ${name} — thanks for reaching out through SuCasa. I've pulled up the latest information on your home so we can pick up right where your question left off.`;
  if (i.reviewType === "equity_review" || i.reviewType === "equity_milestone")
    return `Hi ${name} — I was reviewing the updated information on your home and your estimated equity has changed meaningfully. I thought it might be useful to send the update and see if anything has changed with your plans.`;
  if (i.reviewType === "ownership_anniversary")
    return `Hi ${name} — congratulations on another year in the home. I put together your updated home and estimated equity snapshot in case it's useful for your planning.`;
  if (i.reviewType === "property_change")
    return `Hi ${name} — I noticed some recent activity at the property and wanted to check in and see how things are going.`;
  return `Hi ${name} — your latest Home Intelligence update is ready. Nothing you need to do, but I thought it might be a good time for a no-pressure homeownership check-in.`;
}

export type OutcomeStage =
  | "no_answer"
  | "talked"
  | "appointment"
  | "application"
  | "in_process"
  | "closed"
  | "not_interested"
  | "follow_up";

export interface NextStep {
  /** Short administrative task SuCasa schedules for the lender. */
  nextStep: string;
  /** Days from now the task is due. */
  dueInDays: number;
  /** Stop suggesting new prospecting reviews for this relationship. */
  suppressProspecting: boolean;
  /** Relationship cadence after this outcome. */
  cadence: "active" | "in_process" | "post_close" | "paused";
  /** Plain-language confirmation shown to the lender. */
  confirmation: string;
}

/**
 * One outcome logged → SuCasa handles the administrative work. Never a message
 * that goes out on its own.
 */
export function nextStepFor(stage: OutcomeStage, opts: { followUpDays?: number } = {}): NextStep {
  switch (stage) {
    case "no_answer":
      return {
        nextStep: "Try again on a permitted channel",
        dueInDays: 2,
        suppressProspecting: false,
        cadence: "active",
        confirmation: "Scheduled a second attempt in 2 days and kept them near the top of your list.",
      };
    case "talked":
      return {
        nextStep: "Set the next touch and note what you learned",
        dueInDays: 7,
        suppressProspecting: false,
        cadence: "active",
        confirmation: "Noted the conversation and scheduled the next touch for a week out.",
      };
    case "appointment":
      return {
        nextStep: "Prepare for the scheduled review",
        dueInDays: 3,
        suppressProspecting: true,
        cadence: "active",
        confirmation: "Added review prep to your list and paused other prompts for them.",
      };
    case "application":
      return {
        nextStep: "Support the application and confirm next documents",
        dueInDays: 2,
        suppressProspecting: true,
        cadence: "in_process",
        confirmation: "Moved them into your in-process workflow and stopped prospecting prompts.",
      };
    case "in_process":
      return {
        nextStep: "Check in on progress",
        dueInDays: 7,
        suppressProspecting: true,
        cadence: "in_process",
        confirmation: "Scheduled a progress check-in and kept prospecting prompts off.",
      };
    case "closed":
      return {
        nextStep: "Post-close thank you, then annual relationship cadence",
        dueInDays: 14,
        suppressProspecting: true,
        cadence: "post_close",
        confirmation: "Moved them into your post-close cadence — they stay in your book.",
      };
    case "not_interested":
      return {
        nextStep: "Pause outreach and revisit later",
        dueInDays: 180,
        suppressProspecting: true,
        cadence: "paused",
        confirmation: "Paused outreach for them and removed them from today's list.",
      };
    case "follow_up":
    default:
      return {
        nextStep: "Follow up",
        dueInDays: Math.max(1, Math.round(opts.followUpDays ?? 30)),
        suppressProspecting: false,
        cadence: "active",
        confirmation: `Scheduled a follow-up in ${Math.max(1, Math.round(opts.followUpDays ?? 30))} days.`,
      };
  }
}

/** Stages that mean this relationship should not receive prospecting prompts. */
export const SUPPRESSED_STAGES: OutcomeStage[] = [
  "appointment",
  "application",
  "in_process",
  "closed",
  "not_interested",
];
