import type { TimelineItem } from "@/lib/maintenance-rules";

/**
 * Picks the single highest-value action a homeowner should take right now.
 * Pure function over data the dashboard already loads — no new fetches.
 */

export type NextStepInput = {
  hasAddress: boolean;
  hasDocuments: boolean;
  hasLogs: boolean;
  timeline: TimelineItem[];
  openFindings: number;
  refiSignal?: string | null;
  monthlySavings?: number | null;
  openRequests: number;
};

export type NextStep = {
  id:
    | "add_address"
    | "upload_inspection"
    | "overdue_system"
    | "due_soon_system"
    | "refi"
    | "review_findings"
    | "track_request"
    | "log_service"
    | "all_clear";
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  /** Route to send the homeowner to. */
  to: string;
  /** Optional search params (e.g. pre-selected service category). */
  search?: Record<string, string>;
  /** Which dashboard tab holds the supporting detail. */
  tab?: "home" | "care" | "documents";
  tone: "urgent" | "opportunity" | "setup" | "calm";
};

/** Maintenance category → service request category slug. */
const CATEGORY_SLUG: Record<string, string> = {
  Roofing: "roofing",
  HVAC: "hvac",
  Plumbing: "plumbing",
  Windows: "handyman",
  Electrical: "electrical",
  Exterior: "painting",
};

export function categorySlugFor(category: string): string {
  return CATEGORY_SLUG[category] ?? "handyman";
}

export function pickNextStep(input: NextStepInput): NextStep {
  const {
    hasAddress,
    hasDocuments,
    hasLogs,
    timeline,
    openFindings,
    refiSignal,
    monthlySavings,
    openRequests,
  } = input;

  if (!hasAddress) {
    return {
      id: "add_address",
      eyebrow: "Start here",
      title: "Add your home address",
      body: "We pull value, equity, permits and system ages from property records the moment we know where your home is.",
      ctaLabel: "Complete your profile",
      to: "/onboarding",
      tone: "setup",
    };
  }

  const overdue = timeline
    .filter((t) => t.status === "overdue")
    .sort((a, b) => a.yearsLeft - b.yearsLeft)[0];

  if (overdue) {
    return {
      id: "overdue_system",
      eyebrow: "Needs attention",
      title: `Your ${overdue.label.toLowerCase()} is past its expected life`,
      body: `Installed around ${overdue.installedYear}. Getting a quote now is far cheaper than an emergency replacement.`,
      ctaLabel: "Get a quote",
      to: "/request",
      search: { category: categorySlugFor(overdue.category) },
      tab: "care",
      tone: "urgent",
    };
  }

  if (openFindings > 0) {
    return {
      id: "review_findings",
      eyebrow: "From your inspection",
      title: `${openFindings} item${openFindings === 1 ? "" : "s"} to review`,
      body: "We read your inspection report and pulled out what matters. Review the findings and turn any of them into a request.",
      ctaLabel: "Review findings",
      to: "/dashboard",
      tab: "documents",
      tone: "urgent",
    };
  }

  if (!hasDocuments) {
    return {
      id: "upload_inspection",
      eyebrow: "Sharpen your plan",
      title: "Upload your inspection report",
      body: "We read it for you and turn the findings into a prioritized to-do list with matched professionals.",
      ctaLabel: "Upload a document",
      to: "/dashboard",
      tab: "documents",
      tone: "setup",
    };
  }

  if (refiSignal === "strong" || refiSignal === "moderate") {
    return {
      id: "refi",
      eyebrow: "Money opportunity",
      title: monthlySavings
        ? `You could save about $${Math.round(monthlySavings).toLocaleString()}/mo`
        : "Your rate looks refinanceable",
      body: "Based on your equity position and current benchmark rates. See the options and connect with a lender when you're ready.",
      ctaLabel: "See refi options",
      to: "/dashboard",
      tab: "home",
      tone: "opportunity",
    };
  }

  const dueSoon = timeline
    .filter((t) => t.status === "due_soon")
    .sort((a, b) => a.yearsLeft - b.yearsLeft)[0];

  if (dueSoon) {
    return {
      id: "due_soon_system",
      eyebrow: "Plan ahead",
      title: `Your ${dueSoon.label.toLowerCase()} is nearing end of life`,
      body: `About ${Math.max(0, Math.round(dueSoon.yearsLeft))} year${Math.round(dueSoon.yearsLeft) === 1 ? "" : "s"} left. Price it out now so you're not deciding under pressure.`,
      ctaLabel: "Get a quote",
      to: "/request",
      search: { category: categorySlugFor(dueSoon.category) },
      tab: "care",
      tone: "opportunity",
    };
  }

  if (openRequests > 0) {
    return {
      id: "track_request",
      eyebrow: "In progress",
      title: `${openRequests} open service request${openRequests === 1 ? "" : "s"}`,
      body: "Check status, message your pro and keep the work logged to your home history.",
      ctaLabel: "View requests",
      to: "/dashboard",
      tab: "home",
      tone: "calm",
    };
  }

  if (!hasLogs) {
    return {
      id: "log_service",
      eyebrow: "Improve your Home Score",
      title: "Log work you've already had done",
      body: "Marking a system as replaced or serviced resets its lifespan and immediately raises your Home Score.",
      ctaLabel: "Update your home",
      to: "/dashboard",
      tab: "care",
      tone: "setup",
    };
  }

  return {
    id: "all_clear",
    eyebrow: "You're in good shape",
    title: "Nothing urgent right now",
    body: "We're watching your value, equity and system ages. We'll surface the next step the moment something changes.",
    ctaLabel: "Browse services",
    to: "/services",
    tone: "calm",
  };
}

// ---------------------------------------------------------------------------
// Profile completeness
// ---------------------------------------------------------------------------

export type CompletenessInput = {
  hasAddress: boolean;
  hasName: boolean;
  hasPhone: boolean;
  hasDocuments: boolean;
  hasLogs: boolean;
};

export type Completeness = { pct: number; missing: string[] };

export function profileCompleteness(input: CompletenessInput): Completeness {
  const checks: { ok: boolean; label: string }[] = [
    { ok: input.hasName, label: "Add your name" },
    { ok: input.hasAddress, label: "Add your home address" },
    { ok: input.hasPhone, label: "Add a phone number" },
    { ok: input.hasDocuments, label: "Upload an inspection or warranty doc" },
    { ok: input.hasLogs, label: "Log a system's age or last service" },
  ];
  const done = checks.filter((c) => c.ok).length;
  return {
    pct: Math.round((done / checks.length) * 100),
    missing: checks.filter((c) => !c.ok).map((c) => c.label),
  };
}
