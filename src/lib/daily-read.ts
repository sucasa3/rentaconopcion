/**
 * SuCasa Daily Read — pure presentation and eligibility logic for the morning
 * email sent to Agents and Lenders.
 *
 * This module scores nothing and detects nothing. Every item handed to it was
 * already produced by the canonical engines (the agent action queue and the
 * gated lender workspace), so the email can never disagree with Today about
 * why a homeowner matters.
 *
 * Two responsibilities only:
 *  1. Decide whether an email is worth sending at all (three states).
 *  2. Decide which surfaced signals are genuinely NEW, using a stable
 *     fingerprint over the canonical opportunity — never "this homeowner
 *     already appeared once".
 */

export type DailyReadAudience = "agent" | "lender";
export type DailyReadTemperature = "hot" | "warm" | "nurture";

/**
 * "baseline" is the first-ever Daily Read: the existing book is discovered, not
 * new activity. "none" means send nothing at all.
 */
export type DailyReadState = "baseline" | "new_signals" | "unresolved" | "none";

export type DailyReadSuppression =
  | "preference_off"
  | "nothing_to_act_on"
  | "already_sent_today"
  | "unresolved_cooldown"
  | "unresolved_repeats_without_value";

export interface DailyReadItem {
  clientId: string;
  opportunityId: string | null;
  name: string;
  /** Group key (agent) or review type (lender). Never a loan product for agents. */
  categoryKey: string;
  categoryLabel: string;
  temperature: DailyReadTemperature;
  /** Canonical rank from the engine. Never recomputed here. */
  rank: number;
  /**
   * Canonical `homeowner_opportunities.strength` as stored by the engine
   * ("strong" | "moderate" | "emerging"). Read, never recomputed.
   */
  strength: string;
  /** Canonical why-now text, exactly as Today shows it. */
  reason: string;
  /** Canonical suggested next step. */
  nextStep: string;
  /** Deep link into the professional's own workspace. */
  href: string;
  fingerprint: string;
  isNew: boolean;
}

// ---------------------------------------------------------------------------
// Quality threshold — which canonical opportunities are worth an email
// ---------------------------------------------------------------------------

/**
 * The only canonical strength value that counts as strong. It is the engine's
 * own stored `strength` (see `bandStrength` in src/lib/opportunities.ts, score
 * >= 70). No email-only score or confidence system exists.
 */
export const DAILY_READ_STRONG_STRENGTH = "strong";

/**
 * A relationship earns a place in the Daily Read when the canonical engine
 * already marked it urgent, or when a genuinely new signal arrives at the
 * engine's own strong strength. Everything else is routine work that belongs in
 * Today, not in an inbox.
 */
export function passesDailyReadThreshold(item: {
  temperature: DailyReadTemperature;
  strength: string;
  isNew: boolean;
}): boolean {
  if (item.temperature === "hot" || item.temperature === "warm") return true;
  return item.isNew && item.strength === DAILY_READ_STRONG_STRENGTH;
}

/** A featured card is only renderable with a name, a reason and a next step. */
export function isFeaturable(item: {
  name?: string | null;
  reason?: string | null;
  nextStep?: string | null;
}): boolean {
  return Boolean(item.name?.trim() && item.reason?.trim() && item.nextStep?.trim());
}

// ---------------------------------------------------------------------------
// Stable signal identity
// ---------------------------------------------------------------------------

/** Small, stable, dependency-free hash (FNV-1a). Deterministic across runs. */
export function hashText(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const TEMPERATURE_RANK: Record<DailyReadTemperature, number> = {
  nurture: 1,
  warm: 2,
  hot: 3,
};

function normalizeReason(reason: string): string {
  return reason.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Identity of one surfaced signal: the homeowner, the canonical opportunity
 * category, the canonical reason, and the urgency at the time of surfacing.
 *
 * The first three segments are the signal itself; the trailing temperature lets
 * an escalation be recognised without re-inventing the opportunity.
 */
export function signalFingerprint(input: {
  clientId: string;
  categoryKey: string;
  reason: string;
  temperature: DailyReadTemperature;
}): string {
  return [
    input.clientId,
    input.categoryKey,
    hashText(normalizeReason(input.reason)),
    input.temperature,
  ].join("|");
}

/** The signal identity without its urgency, used to recognise the same signal. */
export function fingerprintBaseKey(fingerprint: string): string {
  return fingerprint.split("|").slice(0, 3).join("|");
}

function temperatureOf(fingerprint: string): number {
  const t = fingerprint.split("|")[3] as DailyReadTemperature | undefined;
  return t ? (TEMPERATURE_RANK[t] ?? 0) : 0;
}

/**
 * Marks each item new or not against everything ever surfaced to this
 * professional in this role.
 *
 * NEW when:
 *  - this exact signal has never been surfaced before, or
 *  - it has, but the urgency has since increased.
 *
 * Not new when the same homeowner, same opportunity and same canonical reason
 * were already surfaced — regardless of how long ago that was. Time windows
 * govern send frequency, never what counts as new.
 */
export function markNewItems<T extends { fingerprint: string }>(
  items: T[],
  seenFingerprints: string[],
): (T & { isNew: boolean })[] {
  const highestSeen = new Map<string, number>();
  for (const fp of seenFingerprints) {
    const key = fingerprintBaseKey(fp);
    highestSeen.set(key, Math.max(highestSeen.get(key) ?? 0, temperatureOf(fp)));
  }
  return items.map((item) => {
    const key = fingerprintBaseKey(item.fingerprint);
    const seen = highestSeen.get(key);
    const isNew = seen === undefined || temperatureOf(item.fingerprint) > seen;
    return { ...item, isNew };
  });
}

/**
 * Identity of an unresolved *set*, so a quiet-day email cannot repeat the same
 * people with the same wording over and over.
 */
export function unresolvedSetHash(items: { fingerprint: string }[]): string {
  const keys = items.map((i) => fingerprintBaseKey(i.fingerprint)).sort();
  return hashText(keys.join("~"));
}

// ---------------------------------------------------------------------------
// Eligibility — the quality threshold
// ---------------------------------------------------------------------------

export const UNRESOLVED_COOLDOWN_DAYS = 3;

export interface PriorSend {
  sendDate: string;
  state: Exclude<DailyReadState, "none">;
  unresolvedHash: string | null;
}

export interface DailyReadDecision {
  state: DailyReadState;
  reason: DailyReadSuppression | "first_run_baseline" | "new_intelligence" | "unresolved_work";
  newCount: number;
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * The one decision function. SuCasa would rather send fewer high-value Daily
 * Reads than train professionals to ignore it.
 */
export function shouldSendDailyRead(input: {
  enabled: boolean;
  today: string;
  items: { isNew: boolean; fingerprint: string }[];
  priorSends: PriorSend[];
  /**
   * False only before anything has ever been surfaced to this professional in
   * this role. The existing backlog is then discovery, not today's activity.
   */
  hasHistory?: boolean;
}): DailyReadDecision {
  const newCount = input.items.filter((i) => i.isNew).length;
  const none = (reason: DailyReadSuppression): DailyReadDecision => ({
    state: "none",
    reason,
    newCount,
  });

  if (!input.enabled) return none("preference_off");
  if (input.priorSends.some((s) => s.sendDate === input.today)) return none("already_sent_today");
  if (!input.items.length) return none("nothing_to_act_on");

  const hasHistory = input.hasHistory ?? input.priorSends.length > 0;
  if (!hasHistory) {
    return { state: "baseline", reason: "first_run_baseline", newCount };
  }

  if (newCount > 0) return { state: "new_signals", reason: "new_intelligence", newCount };

  // Quiet day: worthwhile unresolved work only.
  const lastUnresolved = input.priorSends
    .filter((s) => s.state === "unresolved")
    .sort((a, b) => b.sendDate.localeCompare(a.sendDate))[0];

  if (lastUnresolved) {
    if (daysBetween(input.today, lastUnresolved.sendDate) < UNRESOLVED_COOLDOWN_DAYS) {
      return none("unresolved_cooldown");
    }
    if (lastUnresolved.unresolvedHash === unresolvedSetHash(input.items)) {
      return none("unresolved_repeats_without_value");
    }
  }
  return { state: "unresolved", reason: "unresolved_work", newCount };
}

// ---------------------------------------------------------------------------
// Morning delivery
// ---------------------------------------------------------------------------

export const DEFAULT_DAILY_READ_TIMEZONE = "America/New_York";
export const DAILY_READ_LOCAL_HOUR = 7;

/** The recipient's local hour, daylight-saving aware. */
export function localHourIn(timezone: string, now: Date = new Date()): number {
  try {
    const hour = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).format(now);
    return Number.parseInt(hour, 10) % 24;
  } catch {
    return localHourIn(DEFAULT_DAILY_READ_TIMEZONE, now);
  }
}

/** Local calendar date in the recipient's timezone (YYYY-MM-DD). */
export function localDateIn(timezone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return localDateIn(DEFAULT_DAILY_READ_TIMEZONE, now);
  }
}

/** Delivered in the professional's own morning, not a fixed UTC hour. */
export function isDeliveryHour(
  timezone: string | null | undefined,
  now: Date = new Date(),
  hour: number = DAILY_READ_LOCAL_HOUR,
): boolean {
  return localHourIn(timezone || DEFAULT_DAILY_READ_TIMEZONE, now) === hour;
}

// ---------------------------------------------------------------------------
// Role-correct grouping
// ---------------------------------------------------------------------------

/**
 * Canonical opportunity categories that are lender-only. They never appear in
 * an agent Daily Read, in any wording.
 */
export const LENDER_ONLY_CATEGORIES = new Set([
  "heloc",
  "refinance_review",
  "mortgage_review",
  "mortgage_age",
]);

export const AGENT_GROUPS = [
  "engagement",
  "requested",
  "permit_activity",
  "value_change",
  "equity_position",
  "no_value_update",
  "market_activity",
  "home_care",
  "recent_purchase",
  "lifecycle",
  "follow_up",
] as const;

export type AgentGroup = (typeof AGENT_GROUPS)[number];

/**
 * Factual descriptions of what SuCasa knows. No label predicts what a homeowner
 * will do, and none is vaguer than the canonical fact behind it.
 */
export const AGENT_GROUP_LABEL: Record<AgentGroup, string> = {
  engagement: "New homeowner engagement",
  requested: "Homeowner asked for help",
  permit_activity: "Permit activity recorded",
  value_change: "Home value or equity changed",
  equity_position: "Long tenure with significant equity",
  no_value_update: "No recent home-value update",
  market_activity: "Neighborhood market activity",
  home_care: "Home care recommendation due",
  recent_purchase: "Recent purchase on record",
  lifecycle: "Ownership milestone",
  follow_up: "Relationship follow-up overdue",
};

/**
 * The canonical narrative play the engine chose for this homeowner — the same
 * story the "why now" sentence comes from. Grouping on the play is what keeps
 * the category summary and the reason describing the same fact.
 */
const AGENT_PLAY_GROUP: Record<string, AgentGroup> = {
  requested: "requested",
  requested_financing: "requested",
  move_up: "equity_position",
  home_value_update: "no_value_update",
  market_update: "market_activity",
  improvements: "permit_activity",
  home_care: "home_care",
  new_homeowner: "recent_purchase",
  milestone: "lifecycle",
  check_in: "follow_up",
};

const AGENT_CATEGORY_GROUP: Record<string, AgentGroup> = {
  market_timing: "market_activity",
  permit_activity: "permit_activity",
  equity: "value_change",
  free_and_clear: "value_change",
  move_up: "equity_position",
  investment: "equity_position",
  home_condition: "home_care",
  recent_purchase: "recent_purchase",
};

/**
 * Standing home-care work is real, but it is not news: it lives in Today and in
 * the homeowner's own Home Care plan rather than in a morning email.
 */
export const DAILY_READ_EXCLUDED_GROUPS = new Set<AgentGroup>(["home_care"]);

/**
 * Maps a canonical opportunity to the agent-facing group, or null when the
 * category is lender-only and must not be shown to an agent at all. The
 * narrative play wins, because it is the story whose reason the email prints.
 */
export function agentGroupFor(
  category: string,
  opts: { engagedRecently?: boolean; play?: string | null } = {},
): AgentGroup | null {
  const byPlay = opts.play ? AGENT_PLAY_GROUP[opts.play] : undefined;
  if (!byPlay && LENDER_ONLY_CATEGORIES.has(category)) return null;
  if (byPlay === "requested") return byPlay;
  if (opts.engagedRecently) return "engagement";
  if (byPlay) return byPlay;
  return AGENT_CATEGORY_GROUP[category] ?? "follow_up";
}

// ---------------------------------------------------------------------------
// Email copy
// ---------------------------------------------------------------------------

export function firstNameOf(name: string | null | undefined): string {
  const n = (name ?? "").trim().split(/\s+/)[0];
  return n && n.length > 0 ? n : "there";
}

export interface DailyReadBreakdownRow {
  label: string;
  count: number;
}

export interface DailyReadEmailContent {
  subject: string;
  preview: string;
  greeting: string;
  summary: string;
  supporting: string | null;
  breakdown: DailyReadBreakdownRow[];
  top: DailyReadItem[];
  remaining: number;
  /** Remainder line. Only states a number for items that passed the threshold. */
  remainingLabel: string;
  ctaLabel: string;
}

const TOP_ITEMS = 3;

/**
 * Assembles the email from canonical items only. No statistic, reason or next
 * step is invented here — every string either comes from the engine or counts
 * the items the engine produced.
 */
export function buildDailyReadEmail(input: {
  state: Exclude<DailyReadState, "none">;
  audience: DailyReadAudience;
  recipientName: string | null;
  items: DailyReadItem[];
}): DailyReadEmailContent {
  const ordered = [...input.items].sort(
    (a, b) => Number(b.isNew) - Number(a.isNew) || b.rank - a.rank,
  );
  const total = ordered.length;
  const noun = input.audience === "agent" ? "relationship" : "homeowner";
  const plural = total === 1 ? noun : `${noun}s`;

  const counts = new Map<string, number>();
  for (const item of ordered) {
    counts.set(item.categoryLabel, (counts.get(item.categoryLabel) ?? 0) + 1);
  }
  const breakdown = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const greeting = `Good morning, ${firstNameOf(input.recipientName)}`;
  // A featured card needs a name, a canonical reason and a canonical next step.
  const top = ordered.filter(isFeaturable).slice(0, TOP_ITEMS);
  const remaining = Math.max(0, total - top.length);
  const remainingLabel = remaining
    ? `${remaining} more prioritized ${
        remaining === 1 ? "opportunity is" : "opportunities are"
      } waiting inside SuCasa.`
    : "See all prioritized opportunities in SuCasa.";

  if (input.state === "new_signals") {
    return {
      subject: `${total} ${plural} deserve your attention today`,
      preview: `Your SuCasa Daily Read — ${total} ${plural} worth your attention.`,
      greeting,
      summary: `${total} ${plural} deserve attention today.`,
      supporting: null,
      breakdown,
      top,
      remaining,
      remainingLabel,
      ctaLabel: "Open Today's Opportunities",
    };
  }

  return {
    subject: `${total} ${plural} worth your attention today`,
    preview: `Your SuCasa Daily Read — a quiet day, with ${total} still worth attention.`,
    greeting,
    summary: "Your book is relatively quiet today.",
    supporting: `We didn't detect any major new changes since your last Daily Read, but ${
      total === 1 ? "this relationship is" : `these ${total} ${plural} are`
    } still worth attention.`,
    breakdown,
    top,
    remaining,
    remainingLabel,
    ctaLabel: "Review Your Opportunities",
  };
}
