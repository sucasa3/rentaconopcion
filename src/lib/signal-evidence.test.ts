import { describe, expect, it } from "vitest";
import {
  EXCLUDED_KINDS,
  classifyEmailOpen,
  compareSnapshots,
  confidenceFor,
  engagementSummaryAllowed,
  fingerprints,
  groupSignals,
  isSuppressed,
  isValuationStale,
  permittedKinds,
  recordSource,
  strengthFor,
  type EvidenceFact,
} from "./signal-evidence";

const fact = (p: Partial<EvidenceFact> & Pick<EvidenceFact, "id" | "kind">): EvidenceFact => ({
  source: "batchdata",
  observedAt: "2026-09-01",
  fp: "a",
  estimated: false,
  stale: false,
  strength: "weak",
  values: {},
  ...p,
});
const lender = (a: any) => ({ role: "lender" as const, access: a });

describe("permission by evidence type", () => {
  it("never permits excluded kinds for any relationship", () => {
    const ctxs = [
      { role: "agent" as const, ownRelationship: true },
      lender({ named: true, scopes: ["valuation", "equity", "property_snapshot", "engagement"], category: "asked_to_connect" }),
    ];
    for (const c of ctxs) for (const k of EXCLUDED_KINDS) expect(permittedKinds(c).has(k as any)).toBe(false);
  });
  it("sponsor-only / agent-connected lender gets no individual evidence", () => {
    expect(permittedKinds(lender({ named: false, scopes: ["valuation"], category: "sponsor" })).size).toBe(0);
  });
  it("agent without own relationship gets nothing", () => {
    expect(permittedKinds({ role: "agent", ownRelationship: false }).size).toBe(0);
  });
  it("lender without valuation scope gets no value facts; detail access grants nothing extra", () => {
    const k = permittedKinds(lender({ named: true, scopes: [], category: "own" }));
    expect(k.has("valuation")).toBe(false);
    expect(k.has("permit")).toBe(false);
    expect(k.has("connection_request")).toBe(false);
  });
  it("engagement summary only for lenders with engagement scope, never agents", () => {
    expect(engagementSummaryAllowed({ role: "agent", ownRelationship: true })).toBe(false);
    expect(engagementSummaryAllowed(lender({ named: true, scopes: [] }))).toBe(false);
    expect(engagementSummaryAllowed(lender({ named: true, scopes: ["engagement"] }))).toBe(true);
  });
});

describe("provenance and freshness", () => {
  it("BatchData only with source + enrichment timestamp", () => {
    expect(recordSource({ source: "batchdata", batchdata_enriched_at: "2026-09-01" })).toBe("batchdata");
    expect(recordSource({ source: "batchdata" })).toBe("historical_unknown");
    expect(recordSource({})).toBe("historical_unknown");
  });
  it("valuation >90 days is stale and weak", () => {
    const now = new Date("2026-09-28");
    expect(isValuationStale("2026-06-01", now)).toBe(true);
    expect(isValuationStale("2026-08-01", now)).toBe(false);
    expect(strengthFor("valuation", { source: "batchdata", stale: true, observedAt: "2026-06-01" })).toBe("weak");
  });
  it("permits/sales are not subject to the 90-day rule", () => {
    expect(strengthFor("permit", { source: "batchdata", observedAt: "2020-01-01" })).toBe("strong");
  });
  it("source-unknown facts are always weak", () => {
    expect(strengthFor("sale", { source: "historical_unknown", observedAt: "2026-01-01" })).toBe("weak");
  });
});

describe("value comparison", () => {
  const s = (id: string, v: number, d: string, address = "1 A St", source = "avm") => ({ id, address, source, valueCents: v, capturedOn: d });
  it("5%+ over 30+ days on comparable snapshots is medium", () => {
    expect(compareSnapshots([s("1", 100, "2026-06-01"), s("2", 106, "2026-08-01")])?.strength).toBe("medium");
  });
  it("under 30 days or different address/source is not compared", () => {
    expect(compareSnapshots([s("1", 100, "2026-08-01"), s("2", 120, "2026-08-10")])).toBeNull();
    expect(compareSnapshots([s("1", 100, "2026-06-01", "2 B St"), s("2", 120, "2026-08-01")])).toBeNull();
    expect(compareSnapshots([s("1", 100, "2026-06-01", "1 A St", "x"), s("2", 120, "2026-08-01")])).toBeNull();
  });
  it("under 5% is weak", () => {
    expect(compareSnapshots([s("1", 100, "2026-06-01"), s("2", 103, "2026-08-01")])?.strength).toBe("weak");
  });
});

describe("confidence", () => {
  it("high needs strong + independent medium/strong", () => {
    expect(confidenceFor([fact({ id: "a", kind: "call_outcome", strength: "strong", source: "your_team" }), fact({ id: "b", kind: "tax_change", strength: "medium" })])).toBe("high");
  });
  it("a weak fact never completes high", () => {
    expect(confidenceFor([fact({ id: "a", kind: "permit", strength: "strong" }), fact({ id: "b", kind: "valuation", strength: "weak" })])).toBe("medium");
  });
  it("two independent mediums = medium; one weak = low", () => {
    expect(confidenceFor([fact({ id: "a", kind: "tax_change", strength: "medium" }), fact({ id: "b", kind: "value_change", strength: "medium", source: "sucasa_snapshot" })])).toBe("medium");
    expect(confidenceFor([fact({ id: "a", kind: "valuation" })])).toBe("low");
  });
  it("conflicting drops one level; single fact is limited", () => {
    expect(confidenceFor([fact({ id: "a", kind: "permit", strength: "strong" })], true)).toBe("low");
    const sig = groupSignals([fact({ id: "v", kind: "valuation", observedAt: "2026-01-01" }), fact({ id: "s", kind: "sale", observedAt: "2026-03-01", strength: "strong" })]);
    expect(sig.find((x) => x.type === "value")?.conflicting).toBe(true);
    expect(sig.find((x) => x.type === "value")?.limited).toBe(true);
  });
  it("property records are record-only, never a reason to contact by themselves", () => {
    expect(groupSignals([fact({ id: "p", kind: "permit", strength: "strong" })])[0]!.recordOnly).toBe(true);
  });
});

describe("grouping", () => {
  it("collapses duplicate ids and keeps independent reasons separate", () => {
    const g = groupSignals([
      fact({ id: "x", kind: "permit" }),
      fact({ id: "x", kind: "permit" }),
      fact({ id: "c", kind: "conversation", source: "your_team" }),
    ]);
    expect(g.map((s) => s.type)).toEqual(["conversation", "property_record"]);
    expect(g[1]!.facts).toHaveLength(1);
  });
  it("evidence version is stable across re-reads and ignores wording", () => {
    const a = groupSignals([fact({ id: "x", kind: "permit", values: { count: 1 } })])[0]!;
    const b = groupSignals([fact({ id: "x", kind: "permit", values: { count: 9 } })])[0]!;
    expect(a.evidenceVersion).toBe(b.evidenceVersion);
  });
});

describe("feedback suppression", () => {
  const base = [fact({ id: "p1", kind: "permit", observedAt: "2026-08-01", strength: "strong" })];
  const sig = (facts: EvidenceFact[]) => groupSignals(facts)[0]!;
  it("dismiss hides same version; newer observation brings it back", () => {
    const s = sig(base);
    const fb = [{ action: "dismiss" as const, evidenceVersion: s.evidenceVersion, facts: fingerprints(s.facts) }];
    expect(isSuppressed(s, fb)).toBe(true);
    expect(isSuppressed(sig([...base, fact({ id: "p2", kind: "permit", observedAt: "2026-09-10" })]), fb)).toBe(false);
  });
  it("not accurate stays hidden when unrelated records arrive", () => {
    const s = sig(base);
    const fb = [{ action: "not_accurate" as const, evidenceVersion: s.evidenceVersion, facts: fingerprints(s.facts) }];
    expect(isSuppressed(sig([...base, fact({ id: "t", kind: "tax_change", observedAt: "2026-09-20", strength: "medium" })]), fb)).toBe(true);
  });
  it("not accurate returns when corrected or independently verified", () => {
    const s = sig(base);
    const fb = [{ action: "not_accurate" as const, evidenceVersion: s.evidenceVersion, facts: fingerprints(s.facts) }];
    expect(isSuppressed(sig([{ ...base[0]!, fp: "corrected" }]), fb)).toBe(false);
    expect(isSuppressed(sig([...base, fact({ id: "p9", kind: "permit", source: "your_team", strength: "strong" })]), fb)).toBe(false);
  });
});

describe("email opens (deferred input)", () => {
  it("an open is always weak; fast or proxy opens may be automatic", () => {
    expect(classifyEmailOpen({ sentAt: "2026-09-01T00:00:00Z", openedAt: "2026-09-01T00:00:30Z" })).toEqual({ strength: "weak", mayBeAutomatic: true });
    expect(classifyEmailOpen({ sentAt: "2026-09-01T00:00:00Z", openedAt: "2026-09-01T02:00:00Z", userAgent: "GoogleImageProxy" }).mayBeAutomatic).toBe(true);
    expect(classifyEmailOpen({ sentAt: "2026-09-01T00:00:00Z", openedAt: "2026-09-01T02:00:00Z" }).mayBeAutomatic).toBe(false);
  });
});
