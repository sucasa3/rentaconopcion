import { HOME_HERO } from "./home-hero-data";

export type TrendPoint = {
  month: string;
  value: number;
  equity: number;
  event?: { label: string; detail: string };
};

export type SubScore = { name: string; score: number; note: string };
export type Comp = { address: string; sold: number; ppsf: number; delta: number };
export type ActivityItem = {
  date: string;
  title: string;
  detail: string;
  kind: "completed" | "in_progress" | "external";
  amount?: number;
};
export type Recommendation = {
  id: string;
  priority: "urgent" | "this_month" | "plan_ahead";
  title: string;
  why: string;
  costLow: number;
  costHigh: number;
  payoff: string;
  cta: { label: string; to: string };
};

export const OCTOBER_REPORT = {
  monthLabel: "October 2026",
  generatedAt: "November 1, 2026",
  address: HOME_HERO.address,
  summary:
    "Your home gained $6,200 in estimated value this month, driven by three nearby comp sales and a clean roof inspection. Systems and Safety scores improved, but the electrical panel flagged an aging breaker that should be replaced before winter. YTD upgrade ROI is tracking $2,400 ahead of last year.",
  deltas: {
    value: { amount: 6200, pct: 0.013 },
    equity: { amount: 4100, pct: 0.022 },
    homeScore: 3,
    roiYtd: 14800,
  },
  trend: [
    { month: "Nov", value: 438000, equity: 168000 },
    { month: "Dec", value: 441000, equity: 170000 },
    { month: "Jan", value: 445000, equity: 172000, event: { label: "HVAC service", detail: "Filter + coil clean — $220" } },
    { month: "Feb", value: 448000, equity: 173500 },
    { month: "Mar", value: 452000, equity: 175200, event: { label: "Comp sold nearby", detail: "312 Elm St — $498k" } },
    { month: "Apr", value: 456000, equity: 177000 },
    { month: "May", value: 461000, equity: 178800, event: { label: "Interior repaint", detail: "Living + hall — $1,850" } },
    { month: "Jun", value: 465000, equity: 180400 },
    { month: "Jul", value: 470000, equity: 182100 },
    { month: "Aug", value: 474000, equity: 183700, event: { label: "Water heater flush", detail: "Preventive — $95" } },
    { month: "Sep", value: 478000, equity: 184900 },
    { month: "Oct", value: 482300, equity: 186000, event: { label: "Roof inspection", detail: "Passed — 8 yrs remaining" } },
  ] as TrendPoint[],
  subScores: [
    { name: "Structure", score: 88, note: "Roof passed inspection; foundation stable." },
    { name: "Systems", score: 74, note: "HVAC healthy; electrical panel aging." },
    { name: "Safety", score: 86, note: "Smoke detectors overdue on 1 of 4 units." },
    { name: "Curb Appeal", score: 79, note: "South-facing trim showing UV wear." },
  ] as SubScore[],
  market: {
    medianPpsf: 312,
    trend90d: 0.021,
    activeListings: 14,
    comps: [
      { address: "312 Elm St", sold: 498000, ppsf: 318, delta: 0.033 },
      { address: "509 Willow Ln", sold: 475000, ppsf: 305, delta: -0.015 },
      { address: "128 Pecan Dr", sold: 486000, ppsf: 314, delta: 0.008 },
    ] as Comp[],
  },
  activity: [
    { date: "Oct 4", title: "Roof inspection", detail: "SunPeak Roofing · passed", kind: "completed", amount: 185 },
    { date: "Oct 12", title: "HVAC filter replaced", detail: "Logged manually", kind: "external", amount: 42 },
    { date: "Oct 19", title: "Plumbing request", detail: "BluePipe Plumbing · scheduled", kind: "in_progress" },
    { date: "Oct 27", title: "Gutter clean", detail: "Evergreen Landscaping", kind: "completed", amount: 160 },
  ] as ActivityItem[],
  spend: { month: 387, ytd: 3140, projectedAnnual: 3820 },
  recommendations: [
    {
      id: "rec-1",
      priority: "urgent",
      title: "Replace aging electrical panel breaker",
      why: "October diagnostic flagged intermittent trip on the main 200A breaker. Risk of fault before winter load.",
      costLow: 600,
      costHigh: 1200,
      payoff: "Avoids ~$4,800 in outage / appliance damage risk.",
      cta: { label: "Request quote", to: "/request" },
    },
    {
      id: "rec-2",
      priority: "this_month",
      title: "Schedule HVAC winter tune-up",
      why: "Last service was in January. Pre-season tune-ups extend compressor life by 2–3 years.",
      costLow: 180,
      costHigh: 260,
      payoff: "Est. +$1,200 lifetime value on unit.",
      cta: { label: "Request quote", to: "/request" },
    },
    {
      id: "rec-3",
      priority: "this_month",
      title: "Replace overdue smoke detector",
      why: "Kitchen unit is past its 10-year replacement date. Required by Austin code.",
      costLow: 35,
      costHigh: 70,
      payoff: "Insurance compliance + safety.",
      cta: { label: "Learn more", to: "/services" },
    },
    {
      id: "rec-4",
      priority: "plan_ahead",
      title: "Refinance check — rates dropped 0.4%",
      why: "Current market rate 5.85% vs your 6.25%. Breakeven ~14 months at current balance.",
      costLow: 0,
      costHigh: 2400,
      payoff: "Est. $92/mo savings.",
      cta: { label: "Request quote", to: "/request" },
    },
    {
      id: "rec-5",
      priority: "plan_ahead",
      title: "Repaint south-facing trim",
      why: "UV wear detected in Curb Appeal scan. Best window: March–April.",
      costLow: 900,
      costHigh: 1400,
      payoff: "Protects siding + adds ~$3,000 perceived value.",
      cta: { label: "Request quote", to: "/request" },
    },
  ] as Recommendation[],
  projection: {
    projectedScore: 91,
    horizonYears: 1,
  },
};

export const PRIORITY_META = {
  urgent: { label: "Urgent", cls: "bg-destructive/10 text-destructive border-destructive/20" },
  this_month: { label: "This month", cls: "bg-accent text-accent-foreground border-accent" },
  plan_ahead: { label: "Plan ahead", cls: "bg-primary/10 text-primary border-primary/20" },
} as const;
