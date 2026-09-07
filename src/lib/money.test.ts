import { describe, expect, it } from "vitest";
import { centsFromCents, centsFromDollars, formatMoney, subtractCents, toDollars } from "./money";

describe("canonical money units", () => {
  it("normalizes whole-dollar property values", () => {
    expect(centsFromDollars(650_000)).toBe(65_000_000);
    expect(formatMoney(centsFromDollars(650_000))).toBe("$650,000");
  });

  it("passes through amounts already stored in cents", () => {
    expect(centsFromCents(65_000_000)).toBe(65_000_000);
    expect(formatMoney(centsFromCents(65_000_000))).toBe("$650,000");
  });

  it("is idempotent for cents, so re-marking cannot double-scale", () => {
    const once = centsFromCents(48_695_700);
    expect(centsFromCents(once)).toBe(once);
  });

  it("cannot convert an already-normalized value a second time", () => {
    const normalized = centsFromDollars(650_000)!;
    // @ts-expect-error Cents is not accepted where an unnormalized number is required
    centsFromDollars(normalized);
  });

  it("handles missing and non-finite values", () => {
    expect(centsFromDollars(null)).toBeNull();
    expect(centsFromDollars(undefined)).toBeNull();
    expect(centsFromDollars(Number.NaN)).toBeNull();
    expect(formatMoney(null)).toBe("—");
    expect(toDollars(null)).toBeNull();
  });

  it("keeps mixed-source arithmetic in one unit", () => {
    // value from a property record (dollars), balance from an upload (cents)
    const value = centsFromDollars(650_000);
    const balance = centsFromCents(48_695_700);
    const equity = subtractCents(value, balance);
    expect(toDollars(equity)).toBe(163_043);
    expect(formatMoney(equity)).toBe("$163,043");
  });
});
