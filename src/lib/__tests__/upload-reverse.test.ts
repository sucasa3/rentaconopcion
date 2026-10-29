import { describe, it, expect, vi } from "vitest";
import { uploadReverseEnabled, uploadReverseInput, reverseBatchCeiling, reversePropertyCandidates, REVERSE_UPLOAD_TEST_USERS } from "../upload-reverse";
import { classifyReverseItem } from "../batchdata-reverse";
import { dispatchReverseItem } from "../reverse-provider.server";
import { isSuppressed, candidateFor } from "../suppression.server";

describe("agent and lender retained-contact reverse search", () => {
  for (const user of REVERSE_UPLOAD_TEST_USERS) {
    it(`${user}: off by default and limited to both approved accounts`, () => {
      expect(uploadReverseEnabled(user, undefined, REVERSE_UPLOAD_TEST_USERS.join(","))).toBe(false);
      expect(uploadReverseEnabled(user, "true", REVERSE_UPLOAD_TEST_USERS.join(","))).toBe(true);
      expect(uploadReverseEnabled(user, "true", "")).toBe(false);
      expect(uploadReverseEnabled("another-user", "true", "another-user")).toBe(false);
    });
  }
  it("one search reserves 30 cents, not 10; 2 searches reserve 60", () => {
    expect(reverseBatchCeiling(1)).toEqual({ maxLookups: 1, maxCostCents: 30 });
    expect(reverseBatchCeiling(2)).toEqual({ maxLookups: 2, maxCostCents: 60 });
    expect(() => reverseBatchCeiling(11)).toThrow();
  });
  it("retained synthetic contacts cannot cause paid requests", () => {
    expect(uploadReverseInput({ email: "agent-test-email@example.invalid" }).ok).toBe(false);
    expect(uploadReverseInput({ phone: "6785550142" }).ok).toBe(false);
    expect(uploadReverseInput({ phone: "+1 (678) 555-0143" }).ok).toBe(false);
    expect(uploadReverseInput({ email: "person@example.com" }).ok).toBe(true);
  });
  it("phone-only opt-out suppresses equivalent formats before discovery", async () => {
    const record = candidateFor({ phone: "6784441234" });
    const admin = { from: () => ({ select: () => ({ or: () => ({ limit: async () => ({ data: [record], error: null }) }) }) }) };
    // Database register names are snake_case.
    const actual = { from: () => ({ select: () => ({ or: () => ({ limit: async () => ({
      data: [{ phone_hmac: record.phoneHmac, email_hmac: null, address_hmac: null }], error: null,
    }) }) }) }) };
    for (const phone of ["6784441234", "678-444-1234", "+1 (678) 444-1234", "16784441234"]) {
      expect(await isSuppressed(actual, { phone })).toBe(true);
    }
    expect(await isSuppressed(actual, { phone: "6784441235" })).toBe(false);
  });
  it("holds multiple owners; mailing addresses never become owned properties", () => {
    const person = { name: { full: "Ana Ruiz" }, propertyOwner: true,
      property: { address: { street: "12 Oak St", fullAddress: "12 Oak St, GA 30518", zip: "30518", city: "Buford", state: "GA" } },
      addresses: [{ fullAddress: "99 Mailing Rd" }] };
    const result = classifyReverseItem({ persons: [person, person] }, "Ana Ruiz");
    expect(result.status).toBe("needs_review");
    const candidates = reversePropertyCandidates(result.persons);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].address).toBe("12 Oak St");
    expect(reversePropertyCandidates(classifyReverseItem({ persons: [{ ...person, property: null }] }, "Ana Ruiz").persons)).toEqual([]);
  });
  it("returns no match at zero estimated cost using one owner-only request", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ result: { data: [{ persons: [] }] } }), { status: 200 }));
    const result = await dispatchReverseItem({ apiKey: "fixture", requestId: "local", email: "fixture@example.com", fetcher: fetcher as typeof fetch });
    expect(result.status).toBe("no_match"); expect(result.estimatedCostCents).toBe(0); expect(fetcher).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string);
    expect(body.options.propertyOwnersOnly).toBe(true); expect(body.requests).toHaveLength(1);
  });
  it("uncertain transport holds the reservation and never retries", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("timeout"));
    const result = await dispatchReverseItem({ apiKey: "fixture", requestId: "local", fetcher });
    expect(result.uncertain).toBe(true); expect(result.estimatedCostCents).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(1);
  });
});