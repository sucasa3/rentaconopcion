import { describe, expect, it } from "vitest";
import { factsFromRecord } from "@/lib/client-facts.server";

const client = { id: "c1", address_line1: "1 Main St", city: "X", state: "GA", zip: "30000" };

function attomRow(mortgage: Record<string, unknown>) {
  return {
    address_normalized: "1 main st, x, ga 30000",
    avm: null,
    detail: null,
    tax: null,
    sales: null,
    permits: null,
    owner: null,
    mortgage: { property: [{ mortgage }] },
  };
}

describe("lender-safe mortgage facts", () => {
  it("takes date, type, lender and amount from the same recorded lien", () => {
    const f = factsFromRecord(
      client,
      attomRow({ date: "2020-11-03", amount: 234889, term: 360, loantypecode: "FHA", lender: { lastname: "ACME" } }),
    );
    if (f.lienStatus === "likely_paid_off" || f.freeAndClear || f.equityInferredNoLien) {
      expect(f.mortgageRecordedDate).toBeNull();
      return;
    }
    expect(f.mortgageRecordedDate).toBe("2020-11-03");
    expect(f.mortgageLoanType).toBe("FHA");
    expect(f.mortgageLenderName).toBe("ACME");
    expect(f.mortgageOriginalAmount).toBe(234889);
    expect(f.rateFromRecord).toBe(false);
  });

  it("never supplies a mortgage date without a property record", () => {
    const f = factsFromRecord({ ...client, close_date: "2019-01-01" }, null);
    expect(f.mortgageRecordedDate ?? null).toBeNull();
  });
});
