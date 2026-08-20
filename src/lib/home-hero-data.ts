export type ZoneStatus = "good" | "watch" | "urgent";

export type HomeHeroData = {
  address: string;
  value: number;
  equity: number;
  equityPct: number;
  roi: number;
  homeScore: number;
  valueSeries: number[]; // last 12 months
  zones: {
    roof: ZoneStatus;
    hvac: ZoneStatus;
    plumbing: ZoneStatus;
    electrical: ZoneStatus;
  };
};

/**
 * What a signed-in homeowner's hero actually renders. Every number is nullable
 * because a real account may not have property records yet — we show dashes,
 * never the marketing sample below.
 */
export type HomeHeroView = {
  address: string | null;
  value: number | null;
  equity: number | null;
  equityPct: number | null;
  roi: number | null;
  homeScore: number | null;
  zones: HomeHeroData["zones"] | null;
};

/** Marketing sample only — never render this for a signed-in homeowner. */
export const HOME_HERO: HomeHeroData = {
  address: "123 Main St, Austin",
  value: 482300,
  equity: 186000,
  equityPct: 0.39,
  roi: 14800,
  homeScore: 82,
  valueSeries: [438, 441, 445, 448, 452, 456, 461, 465, 470, 474, 478, 482],
  zones: {
    roof: "good",
    hvac: "watch",
    plumbing: "good",
    electrical: "urgent",
  },
};

// Simple compounding forecast
export function projectHome(data: HomeHeroData, years: number) {
  const growth = 0.035; // 3.5%/yr
  const value = data.value * Math.pow(1 + growth, years);
  // principal paydown accelerates equity a bit
  const equityShare = Math.min(0.95, data.equityPct + years * 0.045);
  const equity = value * equityShare;
  return { value, equity, equityPct: equityShare };
}

export const ZONE_COLOR: Record<ZoneStatus, string> = {
  good: "#22c55e",
  watch: "#f59e0b",
  urgent: "#ef4444",
};

export const ZONE_LABEL: Record<ZoneStatus, string> = {
  good: "Healthy",
  watch: "Watch",
  urgent: "Action needed",
};
