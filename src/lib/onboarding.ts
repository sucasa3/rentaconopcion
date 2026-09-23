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

type TFn = (key: any, vars?: Record<string, string | number>) => string;

export function getRoleFlows(t: TFn): Record<OnboardingRole, RoleFlow> {
  return {
    homeowner: {
      title: t("biz.ob.home.title"),
      intro: {
        title: t("biz.ob.home.intro_title"),
        body: t("biz.ob.home.intro_body"),
        bullets: [t("biz.ob.home.b1"), t("biz.ob.home.b2"), t("biz.ob.home.b3")],
      },
      focusPrompt: t("biz.ob.home.focus"),
      options: [
        { key: "home", label: t("biz.ob.home.opt_home_l"), description: t("biz.ob.home.opt_home_d") },
        { key: "care", label: t("biz.ob.home.opt_care_l"), description: t("biz.ob.home.opt_care_d") },
        { key: "documents", label: t("biz.ob.home.opt_docs_l"), description: t("biz.ob.home.opt_docs_d") },
      ],
      finish: (focusLabel) => ({
        title: t("biz.ob.finish_title"),
        body: t("biz.ob.home.finish_body", { focus: focusLabel }),
      }),
    },
    lender: {
      title: t("biz.ob.lender.title"),
      intro: {
        title: t("biz.ob.lender.intro_title"),
        body: t("biz.ob.lender.intro_body"),
        bullets: [t("biz.ob.lender.b1"), t("biz.ob.lender.b2"), t("biz.ob.lender.b3")],
      },
      focusPrompt: t("biz.ob.lender.focus"),
      options: [
        { key: "clients", label: t("biz.ob.lender.opt_clients_l"), description: t("biz.ob.lender.opt_clients_d") },
        { key: "campaigns", label: t("biz.ob.lender.opt_campaigns_l"), description: t("biz.ob.lender.opt_campaigns_d") },
        { key: "network", label: t("biz.ob.lender.opt_network_l"), description: t("biz.ob.lender.opt_network_d") },
      ],
      finish: (focusLabel) => ({
        title: t("biz.ob.finish_title"),
        body: t("biz.ob.lender.finish_body", { focus: focusLabel }),
      }),
    },
    agent: {
      title: t("biz.ob.agent.title"),
      intro: {
        title: t("biz.ob.agent.intro_title"),
        body: t("biz.ob.agent.intro_body"),
        bullets: [t("biz.ob.agent.b1"), t("biz.ob.agent.b2"), t("biz.ob.agent.b3")],
      },
      focusPrompt: t("biz.ob.agent.focus"),
      options: [
        { key: "high_intent", label: t("biz.ob.agent.opt_high_l"), description: t("biz.ob.agent.opt_high_d") },
        { key: "recommendations", label: t("biz.ob.agent.opt_recs_l"), description: t("biz.ob.agent.opt_recs_d") },
        { key: "referrals", label: t("biz.ob.agent.opt_refs_l"), description: t("biz.ob.agent.opt_refs_d") },
      ],
      finish: (focusLabel) => ({
        title: t("biz.ob.finish_title"),
        body: t("biz.ob.agent.finish_body", { focus: focusLabel }),
      }),
    },
  };
}

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
export function activityHint(
  role: OnboardingRole,
  s: OnboardingSignals = {},
  t?: TFn,
): string | null {
  if (!t) return null;
  if (role === "homeowner") {
    if ((s.urgentCount ?? 0) > 0)
      return t(s.urgentCount === 1 ? "biz.ob.hint.home_urgent_one" : "biz.ob.hint.home_urgent_many", { count: s.urgentCount! });
    if (s.refiSignal) return t("biz.ob.hint.home_refi");
    if ((s.documentCount ?? 0) === 0) return t("biz.ob.hint.home_docs");
    return null;
  }
  if (role === "lender") {
    if ((s.clientCount ?? 0) > 0)
      return `${t(s.clientCount === 1 ? "biz.ob.hint.lender_clients_one" : "biz.ob.hint.lender_clients_many", { count: s.clientCount! })}${
        (s.connectionCount ?? 0) > 0 ? t("biz.ob.hint.lender_agents", { count: s.connectionCount! }) : ""
      }.`;
    return t("biz.ob.hint.lender_empty");
  }
  if ((s.highIntentCount ?? 0) > 0)
    return t(s.highIntentCount === 1 ? "biz.ob.hint.agent_high_one" : "biz.ob.hint.agent_high_many", { count: s.highIntentCount! });
  if ((s.recommendationsDue ?? 0) > 0)
    return t(s.recommendationsDue === 1 ? "biz.ob.hint.agent_recs_one" : "biz.ob.hint.agent_recs_many", { count: s.recommendationsDue! });
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
