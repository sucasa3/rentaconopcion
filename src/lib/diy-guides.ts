import type { TimelineItem } from "@/lib/maintenance-rules";
import { type TranslationKey, useT } from "@/lib/i18n";

/** Shorthand for a DIY guide. */
export type Guide = {
  what: string;
  steps: string[];
  diy: string;
  cost: string;
};

/** Maintenance category → service request category slug. */
export const CATEGORY_SLUG: Record<string, string> = {
  Roofing: "roofing",
  HVAC: "hvac",
  Plumbing: "plumbing",
  Windows: "handyman",
  Electrical: "electrical",
  Exterior: "painting",
};

export type Guide = {
  what: string;
  steps: string[];
  diy: string;
  cost: string;
};

/** How many steps each guide has in the dictionary. */
export const GUIDE_STEPS: Record<string, number> = {
  roof: 4,
  hvac: 4,
  water_heater: 4,
  windows: 4,
  electrical: 4,
  siding: 4,
  hvac_filter: 3,
  gutters: 3,
  water_heater_flush: 3,
  dryer_vent: 3,
  smoke_detectors: 3,
  exterior_caulk: 3,
};

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

function resolveGuideKey(rawKey: string): string | null {
  if (GUIDE_STEPS[rawKey]) return rawKey;
  if (rawKey.startsWith("component:")) {
    const k = rawKey.slice("component:".length);
    if (GUIDE_STEPS[k]) return k;
  }
  if (rawKey.startsWith("seasonal:")) {
    const k = rawKey.slice("seasonal:".length);
    if (GUIDE_STEPS[k]) return k;
  }
  return null;
}

export function guideKey(rawKey: string): string | null {
  return resolveGuideKey(rawKey);
}

export function hasGuide(rawKey: string): boolean {
  return resolveGuideKey(rawKey) !== null;
}

export function buildGuide(item: { key: string; label: string }, t: Translate): Guide | null {
  const key = resolveGuideKey(item.key);
  if (!key) return null;
  const stepCount = GUIDE_STEPS[key];
  return {
    what: t(`guide.${key}.what` as TranslationKey),
    steps: Array.from({ length: stepCount }, (_, i) =>
      t(`guide.${key}.step${i + 1}` as TranslationKey),
    ),
    diy: t(`guide.${key}.diy` as TranslationKey),
    cost: t(`guide.${key}.cost` as TranslationKey),
  };
}

export function buildTimelineGuide(item: TimelineItem, t: Translate): Guide | null {
  return buildGuide({ key: item.key, label: item.label }, t);
}

export function useGuide(item: { key: string; label: string } | null): Guide | null {
  const t = useT();
  if (!item) return null;
  return buildGuide(item, t);
}
