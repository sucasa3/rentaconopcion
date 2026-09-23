/**
 * Post-call voice note — shared, client-safe vocabulary.
 *
 * One conversation produces ONE rich record (professional_conversations) and
 * ONE canonical outcome row (opportunity_outcomes) — written together, in a
 * single database transaction. The outcome row is what the existing Today /
 * follow-up logic already reads; nothing here creates a second reminder or
 * activity system.
 *
 * The transcript is always preserved verbatim and never translated. AI-derived
 * fields are relationship intelligence only: they never overwrite property or
 * contact records.
 */
import { z } from "zod";

/** Maps onto the existing outcome-stage vocabulary — no new statuses. */
export const POST_CALL_OUTCOMES = [
  "no_answer",
  "talked",
  "appointment",
  "application",
  "closed",
  "not_interested",
] as const;
export type PostCallOutcome = (typeof POST_CALL_OUTCOMES)[number];

export const POST_CALL_SOURCES = ["post_call_voice", "post_call_text"] as const;
export type PostCallSource = (typeof POST_CALL_SOURCES)[number];

export const KeyFactSchema = z.object({
  fact: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
});
export type KeyFact = z.infer<typeof KeyFactSchema>;

/** What the AI proposes. Every field is reviewable and editable before saving. */
export const PostCallInterpretationSchema = z.object({
  summary: z.string().min(1).max(2000),
  originalLanguage: z.enum(["en", "es", "mixed"]),
  outcome: z.enum(POST_CALL_OUTCOMES),
  keyFacts: z.array(KeyFactSchema).max(12),
  nextStep: z.string().max(500).nullable(),
  followUp: z.object({
    required: z.boolean(),
    /** Resolved YYYY-MM-DD when the AI could pin one down, else null. */
    date: z.string().nullable(),
    /** The professional's own words, kept verbatim ("first week of January"). */
    timeframeText: z.string().max(200).nullable(),
    reason: z.string().max(300).nullable(),
  }),
  suggestedFutureOpener: z.string().max(500).nullable(),
});
export type PostCallInterpretation = z.infer<typeof PostCallInterpretationSchema>;

/** What the professional actually confirmed on the review screen. */
export const PostCallFinalSchema = PostCallInterpretationSchema.omit({
  originalLanguage: true,
});
export type PostCallFinal = z.infer<typeof PostCallFinalSchema>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalize an AI-supplied YYYY-MM-DD date. Returns null when the value is
 * unusable (bad shape, not a real day, or absurdly far out). Never invents
 * precision — a null here keeps the natural-language timeframe instead.
 */
export function normalizeFollowUpDate(
  date: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!date || !DATE_RE.test(date)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const check = new Date(t);
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== m - 1 ||
    check.getUTCDate() !== d
  ) {
    return null;
  }
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const min = todayStart - 86_400_000; // tolerate "yesterday" edge from timezone math
  const max = Date.UTC(now.getUTCFullYear() + 2, now.getUTCMonth(), now.getUTCDate());
  if (t < min || t > max) return null;
  return date;
}

/**
 * Convert "this local calendar date, 9:00 in the user's timezone" to a UTC
 * ISO instant for next_step_due_at. One offset correction pass is enough for
 * every real timezone (offsets don't change within a morning).
 */
export function followUpDateToDueAt(date: string, timezone: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 9, 0, 0);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(guess));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  const offsetMs = asIfUtc - guess;
  return new Date(guess - offsetMs).toISOString();
}

/** Field names the professional changed from the AI draft (audit trail). */
export function editedFields(
  original: PostCallInterpretation,
  final: PostCallFinal,
): string[] {
  const edited = new Set<string>();
  if (original.summary !== final.summary) edited.add("summary");
  if (original.outcome !== final.outcome) edited.add("outcome");
  if (original.nextStep !== final.nextStep) edited.add("next_step");
  if (original.suggestedFutureOpener !== final.suggestedFutureOpener)
    edited.add("suggested_opener");
  if (
    JSON.stringify(original.keyFacts.map((k) => k.fact)) !==
    JSON.stringify(final.keyFacts.map((k) => k.fact))
  ) {
    edited.add("key_facts");
  }
  if (original.followUp.required !== final.followUp.required) edited.add("follow_up_required");
  if (original.followUp.date !== final.followUp.date) edited.add("follow_up_date");
  if (original.followUp.timeframeText !== final.followUp.timeframeText)
    edited.add("follow_up_timeframe_text");
  if (original.followUp.reason !== final.followUp.reason) edited.add("follow_up_reason");
  return [...edited];
}

// ---------------------------------------------------------------------------
// Return-from-call marker. Tapping a tel: link writes a lightweight marker;
// when the professional returns to the app, a prompt offers the voice note.
// This never depends on detecting the actual call or accessing call audio.
// ---------------------------------------------------------------------------

export interface CallMarker {
  clientId: string;
  name: string;
  audience: "agent" | "lender";
  opportunityId: string | null;
  at: number;
}

const MARKER_KEY = "sucasa.lastCall";
/** A call rarely spans longer than this; older markers are ignored. */
export const CALL_MARKER_MAX_AGE_MS = 45 * 60_000;

export function markCallInitiated(marker: Omit<CallMarker, "at">): void {
  try {
    localStorage.setItem(MARKER_KEY, JSON.stringify({ ...marker, at: Date.now() }));
  } catch {
    /* private mode etc. — the prompt is a convenience, never required */
  }
}

export function readCallMarker(
  maxAgeMs: number = CALL_MARKER_MAX_AGE_MS,
  now: number = Date.now(),
): CallMarker | null {
  try {
    const raw = localStorage.getItem(MARKER_KEY);
    if (!raw) return null;
    const marker = JSON.parse(raw) as CallMarker;
    if (!marker?.clientId || !marker?.at) return null;
    if (now - marker.at > maxAgeMs) return null;
    return marker;
  } catch {
    return null;
  }
}

export function clearCallMarker(): void {
  try {
    localStorage.removeItem(MARKER_KEY);
  } catch {
    /* ignore */
  }
}
