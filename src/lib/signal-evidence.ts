/**
 * Signal evidence — the pure, deterministic rules behind the Signals history
 * and the supporting facts on Today cards.
 *
 * Client-safe, no imports beyond types. Nothing here ranks anyone: Today order
 * still comes from the existing engine. This module only decides which kinds
 * of evidence a relationship may see, how strong each fact is, how confident
 * a grouped signal is, and whether organization feedback keeps it hidden.
 */

import type { LenderAccess } from "@/lib/lender-access";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EvidenceKind =
  | "valuation"
  | "value_change"
  | "equity"
  | "permit"
  | "sale"
  | "listing"
  | "tax_change"
  | "call_outcome"
  | "conversation"
  | "connection_request";

/**
 * Kinds that are never built in this phase, whatever the relationship. Listed
 * so tests can prove they stay out.
 */
export const EXCLUDED_KINDS = [
  "homeowner_activity",
  "email_open",
  "email_click",
  "text_reply",
  "document",
  "inspection_finding",
  "service_request",
] as const;

export type EvidenceSource =
  | "batchdata"
  | "historical_unknown"
  | "sucasa_snapshot"
  | "your_team"
  | "homeowner";

export type Strength = "strong" | "medium" | "weak";
export type Confidence = "high" | "medium" | "low";

export type SignalType = "value" | "property_record" | "conversation" | "request";

export interface EvidenceFact {
  /** Stable id derived from the underlying record, never from wording. */
  id: string;
  kind: EvidenceKind;
  source: EvidenceSource;
  /** When the underlying fact was observed/recorded. Never the view date. */
  observedAt: string | null;
  /** Fingerprint of the fact's content — changes only when the fact is corrected. */
  fp: string;
  estimated: boolean;
  stale: boolean;
  noActiveLoan?: boolean;
  strength: Strength;
  /** Structured values for the UI; never free text from a provider. */
  values: Record<string, string | number | boolean | null>;
}

export interface Signal {
  type: SignalType;
  facts: EvidenceFact[];
  confidence: Confidence;
  limited: boolean;
  conflicting: boolean;
  /** A record change, not by itself a reason to contact. */
  recordOnly: boolean;
  evidenceVersion: string;
  latestObservedAt: string | null;
}

// ---------------------------------------------------------------------------
// 1. Permission by evidence type
// ---------------------------------------------------------------------------

export type RelationshipContext =
  | { role: "agent"; ownRelationship: boolean }
  | { role: "lender"; access: LenderAccess };

/**
 * Which evidence kinds this relationship may see. Anything not returned is
 * excluded, including every kind in EXCLUDED_KINDS. Detail-page access alone
 * grants nothing beyond this list.
 */
export function permittedKinds(ctx: RelationshipContext): Set<EvidenceKind> {
  const out = new Set<EvidenceKind>();
  if (ctx.role === "agent") {
    if (!ctx.ownRelationship) return out;
    for (const k of [
      "valuation",
      "value_change",
      "equity",
      "permit",
      "sale",
      "listing",
      "tax_change",
      "call_outcome",
      "conversation",
      "connection_request",
    ] as EvidenceKind[])
      out.add(k);
    return out;
  }
  const a = ctx.access;
  if (!a.named) return out; // sponsor-only, agent-connected, none → nothing individual
  const has = (s: string) => (a.scopes as string[]).includes(s);
  if (has("valuation")) {
    out.add("valuation");
    out.add("value_change");
  }
  if (has("equity")) out.add("equity");
  if (has("property_snapshot")) {
    out.add("permit");
    out.add("sale");
    out.add("listing");
    out.add("tax_change");
  }
  // The org's own conversation record is always its own.
  out.add("call_outcome");
  out.add("conversation");
  if (a.category === "asked_to_connect") out.add("connection_request");
  return out;
}

/** Lenders keep only the existing one-line summary, and only with engagement scope. */
export function engagementSummaryAllowed(ctx: RelationshipContext): boolean {
  return ctx.role === "lender" && ctx.access.named && ctx.access.scopes.includes("engagement");
}

// ---------------------------------------------------------------------------
// 2. Provenance and freshness
// ---------------------------------------------------------------------------

export const VALUATION_STALE_DAYS = 90;
const DAY = 24 * 3600 * 1000;

function daysBetween(a: string | null, now: Date): number | null {
  if (!a) return null;
  const t = Date.parse(a);
  return Number.isNaN(t) ? null : (now.getTime() - t) / DAY;
}

/** 90-day freshness applies to valuations only — never permits, sales or taxes. */
export function isValuationStale(observedAt: string | null, now = new Date()): boolean {
  const d = daysBetween(observedAt, now);
  return d == null || d > VALUATION_STALE_DAYS;
}

/** BatchData only when an actual BatchData response wrote the record. */
export function recordSource(row: {
  source?: string | null;
  batchdata_enriched_at?: string | null;
}): EvidenceSource {
  return row.source === "batchdata" && row.batchdata_enriched_at ? "batchdata" : "historical_unknown";
}

// ---------------------------------------------------------------------------
// 3. Strength rules
// ---------------------------------------------------------------------------

export const VALUE_CHANGE_MEDIUM_PCT = 5;
export const VALUE_CHANGE_MIN_DAYS = 30;

export interface Snapshot {
  id: string;
  address: string;
  source: string;
  valueCents: number;
  capturedOn: string;
}

/**
 * Comparable = same address, same kind of source, 30+ days apart. Returns
 * null when there is no comparable pair.
 */
export function compareSnapshots(snaps: Snapshot[]): {
  from: Snapshot;
  to: Snapshot;
  pct: number;
  days: number;
  strength: Strength;
} | null {
  if (snaps.length < 2) return null;
  const sorted = [...snaps].sort((a, b) => a.capturedOn.localeCompare(b.capturedOn));
  const to = sorted[sorted.length - 1]!;
  for (let i = sorted.length - 2; i >= 0; i--) {
    const from = sorted[i]!;
    if (from.address !== to.address || from.source !== to.source || !from.valueCents) continue;
    const days = (Date.parse(to.capturedOn) - Date.parse(from.capturedOn)) / DAY;
    if (days < VALUE_CHANGE_MIN_DAYS) continue;
    const pct = Math.round(((to.valueCents - from.valueCents) / from.valueCents) * 1000) / 10;
    return {
      from,
      to,
      pct,
      days: Math.round(days),
      strength: Math.abs(pct) >= VALUE_CHANGE_MEDIUM_PCT ? "medium" : "weak",
    };
  }
  return null;
}

/**
 * Strength by kind. Historical/source-unknown and stale facts are always weak.
 * A dated permit/sale/listing is strong evidence the *record changed* only.
 */
export function strengthFor(
  kind: EvidenceKind,
  opts: { source: EvidenceSource; stale?: boolean; observedAt: string | null; valueChangeStrength?: Strength },
): Strength {
  if (opts.stale) return "weak";
  if (opts.source === "historical_unknown") return "weak";
  switch (kind) {
    case "connection_request":
    case "call_outcome":
    case "conversation":
      return "strong";
    case "permit":
    case "sale":
    case "listing":
      return opts.observedAt ? "strong" : "weak";
    case "tax_change":
      return "medium";
    case "value_change":
      return opts.valueChangeStrength ?? "weak";
    case "valuation":
    case "equity":
      return "weak"; // an estimate on its own
  }
}

// ---------------------------------------------------------------------------
// 4. Confidence
// ---------------------------------------------------------------------------

const RECORD_KINDS: EvidenceKind[] = ["permit", "sale", "listing", "tax_change"];

function drop(c: Confidence): Confidence {
  return c === "high" ? "medium" : "low";
}

/**
 * High  = a strong fact + a relevant, independent medium/strong fact (not stale).
 * Medium = one strong fact, or two independent medium facts.
 * Low   = everything else. Weak facts never complete High.
 * Conflicting drops one level.
 */
export function confidenceFor(facts: EvidenceFact[], conflicting = false): Confidence {
  const usable = facts.filter((f) => !f.stale);
  const strong = usable.filter((f) => f.strength === "strong");
  const medium = usable.filter((f) => f.strength === "medium");
  let c: Confidence = "low";
  if (strong.length) {
    const anchor = strong[0]!;
    const independent = usable.some(
      (f) =>
        f.id !== anchor.id &&
        (f.strength === "strong" || f.strength === "medium") &&
        (f.kind !== anchor.kind || f.source !== anchor.source),
    );
    c = independent ? "high" : "medium";
  } else if (medium.length >= 2 && new Set(medium.map((m) => m.kind + m.source)).size >= 2) {
    c = "medium";
  }
  return conflicting ? drop(c) : c;
}

// ---------------------------------------------------------------------------
// 5. Evidence version + grouping
// ---------------------------------------------------------------------------

/** Deterministic, formatting-independent. Tiny FNV-1a hash. */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function evidenceVersion(type: SignalType, facts: EvidenceFact[]): string {
  const parts = facts.map((f) => `${f.id}@${f.observedAt ?? ""}#${f.fp}`).sort();
  return `${type}:${hashString(parts.join("|"))}`;
}

const TYPE_OF: Record<EvidenceKind, SignalType> = {
  valuation: "value",
  value_change: "value",
  equity: "value",
  permit: "property_record",
  sale: "property_record",
  listing: "property_record",
  tax_change: "property_record",
  call_outcome: "conversation",
  conversation: "conversation",
  connection_request: "request",
};

/** Group facts into signals; exact duplicate ids collapse to one fact. */
export function groupSignals(facts: EvidenceFact[]): Signal[] {
  const byId = new Map<string, EvidenceFact>();
  for (const f of facts) if (!byId.has(f.id)) byId.set(f.id, f);
  const groups = new Map<SignalType, EvidenceFact[]>();
  for (const f of byId.values()) {
    const t = TYPE_OF[f.kind];
    groups.set(t, [...(groups.get(t) ?? []), f]);
  }
  const out: Signal[] = [];
  for (const [type, list] of groups) {
    const sorted = [...list].sort((a, b) => (b.observedAt ?? "").localeCompare(a.observedAt ?? ""));
    const conflicting = detectConflict(type, facts);
    out.push({
      type,
      facts: sorted,
      confidence: confidenceFor(sorted, conflicting),
      limited: sorted.length === 1,
      conflicting,
      recordOnly: type === "property_record",
      evidenceVersion: evidenceVersion(type, sorted),
      latestObservedAt: sorted[0]?.observedAt ?? null,
    });
  }
  const order: SignalType[] = ["request", "conversation", "property_record", "value"];
  return out.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
}

/** A recorded sale after the valuation was observed contradicts that value. */
function detectConflict(type: SignalType, all: EvidenceFact[]): boolean {
  if (type !== "value") return false;
  const val = all.find((f) => f.kind === "valuation");
  const sale = all.find(
    (f) => f.kind === "sale" || (f.kind === "listing" && f.values["status"] === "sold"),
  );
  if (!val?.observedAt || !sale?.observedAt) return false;
  return sale.observedAt > val.observedAt;
}

export function isRecordKind(k: EvidenceKind) {
  return RECORD_KINDS.includes(k);
}

// ---------------------------------------------------------------------------
// 6. Feedback
// ---------------------------------------------------------------------------

export interface FactFingerprint {
  id: string;
  kind: EvidenceKind;
  source: EvidenceSource;
  observedAt: string | null;
  fp: string;
  strength: Strength;
}

export interface FeedbackRecord {
  action: "dismiss" | "not_accurate";
  evidenceVersion: string;
  facts: FactFingerprint[];
}

export function fingerprints(facts: EvidenceFact[]): FactFingerprint[] {
  return facts.map(({ id, kind, source, observedAt, fp, strength }) => ({
    id,
    kind,
    source,
    observedAt,
    fp,
    strength,
  }));
}

/**
 * Dismiss: hidden while the evidence is the same. Returns only on genuinely
 * new relevant evidence — a new fact observed after everything dismissed, or a
 * new strong fact.
 *
 * Not accurate: hidden while any disputed fact is still present unchanged. It
 * returns only when that fact is corrected (content changed) or independently
 * verified (same kind of fact from a different source). New unrelated records
 * never bring it back.
 */
export function isSuppressed(signal: Signal, feedback: FeedbackRecord[]): boolean {
  for (const fb of feedback) {
    if (fb.action === "not_accurate") {
      const stillDisputed = fb.facts.some((d) => {
        const cur = signal.facts.find((f) => f.id === d.id);
        if (!cur || cur.fp !== d.fp) return false; // corrected or gone
        const verified = signal.facts.some(
          (f) => f.id !== d.id && f.kind === d.kind && f.source !== d.source && f.strength !== "weak",
        );
        return !verified;
      });
      if (stillDisputed) return true;
    } else {
      if (signal.evidenceVersion === fb.evidenceVersion) return true;
      const known = new Set(fb.facts.map((f) => f.id));
      const maxSeen = fb.facts.reduce((m, f) => ((f.observedAt ?? "") > m ? (f.observedAt ?? "") : m), "");
      const genuinelyNew = signal.facts.some(
        (f) =>
          !known.has(f.id) &&
          ((f.observedAt ?? "") > maxSeen || f.strength === "strong"),
      );
      if (!genuinelyNew) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// 7. Email opens (deferred input — rule kept so it is tested before use)
// ---------------------------------------------------------------------------

const PROXY_UA = /GoogleImageProxy|YahooMailProxy|Outlook-iOS|bot|preview|Slackbot|facebookexternalhit|LinkedInBot|Twitterbot|WhatsApp/i;

/** An open alone is always weak; likely-automatic opens are labelled, not proven. */
export function classifyEmailOpen(input: {
  sentAt: string;
  openedAt: string;
  userAgent?: string | null;
}): { strength: "weak"; mayBeAutomatic: boolean } {
  const secs = (Date.parse(input.openedAt) - Date.parse(input.sentAt)) / 1000;
  const mayBeAutomatic = secs < 60 || PROXY_UA.test(input.userAgent ?? "");
  return { strength: "weak", mayBeAutomatic };
}
