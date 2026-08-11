/**
 * Shared 3-step guided onboarding model for homeowners, lenders, and agents.
 *
 * The flow is intentionally short: welcome -> pick a focus -> confirm.
 * The focus the user picks (pre-selected from their recent activity) becomes
 * the default tab their dashboard opens on from then on.
 */

export type OnboardingRole = "homeowner" | "lender" | "agent";

export type OnboardingSignals = {
  /** Homeowner: overdue maintenance / inspection findings needing attention. */
  urgentCount?: number;
  /** Homeowner: refinance opportunity detected. */
  refiSignal?: boolean;
  /** Homeowner: documents on file. */
  documentCount?: number;
  /** Homeowner: profile completeness 0..100. */
  completeness?: number;
  /** Lender/agent: clients in the book. */
  clientCount?: number;
  /** Lender: connected agents. */
  connectionCount?: number;
  /** Agent: high-intent sellers right now. */
  highIntentCount?: number;
  /** Agent: recommendations due. */
  recommendationsDue?: number;
};

export type FocusOption = {
  key: string;
  label: string;
  description: string;
};

export type RoleFlow = {
  title: string;
  intro: { title: string; body: string; bullets: string[] };
  focusPrompt: string;
  options: FocusOption[];
  finish: (focusLabel: string) => { title: string; body: string };
};

export const ROLE_FLOWS: Record<OnboardingRole, RoleFlow> = {
  homeowner: {
    title: "Set up your home",
    intro: {
      title: "Welcome to SuCasa",
      body: "Three quick steps and your dashboard is tuned to what your home needs.",
      bullets: [
        "We pull public property records so your value and equity stay current",
        "Your systems and inspection reports drive a Home Score you can improve",
        "When something is due, we connect you with a vetted local pro",
      ],
    },
    focusPrompt: "What matters most to you right now?",
    options: [
      {
        key: "home",
        label: "Value & equity",
        description: "Track what your home is worth and what you could unlock.",
      },
      {
        key: "care",
        label: "Home care",
        description: "Stay ahead of maintenance and get quotes when something is due.",
      },
      {
        key: "documents",
        label: "Documents & records",
        description: "Keep inspections, warranties, and receipts in one place.",
      },
    ],
    finish: (focusLabel) => ({
      title: "You're all set",
      body: `Your dashboard will open on ${focusLabel}. You can switch tabs any time, and reopen this guide from the header.`,
    }),
  },
  lender: {
    title: "Set up your book",
    intro: {
      title: "Welcome to SuCasa for lenders",
      body: "Three quick steps and your workspace opens where your next deal is.",
      bullets: [
        "Your client book is scored for refinance and equity opportunity daily",
        "Campaigns go out under your branding and contact info",
        "The agent network surfaces de-identified opportunities you can request",
      ],
    },
    focusPrompt: "Where do you want to start each day?",
    options: [
      {
        key: "clients",
        label: "My clients",
        description: "Ranked refi and equity signals across your own book.",
      },
      {
        key: "campaigns",
        label: "Campaigns",
        description: "Review and brand the emails going out to your clients.",
      },
      {
        key: "network",
        label: "Agent network",
        description: "Opportunities inside connected agents' books.",
      },
    ],
    finish: (focusLabel) => ({
      title: "You're all set",
      body: `Your workspace will open on ${focusLabel}. Switch tabs any time, or reopen this guide from the header.`,
    }),
  },
  agent: {
    title: "Set up your portfolio",
    intro: {
      title: "Welcome to SuCasa for agents",
      body: "Three quick steps and your client activity feed leads with what to work today.",
      bullets: [
        "Every client gets a move intent and listing readiness score",
        "High intent combines property records with recent homeowner behavior",
        "Home needs turn into referrals you can hand to trusted pros",
      ],
    },
    focusPrompt: "What should your activity feed lead with?",
    options: [
      {
        key: "high_intent",
        label: "High intent sellers",
        description: "Clients showing real, recent selling signals.",
      },
      {
        key: "recommendations",
        label: "Recommendations due",
        description: "Home needs you can reach out about right now.",
      },
      {
        key: "referrals",
        label: "Referrals",
        description: "Projects already in motion with your clients.",
      },
    ],
    finish: (focusLabel) => ({
      title: "You're all set",
      body: `Your client activity feed will open on ${focusLabel}. Reopen this guide any time from the header.`,
    }),
  },
};

/** Pre-selects the option that matches the user's actual recent activity. */
export function suggestFocus(role: OnboardingRole, s: OnboardingSignals = {}): string {
  if (role === "homeowner") {
    if ((s.urgentCount ?? 0) > 0) return "care";
    if (s.refiSignal) return "home";
    if ((s.documentCount ?? 0) === 0 && (s.completeness ?? 100) < 80) return "documents";
    return "home";
  }
  if (role === "lender") {
    if ((s.clientCount ?? 0) === 0 && (s.connectionCount ?? 0) > 0) return "network";
    if ((s.clientCount ?? 0) === 0) return "clients";
    return "clients";
  }
  if ((s.highIntentCount ?? 0) > 0) return "high_intent";
  if ((s.recommendationsDue ?? 0) > 0) return "recommendations";
  return "referrals";
}

/** A short, personalized line shown under the focus prompt. */
export function activityHint(role: OnboardingRole, s: OnboardingSignals = {}): string | null {
  if (role === "homeowner") {
    if ((s.urgentCount ?? 0) > 0)
      return `We spotted ${s.urgentCount} item${s.urgentCount === 1 ? "" : "s"} in your home that need attention.`;
    if (s.refiSignal) return "Your mortgage shows a refinance signal worth a look.";
    if ((s.documentCount ?? 0) === 0) return "You haven't added any documents yet.";
    return null;
  }
  if (role === "lender") {
    if ((s.clientCount ?? 0) > 0)
      return `You have ${s.clientCount} client${s.clientCount === 1 ? "" : "s"} in this book${
        (s.connectionCount ?? 0) > 0 ? ` and ${s.connectionCount} connected agent(s)` : ""
      }.`;
    return "Your book is empty — importing clients unlocks everything else.";
  }
  if ((s.highIntentCount ?? 0) > 0)
    return `${s.highIntentCount} client${s.highIntentCount === 1 ? " is" : "s are"} showing high selling intent right now.`;
  if ((s.recommendationsDue ?? 0) > 0)
    return `${s.recommendationsDue} recommendation${s.recommendationsDue === 1 ? " is" : "s are"} due across your clients.`;
  return null;
}

const VERSION = "v1";

function storageKey(role: OnboardingRole, userId?: string | null) {
  return `sucasa.onboarding.${VERSION}.${role}.${userId ?? "anon"}`;
}

export type OnboardingState = { completedAt: string; focus: string };

export function readOnboarding(
  role: OnboardingRole,
  userId?: string | null,
): OnboardingState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(role, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.focus) return null;
    return parsed as OnboardingState;
  } catch {
    return null;
  }
}

export function writeOnboarding(role: OnboardingRole, userId: string | null, focus: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKey(role, userId),
      JSON.stringify({ completedAt: new Date().toISOString(), focus }),
    );
  } catch {
    /* storage unavailable — onboarding simply shows again */
  }
}
