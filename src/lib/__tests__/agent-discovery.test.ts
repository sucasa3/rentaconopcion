import { describe, expect, it } from "vitest";
import {
  addressKey,
  licenseKey,
  planAgentIntake,
  planCapacityTopUp,
  selectArchive,
  toE164,
} from "../agent-discovery";

const row = (address: string, zip = "30075", email: string | null = null) => ({
  full_name: "A",
  address,
  zip,
  email,
});

describe("agent discovery intake", () => {
  it("keeps different units separate", () => {
    expect(addressKey(row("10 Main St Apt 1"))).not.toBe(addressKey(row("10 Main St Apt 2")));
  });
  it("treats spelling variants of one unit as the same property", () => {
    expect(addressKey(row("10 Main Street, Apt. 4B"))).toBe(addressKey(row("10 main st #4b")));
  });
  it("skips re-uploaded properties and file repeats", () => {
    const existing = [addressKey(row("1 Oak Dr"))];
    const p = planAgentIntake([row("1 Oak Drive"), row("2 Oak Dr"), row("2 Oak Dr")], {
      existingKeys: existing,
      remaining: 10,
    });
    expect(p.toImport.map((r) => r.address)).toEqual(["2 Oak Dr"]);
    expect(p.duplicateProperties).toBe(2);
  });
  it("never merges different properties that share an email", () => {
    const p = planAgentIntake([row("1 A St", "1", "x@y.com"), row("2 B St", "1", "x@y.com")], {
      existingKeys: [],
      remaining: null,
    });
    expect(p.toImport).toHaveLength(2);
    expect(p.sharedContactRows).toBe(2);
  });
  it("holds rows above the allowance", () => {
    const p = planAgentIntake([row("1 A"), row("2 A"), row("3 A")], { existingKeys: [], remaining: 2 });
    expect(p.toImport).toHaveLength(2);
    expect(p.overAllowance).toHaveLength(1);
  });
});

describe("identity helpers", () => {
  it("normalizes phones to E.164", () => {
    expect(toE164("(678) 485-3054")).toBe("+16784853054");
    expect(toE164("1-678-485-3054")).toBe("+16784853054");
    expect(toE164("+52 55 1234 5678")).toBe("+525512345678");
    expect(toE164("123")).toBeNull();
  });
  it("normalizes license pairs", () => {
    expect(licenseKey(" sa-123 456 ", "ga")).toBe("GA|SA123456");
    expect(licenseKey("123", null)).toBeNull();
  });
  it("plan capacity is total, including the free 100", () => {
    expect(planCapacityTopUp(250)).toBe(150);
    expect(planCapacityTopUp(1000)).toBe(900);
    expect(planCapacityTopUp(null)).toBe(0);
  });
  it("archives only what is not kept and rejects over-keeping", () => {
    expect(selectArchive(["a", "b", "c"], ["a"], 2)).toEqual(["b", "c"]);
    expect(() => selectArchive(["a", "b", "c"], ["a", "b", "c"], 2)).toThrow();
  });
});
