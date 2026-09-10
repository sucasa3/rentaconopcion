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
 * Channel eligibility is decided server-side and delivered on the queue item
 * (see src/lib/contact-channels.ts). Nothing in this module may re-derive it.
 */
export function hasNoContactRoute(item: { channels?: { available: boolean }[] | null }): boolean {
  return !(item.channels ?? []).some((c) => c.available);
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

/**
 * Distinct homeowners with a recorded touch that falls on today, evaluated in
 * the viewer's own timezone. Counted across the whole book, so a homeowner who
 * correctly leaves the queue after being worked still counts.
 */
export function handledToday(
  outcomes: { clientId: string; occurredAt: string }[],
  now: Date = new Date(),
): number {
  const sameDay = (iso: string) => {
    const d = new Date(iso);
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  };
  const ids = new Set<string>();
  for (const o of outcomes) if (o.occurredAt && sameDay(o.occurredAt)) ids.add(o.clientId);
  return ids.size;
}

export interface DailyRead {
  /** One calm sentence naming who to start with and, when present, who follows. */
  sentence: string;
  startHere: string | null;
  /** Real reason from the engine — never generated here. */
  why: string | null;
  /** The existing agent play, phrased as a service to the homeowner. */
  beUsefulBy: string | null;
  /** Canonical supporting signals, exactly as the card shows them. */
  signals: string[];
}

/** Only the canonical narrative fields the opportunity card already renders. */
export interface DailyReadNarrative {
  whyNow?: string | null;
  whyItMatters?: string | null;
  howToBeUseful?: string | null;
  supportingSignals?: string[] | null;
}

/**
 * The daily read is assembled only from fields the engine already produced.
 * When a canonical narrative is present it is the single source of the copy,
 * so the read and the opportunity card can never disagree. Nothing about the
 * homeowner is invented, inferred or recalculated here.
 */
export function buildDailyRead(
  items: {
    name: string;
    why: string;
    headline: string;
    engagementLine?: string | null;
    narrative?: DailyReadNarrative | null;
  }[],
): DailyRead {
  const first = items[0];
  if (!first) {
    return {
      sentence: "Nothing needs you right now. SuCasa keeps watching your relationships.",
      startHere: null,
      why: null,
      beUsefulBy: null,
      signals: [],
    };
  }
  const second = items[1];
  const sentence = second
    ? `Your book is active today. Start with ${firstName(first.name)}, then ${firstName(second.name)}.`
    : `Your book is active today. Start with ${firstName(first.name)}.`;
  const n = first.narrative ?? null;
  const why =
    [n?.whyNow || first.why, n?.whyItMatters || first.engagementLine].filter(Boolean).join(" · ") ||
    first.why;
  return {
    sentence,
    startHere: first.name,
    why,
    beUsefulBy: n?.howToBeUseful || first.headline,
    signals: (n?.supportingSignals ?? []).slice(0, 3),
  };
}


/**
 * The supporting intelligence lines under the greeting. Every line is dropped
 * unless the underlying number is real and non-zero.
 */
export function intelligenceLines(args: {
  monitored: number;
  engaged: number;
  worthAttention: number;
  tasksDue: number;
}): string[] {
  const lines: string[] = [];
  if (args.engaged > 0)
    lines.push(`${args.engaged} homeowner${args.engaged === 1 ? "" : "s"} engaged recently`);
  if (args.worthAttention > 0)
    lines.push(
      `${args.worthAttention} relationship${args.worthAttention === 1 ? "" : "s"} worth your attention`,
    );
  if (args.tasksDue > 0)
    lines.push(
      `${args.tasksDue} follow-up${args.tasksDue === 1 ? "" : "s"} ${args.tasksDue === 1 ? "is" : "are"} due`,
    );
  lines.push(
    `${args.monitored.toLocaleString()} homeowner${args.monitored === 1 ? "" : "s"} being monitored`,
  );
  return lines;
}
