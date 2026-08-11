/**
 * Homeowner engagement scoring — the behavioral half of move intent.
 *
 * Pure functions, no imports, safe on client and server. Property signals
 * answer "does this household look like it should move?"; these answer
 * "are they acting like it right now?".
 *
 * Intent goes stale fast, so everything here decays hard with recency.
 */

export interface EngagementRow {
  portfolio_client_id: string;
  value_checks_14d: number;
  value_checks_30d: number;
  equity_checks_30d: number;
  distinct_types_14d: number;
  sessions_7d: number;
  last_activity_at: string | null;
  selling_form_timeframe: string | null;
  selling_form_at: string | null;
  value_request_at: string | null;
}

export interface EngagementSignal {
  kind: "selling_form" | "value_request" | "value_checks" | "clustering" | "recent_session";
  label: string;
  detail: string;
  weight: number;
}

export interface Engagement {
  score: number; // 0..100 behavioral contribution
  signals: EngagementSignal[];
  hasBehavior: boolean;
  lastActivityAt: string | null;
}

const DAY = 24 * 3600 * 1000;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / DAY;
}

/** Full weight inside 30 days, half weight to 90, then nothing. */
function decay(days: number | null): number {
  if (days == null) return 0;
  if (days <= 30) return 1;
  if (days <= 90) return 0.5;
  return 0;
}

const TIMEFRAME_LABEL: Record<string, string> = {
  now: "ready now",
  "3_6_months": "3–6 months",
  "12_months": "about a year out",
  curious: "just curious",
};

export const EMPTY_ENGAGEMENT: Engagement = {
  score: 0,
  signals: [],
  hasBehavior: false,
  lastActivityAt: null,
};

export function computeEngagement(row: EngagementRow | null | undefined): Engagement {
  if (!row) return EMPTY_ENGAGEMENT;

  const signals: EngagementSignal[] = [];
  let score = 0;

  // 1. Explicit "thinking of selling" — the strongest tell there is.
  const formDays = daysSince(row.selling_form_at);
  const formMult = decay(formDays);
  if (row.selling_form_timeframe && formMult > 0) {
    const tf = row.selling_form_timeframe;
    const base = tf === "now" || tf === "3_6_months" ? 35 : tf === "12_months" ? 18 : 10;
    const w = Math.round(base * formMult);
    score += w;
    signals.push({
      kind: "selling_form",
      label: `Asked about selling — ${TIMEFRAME_LABEL[tf] ?? tf}`,
      detail: `Submitted the "thinking of selling" form ${formDays! < 1 ? "today" : `${Math.round(formDays!)} days ago`}.`,
      weight: w,
    });
  }

  // 2. Home value / cash-offer style request.
  const valDays = daysSince(row.value_request_at);
  const valMult = decay(valDays);
  if (valMult > 0) {
    const w = Math.round(25 * valMult);
    score += w;
    signals.push({
      kind: "value_request",
      label: "Requested a home value",
      detail: `Asked what the home is worth ${valDays! < 1 ? "today" : `${Math.round(valDays!)} days ago`}.`,
      weight: w,
    });
  }

  // 3. Repeated value / equity checks — Fello's single biggest passive tell.
  const checks14 = (row.value_checks_14d ?? 0) + (row.equity_checks_30d ?? 0 ? 0 : 0);
  const combined14 = row.value_checks_14d ?? 0;
  if (combined14 >= 3) {
    score += 25;
    signals.push({
      kind: "value_checks",
      label: `Checked their home value ${combined14}× in 14 days`,
      detail: "Repeat value checks in a short window are the strongest passive seller signal.",
      weight: 25,
    });
  } else if (combined14 === 2) {
    score += 12;
    signals.push({
      kind: "value_checks",
      label: "Checked their home value twice in 14 days",
      detail: "Early repeat interest — worth a light value touch.",
      weight: 12,
    });
  } else if ((row.value_checks_30d ?? 0) + (row.equity_checks_30d ?? 0) >= 2) {
    score += 8;
    signals.push({
      kind: "value_checks",
      label: "Value and equity checks this month",
      detail: "Some interest in the numbers, but spread out.",
      weight: 8,
    });
  }
  void checks14;

  // 4. Signal clustering — several distinct actions close together.
  if ((row.distinct_types_14d ?? 0) >= 3) {
    score += 15;
    signals.push({
      kind: "clustering",
      label: `${row.distinct_types_14d} kinds of activity in 14 days`,
      detail: "Clustered activity — dashboard, equity, and value touches all landing together.",
      weight: 15,
    });
  }

  // 5. Simply being active this week.
  if ((row.sessions_7d ?? 0) >= 1) {
    score += 5;
    signals.push({
      kind: "recent_session",
      label:
        (row.sessions_7d ?? 0) > 1
          ? `Active on ${row.sessions_7d} days this week`
          : "Active in the last 7 days",
      detail: "Currently engaged with their home dashboard.",
      weight: 5,
    });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    signals: signals.sort((a, b) => b.weight - a.weight),
    hasBehavior: signals.length > 0,
    lastActivityAt: row.last_activity_at ?? null,
  };
}

export type IntentBand = "high" | "hot" | "warm" | "nurture" | "hold";

export interface CombinedIntent {
  score: number;
  band: IntentBand;
}

/**
 * Blend property signals with behavior.
 *
 * High intent is deliberately gated on real behavior: property records alone
 * can reach Hot, but never High. That's what makes the band worth trusting.
 * Compliance holds carry through untouched.
 */
export function combineIntent(
  propertyScore: number,
  propertyBand: string,
  engagement: Engagement,
): CombinedIntent {
  if (propertyBand === "hold" && propertyScore === 0 && !engagement.hasBehavior) {
    return { score: 0, band: "hold" };
  }
  // Represented elsewhere: quiet mode wins regardless of behavior.
  if (propertyScore === 0 && propertyBand === "hold") {
    return { score: 0, band: "hold" };
  }

  const score = Math.min(100, Math.round(propertyScore + engagement.score));
  const band: IntentBand =
    score >= 75 && engagement.hasBehavior
      ? "high"
      : score >= 60
        ? "hot"
        : score >= 38
          ? "warm"
          : score >= 18
            ? "nurture"
            : "hold";

  return { score, band };
}
