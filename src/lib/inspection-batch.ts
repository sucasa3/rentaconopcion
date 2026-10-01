/**
 * Workstream 4 — pure helpers for agent batch inspection uploads (no I/O).
 * Matching uses the normalized full street address + unit and ZIP (or city/state);
 * names never establish a match.
 */
import { normalizeStreet } from "./agent-discovery";

export const INSPECTION_LIMITS = {
  maxFileBytes: 20 * 1024 * 1024,
  maxFilesPerBatch: 25,
  maxZipBytes: 20 * 1024 * 1024,
  maxZipExpandedBytes: 100 * 1024 * 1024,
  maxZipEntries: 25,
  maxPages: 150,
  maxAttempts: 3,
} as const;

export interface ExtractedAddress {
  street: string | null;
  unit: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

export interface MatchClient {
  id: string;
  address_line1: string;
  city: string | null;
  state: string | null;
  zip: string | null;
}

export type MatchStatus = "exact" | "ambiguous" | "unmatched";

function splitUnit(street: string): { base: string; unit: string | null } {
  const n = normalizeStreet(street);
  const m = n.match(/^(.*?)\s+(?:unit|#)\s+(.+)$/);
  if (m) return { base: m[1].trim(), unit: m[2].replace(/\s+/g, "").toLowerCase() };
  return { base: n, unit: null };
}

function normUnit(u: string | null | undefined): string | null {
  if (!u) return null;
  const v = u.toLowerCase().replace(/^(apt|apartment|unit|suite|ste|#)\.?\s*/i, "").replace(/[\s#.]/g, "");
  return v || null;
}

function sameArea(a: { zip?: string | null; city?: string | null; state?: string | null }, b: typeof a): boolean {
  const za = (a.zip ?? "").replace(/\D/g, "").slice(0, 5);
  const zb = (b.zip ?? "").replace(/\D/g, "").slice(0, 5);
  if (za && zb) return za === zb;
  const ca = (a.city ?? "").trim().toLowerCase();
  const cb = (b.city ?? "").trim().toLowerCase();
  const sa = (a.state ?? "").trim().toLowerCase();
  const sb = (b.state ?? "").trim().toLowerCase();
  return !!ca && ca === cb && (!sa || !sb || sa === sb);
}

export function matchInspection(
  ex: ExtractedAddress,
  clients: MatchClient[],
): { status: MatchStatus; candidates: string[] } {
  if (!ex.street) return { status: "unmatched", candidates: [] };
  const exSplit = splitUnit(ex.street);
  const exUnit = normUnit(ex.unit) ?? exSplit.unit;
  const sameBuilding = clients
    .map((c) => ({ c, s: splitUnit(c.address_line1 ?? "") }))
    .filter(({ c, s }) => s.base === exSplit.base && sameArea(ex, c));
  if (sameBuilding.length === 0) return { status: "unmatched", candidates: [] };
  if (exUnit) {
    const exact = sameBuilding.filter(({ s }) => s.unit === exUnit);
    if (exact.length === 1) return { status: "exact", candidates: [exact[0].c.id] };
    return { status: "ambiguous", candidates: sameBuilding.map(({ c }) => c.id) };
  }
  if (sameBuilding.length === 1 && !sameBuilding[0].s.unit) {
    return { status: "exact", candidates: [sameBuilding[0].c.id] };
  }
  return { status: "ambiguous", candidates: sameBuilding.map(({ c }) => c.id) };
}

/** Cheap structural checks on raw PDF bytes. */
export function inspectPdf(bytes: Uint8Array): { ok: true; pages: number } | { ok: false; reason: "not_pdf" | "encrypted" | "malformed" | "too_many_pages" } {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  if (!head.includes("%PDF-")) return { ok: false, reason: "not_pdf" };
  const text = new TextDecoder("latin1").decode(bytes);
  if (!/%%EOF\s*$/.test(text.slice(-2048))) return { ok: false, reason: "malformed" };
  if (/\/Encrypt\s/.test(text)) return { ok: false, reason: "encrypted" };
  const pages = (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
  if (pages === 0) return { ok: false, reason: "malformed" };
  if (pages > INSPECTION_LIMITS.maxPages) return { ok: false, reason: "too_many_pages" };
  return { ok: true, pages };
}

/** A report dated before the newest recorded change on the home must never overwrite it. */
export function isOlderThan(inspectionDate: string | null, latestRecord: string | null): boolean {
  if (!inspectionDate || !latestRecord) return false;
  return inspectionDate.slice(0, 10) < latestRecord.slice(0, 10);
}
