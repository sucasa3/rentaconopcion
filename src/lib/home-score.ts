import type { TimelineItem } from "@/lib/maintenance-rules";
import type { ZoneStatus } from "@/lib/home-hero-data";

export type ScoreBand = "excellent" | "good" | "attention" | "risk";

export type ScoreBreakdown = {
  key: "components" | "findings" | "records";
  label: string;
  earned: number;
  max: number;
  detail: string;
};

export type HomeScoreResult = {
  score: number;
  band: ScoreBand;
  bandLabel: string;
  summary: string;
  breakdown: ScoreBreakdown[];
  topActions: string[];
  zones: { roof: ZoneStatus; hvac: ZoneStatus; plumbing: ZoneStatus; electrical: ZoneStatus };
  itemsNeedingAttention: number;
};

export type FindingLike = {
  system?: string | null;
  urgency?: string | null;
  recommended_action?: string | null;
};

export type HomeScoreInput = {
  timeline: TimelineItem[];
  findings?: FindingLike[];
  hasDocuments?: boolean;
  hasAddress?: boolean;
  hasLogs?: boolean;
};

const COMPONENTS_MAX = 60;
const FINDINGS_MAX = 25;
const RECORDS_MAX = 15;
const FLOOR = 15;

export const BAND_LABEL: Record<ScoreBand, string> = {
  excellent: "Excellent",
  good: "Good",
  attention: "Needs attention",
  risk: "At risk",
};

export function bandFor(score: number): ScoreBand {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "attention";
  return "risk";
}

/** Per-component credit: full credit while healthy, decaying past end of life. */
function componentCredit(item: TimelineItem): number {
  if (item.yearsLeft > 2) return 1;
  if (item.yearsLeft >= 0) return 0.75; // due soon
  const yearsOver = Math.abs(item.yearsLeft);
  // Overdue: 0.5 at just-past, dropping to 0 by 10 years overdue.
  return Math.max(0, 0.5 - yearsOver * 0.05);
}

function statusZone(item: TimelineItem | undefined): ZoneStatus {
  if (!item) return "good";
  if (item.status === "overdue") return "urgent";
  if (item.status === "due_soon") return "watch";
  return "good";
}

export function computeHomeScore(input: HomeScoreInput): HomeScoreResult {
  const { timeline, findings = [], hasDocuments, hasAddress, hasLogs } = input;

  // 1. Component condition
  const tracked = timeline.length;
  const creditSum = timeline.reduce((sum, i) => sum + componentCredit(i), 0);
  const componentsEarned = tracked > 0 ? Math.round((creditSum / tracked) * COMPONENTS_MAX) : COMPONENTS_MAX;
  const overdue = timeline.filter((i) => i.status === "overdue");
  const dueSoon = timeline.filter((i) => i.status === "due_soon");

  // 2. Inspection findings
  const high = findings.filter((f) => (f.urgency ?? "").toLowerCase() === "high").length;
  const medium = findings.filter((f) => (f.urgency ?? "").toLowerCase() === "medium").length;
  const findingsPenalty = Math.min(FINDINGS_MAX, high * 6 + medium * 2);
  const findingsEarned = FINDINGS_MAX - findingsPenalty;

  // 3. Record completeness
  let recordsEarned = 0;
  if (hasAddress) recordsEarned += 5;
  if (hasDocuments) recordsEarned += 5;
  if (hasLogs) recordsEarned += 5;

  const raw = componentsEarned + findingsEarned + recordsEarned;
  const score = Math.max(FLOOR, Math.min(100, Math.round(raw)));
  const band = bandFor(score);

  const topActions: string[] = [];
  if (overdue.length > 0) {
    topActions.push(`Address ${overdue[0]!.label.toLowerCase()} — past its expected life`);
  }
  if (high > 0) {
    topActions.push(`Resolve ${high} high-urgency inspection ${high === 1 ? "finding" : "findings"}`);
  }
  if (dueSoon.length > 0 && topActions.length < 2) {
    topActions.push(`Plan ahead for ${dueSoon[0]!.label.toLowerCase()} in the next couple of years`);
  }
  if (!hasDocuments && topActions.length < 2) {
    topActions.push("Upload your inspection report so we can score real condition, not estimates");
  }
  if (!hasLogs && topActions.length < 2) {
    topActions.push("Mark a system as done to replace our estimate with your real service date");
  }
  if (topActions.length === 0) topActions.push("Nothing urgent — keep your records up to date");

  const itemsNeedingAttention = overdue.length + dueSoon.length;

  return {
    score,
    band,
    bandLabel: BAND_LABEL[band],
    summary:
      itemsNeedingAttention > 0
        ? `${BAND_LABEL[band]} · ${itemsNeedingAttention} item${itemsNeedingAttention === 1 ? "" : "s"} due`
        : `${BAND_LABEL[band]} · nothing due`,
    breakdown: [
      {
        key: "components",
        label: "System condition",
        earned: componentsEarned,
        max: COMPONENTS_MAX,
        detail:
          overdue.length > 0 || dueSoon.length > 0
            ? `${overdue.length} overdue, ${dueSoon.length} due soon of ${tracked} tracked systems`
            : `All ${tracked} tracked systems within expected life`,
      },
      {
        key: "findings",
        label: "Inspection findings",
        earned: findingsEarned,
        max: FINDINGS_MAX,
        detail:
          findings.length > 0
            ? `${high} high, ${medium} medium urgency open`
            : "No inspection report on file",
      },
      {
        key: "records",
        label: "Record completeness",
        earned: recordsEarned,
        max: RECORDS_MAX,
        detail: [
          hasAddress ? "address on file" : "address missing",
          hasDocuments ? "documents uploaded" : "no documents",
          hasLogs ? "service history logged" : "no service history",
        ].join(", "),
      },
    ],
    topActions: topActions.slice(0, 2),
    zones: {
      roof: statusZone(timeline.find((i) => i.key === "roof")),
      hvac: statusZone(timeline.find((i) => i.key === "hvac")),
      plumbing: statusZone(timeline.find((i) => i.key === "water_heater")),
      electrical: statusZone(timeline.find((i) => i.key === "electrical")),
    },
    itemsNeedingAttention,
  };
}
