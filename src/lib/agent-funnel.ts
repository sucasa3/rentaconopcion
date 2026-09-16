export type AgentAttribution = {
  visitId: string;
  source?: string;
  campaign?: string;
  landingPath?: string;
  referrerHost?: string;
};

const STORAGE_KEY = "sucasa_agent_attribution_v1";

function clean(value: string | null, max: number): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

export function getAgentAttribution(): AgentAttribution {
  if (typeof window === "undefined") return { visitId: crypto.randomUUID() };
  try {
    const existing = window.sessionStorage.getItem(STORAGE_KEY);
    if (existing) return JSON.parse(existing) as AgentAttribution;
  } catch {
    // A blocked session store must not block signup.
  }

  const params = new URLSearchParams(window.location.search);
  let referrerHost: string | undefined;
  try {
    referrerHost = document.referrer ? new URL(document.referrer).hostname.slice(0, 160) : undefined;
  } catch {
    referrerHost = undefined;
  }
  const value: AgentAttribution = {
    visitId: crypto.randomUUID(),
    source: clean(params.get("utm_source") ?? params.get("source"), 80),
    campaign: clean(params.get("utm_campaign") ?? params.get("campaign"), 120),
    landingPath: `${window.location.pathname}${window.location.search}`.slice(0, 180),
    referrerHost,
  };
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Continue without persistence.
  }
  return value;
}
