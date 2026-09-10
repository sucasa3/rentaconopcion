import { describe, it, expect } from "vitest";
import { classifyLienStatus, mortgageImpliedValue } from "@/lib/mortgage-position";
import { estimateHomeValue } from "@/lib/value-engine";
import { computeEquityRibbon, type MortgageSummary } from "@/lib/valuation.server";
import { normalizeBatchdataProperty } from "@/lib/batchdata-normalize";

const base = { openLienCount: 1, currentBalance: 219_000, ltv: 20 };

describe("mortgage-implied valuation", () => {
  it("reconstructs the provider valuation: 219,000 / 20% = 1,095,000", () => {
    expect(mortgageImpliedValue(base)).toBe(1_095_000);
  });

  it("accepts LTV as a percentage or a fraction", () => {
    expect(mortgageImpliedValue({ ...base, ltv: 0.2 })).toBe(1_095_000);
  });

  it("allows exactly one current open lien", () => {
    expect(mortgageImpliedValue({ ...base, openLienCount: 1 })).toBe(1_095_000);
  });

  it("refuses multiple open liens", () => {
    expect(mortgageImpliedValue({ ...base, openLienCount: 2 })).toBeNull();
  });

  it("refuses zero open liens", () => {
    expect(mortgageImpliedValue({ ...base, openLienCount: 0 })).toBeNull();
  });

  it("refuses a missing current balance", () => {
    expect(mortgageImpliedValue({ ...base, currentBalance: null })).toBeNull();
  });

  it("refuses a missing or invalid LTV", () => {
    expect(mortgageImpliedValue({ ...base, ltv: null })).toBeNull();
    expect(mortgageImpliedValue({ ...base, ltv: 0 })).toBeNull();
    expect(mortgageImpliedValue({ ...base, ltv: 400 })).toBeNull();
  });

  it("never uses a historical loan amount as the current balance", () => {
    const p = normalizeBatchdataProperty({
      address: { street: "1 Main St", city: "Miami", state: "FL", zip: "33137" },
      openLien: { totalOpenLienCount: 0 },
      mortgageHistory: [{ loanAmount: 300_000, recordingDate: "2001-04-02" }],
      valuation: { ltv: 20 },
    })!;
    expect(p.mortgage.currentBalance).toBeNull();
    expect(p.mortgage.liens).toHaveLength(0);
    expect(p.mortgage.history).toHaveLength(1);
    expect(
      mortgageImpliedValue({
        openLienCount: p.mortgage.openLienCount,
        currentBalance: p.mortgage.currentBalance,
        ltv: p.mortgage.ltv,
      }),
    ).toBeNull();
  });

  it("produces no implied value from mortgage history alone", () => {
    expect(
      estimateHomeValue({
        state: "FL",
        mortgage: { openLienCount: 0, currentBalance: null, loanAmount: 300_000, ltv: 20 },
      }).kind,
    ).not.toBe("mortgage_implied");
  });

  it("ranks the mortgage-implied estimate ahead of a recent sale", () => {
    const r = estimateHomeValue({
      state: "FL",
      sales: { lastSalePrice: 900_000, lastSaleDate: new Date().toISOString().slice(0, 10) },
      mortgage: base,
    });
    expect(r.kind).toBe("mortgage_implied");
    expect(r.value).toBe(1_095_000);
  });
});

describe("lien status classification", () => {
  const old = "2001-04-02";
  const recent = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  it("classifies a current open lien as confirmed_open", () => {
    expect(classifyLienStatus({ openLienCount: 1, liens: [{}] })).toBe("confirmed_open");
  });

  it("does not let a recent sale downgrade a genuine open lien", () => {
    expect(classifyLienStatus({ openLienCount: 1, liens: [{}], lastSaleDate: recent })).toBe(
      "confirmed_open",
    );
  });

  it("treats zero liens with an empty history as unconfirmed, not paid off", () => {
    expect(classifyLienStatus({ openLienCount: 0, liens: [], history: [] })).toBe("unconfirmed");
  });

  it("treats zero liens plus a payoff trail as likely_paid_off", () => {
    expect(
      classifyLienStatus({ openLienCount: 0, liens: [], history: [{}], lastSaleDate: old }),
    ).toBe("likely_paid_off");
  });

  it("suppresses a paid-off conclusion when the sale is within 120 days", () => {
    expect(
      classifyLienStatus({ openLienCount: 0, liens: [], history: [{}], lastSaleDate: recent }),
    ).toBe("unconfirmed");
  });
});

describe("canonical consistency across surfaces", () => {
  const mortgage = {
    hasRecord: true,
    loanAmount: 300_000,
    lender: "Acme",
    originationDate: "2010-01-01",
    interestRate: 5.87,
    loanType: null,
    termYears: 30,
    termMonths: null,
    openLienCount: 1,
    totalOpenLienBalance: 219_000,
    currentBalance: 219_000,
    lienStatus: "confirmed_open",
    ltv: 20,
  } satisfies MortgageSummary;

  it("resolves the same value and methodology for homeowner, agent and lender", () => {
    const ribbon = computeEquityRibbon(null, mortgage, null, null, "FL", null);
    expect(ribbon.estimatedValue).toBe(1_095_000);
    expect(ribbon.valueSource).toBe("mortgage_implied");
    // The homeowner value presentation reads the very same engine result.
    expect(ribbon.valueResult.value).toBe(ribbon.estimatedValue);
    expect(ribbon.valueResult.kind).toBe("mortgage_implied");
    expect(ribbon.lienStatus).toBe("confirmed_open");
    expect(ribbon.noMortgageOnRecord).toBe(false);
    expect(ribbon.loanBalanceEstimate).toBe(219_000);
  });

  it("does not state free-and-clear for an ambiguous zero-lien record", () => {
    const ribbon = computeEquityRibbon(
      { value: 400_000, date: null } as never,
      { ...mortgage, openLienCount: 0, totalOpenLienBalance: null, currentBalance: null, lienStatus: "unconfirmed" },
      null,
      null,
      "FL",
      null,
    );
    expect(ribbon.noMortgageOnRecord).toBe(false);
    expect(ribbon.equityDollars).toBeNull();
  });
});
