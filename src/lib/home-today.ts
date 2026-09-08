/**
 * Pure presentation logic for the homeowner "Your Home Today" dashboard.
 *
 * Every sentence here is assembled from data the dashboard has already loaded.
 * Nothing in this file computes value, equity, the Home Score or the Home Plan
 * — it only decides what is worth saying and in which order. Helpers return
 * translation descriptors ({ key, params }) so the bilingual dictionary stays
 * the single source of copy.
 */
import type { TranslationKey } from "@/lib/i18n/en";

export type Line = { key: TranslationKey; params?: Record<string, string | number> };

export type HomeFacts = {
  /** Maintenance timeline statuses — authoritative for "now", never for "changed". */
  overdue: number;
  dueSoon: number;
  timelineItems: number;
  /** Home Plan counts from planCounts(). */
  plan90: number;
  planTotal: number;
  /** Saved inspection findings. */
  findings: number;
  hasInspection: boolean;
  documents: number;
  equityPct: number | null;
};

/** True when nothing in the home needs the homeowner today. */
export function isQuiet(f: HomeFacts): boolean {
  return f.overdue === 0 && f.dueSoon === 0 && f.plan90 === 0;
}

/**
 * The two-to-three sentence "What SuCasa sees" summary. Ordered by what a
 * homeowner would want to hear first; capped so the top of the page stays calm.
 */
export function whatSuCasaSees(f: HomeFacts): Line[] {
  const lines: Line[] = [];

  if (f.overdue > 0) {
    lines.push({
      key: f.overdue === 1 ? "home.sees.overdue_one" : "home.sees.overdue",
      params: { count: f.overdue },
    });
  } else if (f.dueSoon > 0) {
    lines.push({
      key: f.dueSoon === 1 ? "home.sees.due_soon_one" : "home.sees.due_soon",
      params: { count: f.dueSoon },
    });
  }

  if (f.plan90 > 0) {
    lines.push({
      key: f.plan90 === 1 ? "home.sees.plan90_one" : "home.sees.plan90",
      params: { count: f.plan90 },
    });
  }

  if (f.findings > 0) {
    lines.push({
      key: f.findings === 1 ? "home.sees.findings_one" : "home.sees.findings",
      params: { count: f.findings },
    });
  }

  if (lines.length === 0) lines.push({ key: "home.sees.steady" });
  return lines.slice(0, 3);
}

/** Home health phrasing — reads current timeline status only. */
export function homeHealth(f: HomeFacts): { line: Line; tone: "calm" | "soon" | "attention" } {
  if (f.timelineItems === 0) return { line: { key: "home.health.start" }, tone: "calm" };
  if (f.overdue > 0) {
    return {
      line: {
        key: f.overdue === 1 ? "home.health.attention_one" : "home.health.attention",
        params: { count: f.overdue },
      },
      tone: "attention",
    };
  }
  if (f.dueSoon > 0) {
    return {
      line: {
        key: f.dueSoon === 1 ? "home.health.soon_one" : "home.health.soon",
        params: { count: f.dueSoon },
      },
      tone: "soon",
    };
  }
  return { line: { key: "home.health.ok" }, tone: "calm" };
}

// ---------------------------------------------------------------------------
// Recent updates
//
// Only facts that carry a real stored timestamp qualify. A maintenance item
// that is due soon today proves what is true now — not when it became true —
// so care status never appears here. It lives in "What SuCasa sees" and
// "Home health" instead.
// ---------------------------------------------------------------------------

export type RecentUpdate = { line: Line; at: string };

export type RecentInput = {
  documents: { original_filename?: string | null; kind?: string | null; created_at: string }[];
  findings: { created_at: string }[];
  snapshots: { captured_on: string; value_cents: number }[];
  windowDays?: number;
};

function withinWindow(iso: string, now: Date, days: number): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const age = now.getTime() - t;
  return age >= 0 && age <= days * 24 * 60 * 60 * 1000;
}

function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

/**
 * Timestamped updates from the last N days, newest first. Each row states its
 * own date, so nothing implies "since your last visit" — a claim the data
 * cannot support.
 */
export function recentUpdates(input: RecentInput, now: Date = new Date()): RecentUpdate[] {
  const days = input.windowDays ?? 30;
  const out: RecentUpdate[] = [];

  for (const d of input.documents) {
    if (!withinWindow(d.created_at, now, days)) continue;
    out.push({
      at: d.created_at,
      line: {
        key: "home.recent.document",
        params: { name: (d.original_filename || d.kind || "Document").toString() },
      },
    });
  }

  const recentFindings = input.findings.filter((f) => withinWindow(f.created_at, now, days));
  if (recentFindings.length > 0) {
    const newest = recentFindings
      .map((f) => f.created_at)
      .sort()
      .at(-1)!;
    out.push({
      at: newest,
      line: {
        key: recentFindings.length === 1 ? "home.recent.findings_one" : "home.recent.findings",
        params: { count: recentFindings.length },
      },
    });
  }

  // Value: compare the newest stored snapshot with the previous stored one.
  const snaps = [...input.snapshots].sort((a, b) => a.captured_on.localeCompare(b.captured_on));
  const latest = snaps.at(-1);
  const prior = snaps.at(-2);
  if (latest && withinWindow(latest.captured_on, now, days)) {
    if (prior && prior.value_cents !== latest.value_cents) {
      out.push({
        at: latest.captured_on,
        line: {
          key:
            latest.value_cents > prior.value_cents
              ? "home.recent.value_up"
              : "home.recent.value_down",
          params: { value: dollars(latest.value_cents), prior: dollars(prior.value_cents) },
        },
      });
    }
  }

  return out
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 4);
}

/** Formats a stored date for a recent-update row in the viewer's locale. */
export function updateDate(iso: string, locale: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// "Make SuCasa smarter about your home"
// ---------------------------------------------------------------------------

export type SmarterInput = {
  hasName: boolean;
  hasAddress: boolean;
  hasPhone: boolean;
  hasDocuments: boolean;
  hasLogs: boolean;
};

/** Positive invitations, never a completion score. Empty when nothing is missing. */
export function smarterInvitations(input: SmarterInput): Line[] {
  const out: Line[] = [];
  if (!input.hasAddress) out.push({ key: "home.smarter.address" });
  if (!input.hasDocuments) out.push({ key: "home.smarter.documents" });
  if (!input.hasLogs) out.push({ key: "home.smarter.logs" });
  if (!input.hasName) out.push({ key: "home.smarter.name" });
  if (!input.hasPhone) out.push({ key: "home.smarter.phone" });
  return out.slice(0, 3);
}

/** Time-of-day greeting key. Local time is the homeowner's own clock. */
export function greetingKey(now: Date = new Date()): TranslationKey {
  const h = now.getHours();
  if (h < 12) return "home.today.morning";
  if (h < 18) return "home.today.afternoon";
  return "home.today.evening";
}
