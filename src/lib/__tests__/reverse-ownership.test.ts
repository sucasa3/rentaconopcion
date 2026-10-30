import { describe, it, expect } from "vitest";
import { reversePropertyCandidates } from "../upload-reverse";
import { approveReverseRerun } from "../upload-reverse.server";

const person = (propertyOwner: boolean | null) => ({ fullName: "Maria Garcia", firstName: "Maria", lastName: "Garcia", propertyOwner,
  addresses: [{ fullAddress: "1 Main St, Conyers, GA 30012", street: "1 Main St", city: "Conyers", state: "GA", zip: "30012", rank: 1, propertyMailingAddress: null }],
  property: { id: "p", fullAddress: "2 Oak St, Conyers, GA 30012", street: "2 Oak St", city: "Conyers", state: "GA", zip: "30012", owners: [] },
  phones: [], emails: [], litigator: null, deceased: null });

describe("reverse ownership", () => {
  it("non-owner and unknown-ownership people never become possible owned properties", () => {
    expect(reversePropertyCandidates([person(false), person(null)])).toEqual([]);
  });
  it("a provider owner flag becomes a review candidate only, never associated addresses", () => {
    const c = reversePropertyCandidates([person(true)]);
    expect(c).toHaveLength(1);
    expect(c[0].address).toBe("2 Oak St");
  });
  it("re-search refuses any ceiling other than $0.30 before touching storage", async () => {
    await expect(approveReverseRerun({ admin: {} as any, actor: "a", searchId: "s", maxCostCents: 60, apiKey: "k", monthCap: 1000 }))
      .rejects.toThrow(/ceiling/);
  });
});
