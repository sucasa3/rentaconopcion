import { describe, expect, it } from "vitest";
import { inspectPdf, isOlderThan, matchInspection } from "./inspection-batch";

const clients = [
  { id: "a", address_line1: "100 Main St", city: "Testville", state: "GA", zip: "30000" },
  { id: "u1", address_line1: "200 Oak Ct Unit 1", city: "Testville", state: "GA", zip: "30000" },
  { id: "u2", address_line1: "200 Oak Ct Unit 2", city: "Testville", state: "GA", zip: "30000" },
] as any[];

describe("matchInspection", () => {
  it("exact on full address", () => {
    expect(matchInspection({ street: "100 Main Street", unit: null, city: "Testville", state: "GA", zip: "30000" } as any, clients)).toEqual({ status: "exact", candidates: ["a"] });
  });
  it("ambiguous when unit missing in a multi-unit building", () => {
    expect(matchInspection({ street: "200 Oak Ct", unit: null, zip: "30000" } as any, clients).status).toBe("ambiguous");
  });
  it("exact when unit given", () => {
    expect(matchInspection({ street: "200 Oak Ct", unit: "Apt 2", zip: "30000" } as any, clients)).toEqual({ status: "exact", candidates: ["u2"] });
  });
  it("different ZIP never matches", () => {
    expect(matchInspection({ street: "100 Main St", unit: null, zip: "39999" } as any, clients).status).toBe("unmatched");
  });
  it("no address means no match (names never match)", () => {
    expect(matchInspection({ street: null } as any, clients).status).toBe("unmatched");
  });
});

describe("inspectPdf", () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  it("rejects non-PDF", () => expect(inspectPdf(enc("hello"))).toEqual({ ok: false, reason: "not_pdf" }));
  it("rejects truncated", () => expect(inspectPdf(enc("%PDF-1.4\n/Type /Page\n"))).toEqual({ ok: false, reason: "malformed" }));
  it("rejects encrypted", () => expect(inspectPdf(enc("%PDF-1.4\n/Type /Page\n/Encrypt 5 0 R\n%%EOF\n"))).toEqual({ ok: false, reason: "encrypted" }));
  it("accepts and counts pages", () => expect(inspectPdf(enc("%PDF-1.4\n/Type /Pages\n/Type /Page\n/Type /Page\n%%EOF"))).toEqual({ ok: true, pages: 2 }));
});

describe("isOlderThan", () => {
  it("older report never overwrites newer record", () => expect(isOlderThan("2019-03-10", "2026-10-01T22:00:00Z")).toBe(true));
  it("same-day or newer is allowed", () => expect(isOlderThan("2026-10-01", "2026-10-01T22:00:00Z")).toBe(false));
  it("no prior record is allowed", () => expect(isOlderThan("2019-03-10", null)).toBe(false));
});
