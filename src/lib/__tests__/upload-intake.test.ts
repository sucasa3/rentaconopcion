import { describe, expect, it } from "vitest";
import { addressKey, parseUploadCsv, planUpload, type UploadRole } from "../upload-intake";

const AGENT_CSV = `full_name,address,city,state,zip,email,phone
Ana Ruiz,12 Oak Street,Buford,GA,30518,ana@example.invalid,
Ben Cole,40 Pine Rd,Buford,GA,30518,,
Cara Diaz,,,,,cara@example.invalid,
Dan Eto,,,,,,(678) 555-0101
Eve Fox,,,,,,
Ana Ruiz again,12 Oak St.,Buford,GA,30518,,
Gil Hart,9 Elm Ln,Gainesville,GA,30504,,
Ivy Jo,77 Ash Ct,Gainesville,GA,30504,,
`;
const LENDER_CSV = `first_name,last_name,property_address,city,state,zip,email,mobile,loan_balance,interest_rate
Ana,Ruiz,12 Oak Street,Buford,GA,30518,ana@example.invalid,,250000,6.75
Ben,Cole,40 Pine Rd,Buford,GA,30518,,,180000,3.1
Cara,Diaz,,,,,cara@example.invalid,,,
Dan,Eto,,,,,,6785550101,,
Eve,Fox,,,,,,,,
Ana,Ruiz,12 Oak St.,Buford,GA,30518,,,,
Gil,Hart,9 Elm Ln,Gainesville,GA,30504,,,,
Ivy,Jo,77 Ash Ct,Gainesville,GA,30504,,,,
`;
const cached = new Set([addressKey({ address: "12 Oak St", zip: "30518", city: null, state: null })!]);
const plan = (role: UploadRole, csv: string, over: Partial<Parameters<typeof planUpload>[0]> = {}) =>
  planUpload({
    role, rows: parseUploadCsv(csv).rows, existingKeys: new Set(), cachedAddressKeys: cached,
    capacityRemaining: 2, approvedLookups: 0, lookupCostCents: 10, ...over,
  });

for (const [role, csv] of [["agent", AGENT_CSV], ["lender", LENDER_CSV]] as const) {
  describe(`${role} upload`, () => {
    it("reports an outcome for every uploaded row", () => {
      const p = plan(role, csv);
      expect(p.results).toHaveLength(8);
      expect(p.results.map((r) => r.rowNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });
    it("keeps address-less contacts that have a phone or email", () => {
      const p = plan(role, csv);
      expect(p.results[2].outcome).toBe("contact_only");
      expect(p.results[3].outcome).toBe("contact_only");
      expect(p.results[4].outcome).toBe("unusable");
    });
    it("keeps rows over Home Profile capacity as waiting, not dropped", () => {
      const p = plan(role, csv);
      expect(p.counts.waiting_capacity).toBe(2);
      expect(p.results[6].outcome).toBe("waiting_capacity");
      expect(p.results[7].outcome).toBe("waiting_capacity");
    });
    it("flags the same home twice in one file as a duplicate", () => {
      expect(plan(role, csv).results[5].outcome).toBe("duplicate_in_file");
    });
    it("re-uploading the same file adds nothing and needs no spend", () => {
      const first = plan(role, csv, { capacityRemaining: 10 });
      const existing = new Set(first.results.filter((r) => r.outcome !== "duplicate_in_file" && r.key).map((r) => r.key!));
      const again = plan(role, csv, { capacityRemaining: 10, existingKeys: existing });
      expect(again.counts.already_uploaded).toBe(6);
      expect(again.spend.lookupsNeeded).toBe(0);
    });
    it("reuses saved property records and holds paid lookups for batch approval", () => {
      const p = plan(role, csv);
      expect(p.results[0].outcome).toBe("added_cached");
      expect(p.results[1].outcome).toBe("added_needs_lookup");
      expect(p.spend).toMatchObject({ lookupsNeeded: 1, lookupsApproved: 0, approvalRequired: true });
    });
    it("an approved batch covers only up to its approved count", () => {
      const p = plan(role, csv, { capacityRemaining: 10, approvedLookups: 1 });
      expect(p.spend).toMatchObject({ lookupsNeeded: 3, lookupsApproved: 1, estimatedCentsApproved: 10, approvalRequired: true });
    });
  });
}

it("lender rows keep loan details", () => {
  const r = parseUploadCsv(LENDER_CSV).rows[0];
  expect(r).toMatchObject({ name: "Ana Ruiz", loanBalanceCents: 25000000, interestRateBps: 675 });
});
