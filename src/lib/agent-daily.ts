/**
 * Presentation logic for the agent's Today command center.
 *
 * Pure functions only: no ranking rules are invented here. Ordering comes from
 * the existing next-best-action engine; this module only groups, labels and
 * decides which communication affordances may be shown.
 */

export type Channel = "call" | "text" | "email";

export interface DailyItemLike {
  opportunityId: string;
  name: string;
  temperature: "hot" | "warm" | "nurture";
  channel: Channel;
  phone: string | null;
  email: string | null;
  lastOutcome?: string | null;
}

/**
 * Which channels may be offered for a homeowner.
 *
 * A channel is available only when the engine's own decision allows it and the
 * contact detail required for it exists. This mirrors the permission engine —
 * it never widens it.
 */
export function availableChannels(item: DailyItemLike): Channel[] {
  const out: Channel[] = [];
  if (item.phone) {
    if (item.channel === "call") out.push("call");
    if (item.channel === "text") out.push("text");
  }
  if (item.email && item.channel === "email") out.push("email");
  return out;
}

/** True when nothing can be sent or dialed for this homeowner. */
export function hasNoContactRoute(item: DailyItemLike): boolean {
  return availableChannels(item).length === 0;
}

export function firstName(name: string | null | undefined): string {
  const n = (name ?? "").trim().split(/\s+/)[0];
  return n && n.length > 0 ? n : "this homeowner";
}

export interface DailySummary {
  total: number;
  hot: number;
  warm: number;
  nurture: number;
  headline: string;
  supporting: string;
}

/** The one line at the top of Today. */
export function buildSummary(items: DailyItemLike[], tasksDue: number): DailySummary {
  const hot = items.filter((i) => i.temperature === "hot").length;
  const warm = items.filter((i) => i.temperature === "warm").length;
  const nurture = items.filter((i) => i.temperature === "nurture").length;
  const total = items.length;

  const headline =
    total === 0
      ? "You're clear for today"
      : `${total} ${total === 1 ? "person is" : "people are"} worth your attention today`;

  const bits: string[] = [];
  if (hot) bits.push(`${hot} ready now`);
  if (warm) bits.push(`${warm} worth a check-in`);
  if (nurture) bits.push(`${nurture} to stay in touch with`);
  if (tasksDue) bits.push(`${tasksDue} task${tasksDue === 1 ? "" : "s"} due`);

  return {
    total,
    hot,
    warm,
    nurture,
    headline,
    supporting: bits.length
      ? bits.join(" · ")
      : "Nothing needs you right now. SuCasa keeps watching your book.",
  };
}

export type FirstRunMode = "aha" | "empty" | "preparing" | "none";

/**
 * First-run behaviour adapts to the real state of the book: a real homeowner
 * when one is ready, the import state when the book is empty, and a
 * preparation state while enrichment is still running.
 */
export function firstRunMode(args: {
  seen: boolean;
  clientCount: number;
  queueCount: number;
  enrichmentPending: boolean;
}): FirstRunMode {
  if (args.clientCount === 0) return "empty";
  if (args.seen) return "none";
  if (args.queueCount > 0) return "aha";
  if (args.enrichmentPending) return "preparing";
  return "none";
}

/** Confirmation copy shown right after an outcome is recorded. */
export function outcomeAcknowledgement(name: string, stageLabel: string): string {
  return `${stageLabel} — ${firstName(name)} ✓`;
}

/** Copy that hands the agent to their next person. */
export function nextMovePrompt(nextName: string | null): string {
  return nextName
    ? `${firstName(nextName)} is your next best move.`
    : "That's your list for today.";
}
