/**
 * Offline fixture tests for the BatchData reverse-lookup Phase 1 logic.
 * No provider calls, no credentials, no network — every case runs against
 * documented sample response shapes.
 */

import { describe, expect, it } from "vitest";
import {
  buildReverseInput,
  buildReverseRequestBody,
  classifyReverseItem,
  estimateReverseCostCents,
  findReusableLookup,
  isInFlight,
  nameEvidence,
  normalizeReverseEmail,
  normalizeReversePhone,
  reverseSpendDecision,
  REVERSE_EST_COST_CENTS_PER_RESULT,
  REVERSE_MAX_ITEM_COST_CENTS,
  REVERSE_MAX_PERSONS_PER_ITEM,
} from "../batchdata-reverse";

// --- Fixtures shaped on the documented response example ---------------------

function person(overrides: Record<string, unknown> = {}) {
  return {
    propertyOwner: true,
    name: { first: "John", last: "Doe", full: "John Doe", akas: [] },
    addresses: [
      {
        fullAddress: "123 Main St, Phoenix, AZ 85001",
        street: "123 Main St",
        city: "Phoenix",
        state: "AZ",
        zip: "85001",
        rank: 0,
        propertyMailingAddress: false,
        addressValidity: "Valid",
      },
    ],
    phones: [{ rank: 0, number: "6025550142", type: "Mobile", dnc: false, tcpa: false }],
    emails: [{ rank: 0, email: "john.doe@example.com", tested: true }],
    litigator: false,
    deceased: false,
    property: {
      id: "prop-1",
      address: {
        fullAddress: "123 Main St, Phoenix, AZ 85001",
        street: "123 Main St",
        city: "Phoenix",
        state: "AZ",
        zip: "85001",
      },
      owners: [{ name: { full: "John Doe" } }],
    },
    ...overrides,
  };
}

function item(persons: unknown[], meta: Record<string, unknown> = {}) {
  return { input: { requestId: "req_1" }, persons, meta: { matched: persons.length > 0, error: false, errorMessage: "", ...meta } };
}

describe("input normalization", () => {
  it("accepts phone-only, email-only, and combined inputs", () => {
    expect(buildReverseInput({ phone: "(602) 555-0142", requestId: "r1" })).toMatchObject({ ok: true, phone: "6025550142" });
    expect(buildReverseInput({ email: " John.Doe@Example.com ", requestId: "r1" })).toMatchObject({ ok: true, email: "john.doe@example.com" });
    const both = buildReverseInput({ phone: "+1 602 555 0142", email: "a@b.com", requestId: "r1" });
    expect(both).toMatchObject({ ok: true, phone: "6025550142", email: "a@b.com" });
  });

  it("rejects invalid phones and emails without sending them", () => {
    expect(normalizeReversePhone("555-0142").ok).toBe(false);
    expect(normalizeReversePhone("020 7946 0958").ok).toBe(false); // non-US
    expect(normalizeReversePhone("1025550142").ok).toBe(false); // area code starts with 1
    expect(normalizeReverseEmail("not-an-email").ok).toBe(false);
    const r = buildReverseInput({ phone: "123", email: "bad", requestId: "r1" });
    expect(r.ok).toBe(false);
  });

  it("strips mailto: and Markdown formatting from emails", () => {
    expect(normalizeReverseEmail("mailto:a@b.com")).toMatchObject({ ok: true, email: "a@b.com" });
    expect(normalizeReverseEmail("[a@b.com](mailto:a@b.com)")).toMatchObject({ ok: true, email: "a@b.com" });
  });

  it("fails cleanly when the contact has neither phone nor email", () => {
    const r = buildReverseInput({ requestId: "r1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/no phone or email/i);
  });
});

describe("request body", () => {
  it("always sends propertyOwnersOnly: true with no way to disable it", () => {
    const body = buildReverseRequestBody({ requestId: "r1", phone: "6025550142" });
    expect((body.options as any).propertyOwnersOnly).toBe(true);
    expect(JSON.stringify(body)).toContain('"propertyOwnersOnly":true');
    expect(JSON.stringify(body)).not.toContain("propertyOwnerOnly");
  });

  it("omits unavailable fields and sends one combined item", () => {
    const phoneOnly = buildReverseRequestBody({ requestId: "r1", phone: "6025550142" });
    expect(phoneOnly.requests).toEqual([{ requestId: "r1", phone: "6025550142" }]);
    const emailOnly = buildReverseRequestBody({ requestId: "r1", email: "a@b.com" });
    expect(emailOnly.requests).toEqual([{ requestId: "r1", email: "a@b.com" }]);
    const both = buildReverseRequestBody({ requestId: "r1", phone: "6025550142", email: "a@b.com" });
    expect((both.requests as any[]).length).toBe(1);
  });
});

describe("classification", () => {
  it("one clear owner match → matched", () => {
    const r = classifyReverseItem(item([person()]), "John Doe");
    expect(r.status).toBe("matched");
    expect(r.billableResults).toBe(1);
    expect(r.nameEvidence).toBe("match");
  });

  it("no match → no_match, zero billable", () => {
    const r = classifyReverseItem(item([]), "John Doe");
    expect(r.status).toBe("no_match");
    expect(r.billableResults).toBe(0);
  });

  it("multiple persons despite owner-only → needs_review with the discrepancy flag", () => {
    const r = classifyReverseItem(item([person(), person({ name: { full: "Jane Doe", first: "Jane", last: "Doe" } })]), "John Doe");
    expect(r.status).toBe("needs_review");
    expect(r.multiPerson).toBe(true);
    expect(r.billableResults).toBe(2); // every returned person is billable
    expect(r.reviewReason).toMatch(/more than one/i);
  });

  it("identity/ownership mismatch → needs_review, never auto-matched on a name alone", () => {
    const r = classifyReverseItem(item([person()]), "Maria Garcia");
    expect(r.status).toBe("needs_review");
    expect(r.nameEvidence).toBe("mismatch");
  });

  it("non-owner person (owner-only should filter these) → needs_review", () => {
    const r = classifyReverseItem(item([person({ propertyOwner: false })]), "John Doe");
    expect(r.status).toBe("needs_review");
  });

  it("match without any property association → needs_review", () => {
    const r = classifyReverseItem(item([person({ property: null, addresses: [] })]), "John Doe");
    expect(r.status).toBe("needs_review");
    expect(r.reviewReason).toMatch(/no property association/i);
  });

  it("multiple property associations are preserved, not collapsed", () => {
    const p = person({
      addresses: [
        { fullAddress: "123 Main St, Phoenix, AZ 85001", street: "123 Main St", city: "Phoenix", state: "AZ", zip: "85001", rank: 0 },
        { fullAddress: "9 Oak Ave, Tucson, AZ 85701", street: "9 Oak Ave", city: "Tucson", state: "AZ", zip: "85701", rank: 1 },
      ],
    });
    const r = classifyReverseItem(item([p]), "John Doe");
    expect(r.persons[0].addresses.length).toBe(2);
    expect(r.persons[0].addresses[1].city).toBe("Tucson");
  });

  it("item-level provider error → invalid_input for bad input, provider_error otherwise", () => {
    const bad = classifyReverseItem(item([], { error: true, errorMessage: "phone is not a valid US phone number" }), "John Doe");
    expect(bad.status).toBe("invalid_input");
    const other = classifyReverseItem(item([], { error: true, errorMessage: "upstream timeout" }), "John Doe");
    expect(other.status).toBe("provider_error");
    expect(other.billableResults).toBe(0);
  });
});

describe("name evidence", () => {
  it("never treats a name as proof of ownership", () => {
    expect(nameEvidence("John Doe", "John Doe")).toBe("match");
    expect(nameEvidence("J. Doe", "John Doe")).toBe("partial");
    expect(nameEvidence("Maria Garcia", "John Doe")).toBe("mismatch");
    expect(nameEvidence(null, "John Doe")).toBe("unknown");
  });
});

describe("cost planning", () => {
  it("estimates per returned result and caps the worst case per item", () => {
    expect(estimateReverseCostCents(0)).toBe(0);
    expect(estimateReverseCostCents(1)).toBe(REVERSE_EST_COST_CENTS_PER_RESULT);
    expect(estimateReverseCostCents(3)).toBe(30);
    expect(REVERSE_MAX_ITEM_COST_CENTS).toBe(REVERSE_MAX_PERSONS_PER_ITEM * REVERSE_EST_COST_CENTS_PER_RESULT);
  });

  it("enforces the monthly cap before dispatch", () => {
    expect(reverseSpendDecision({ usedCentsThisMonth: 0, capCents: 1000 }).allowed).toBe(true);
    const blocked = reverseSpendDecision({ usedCentsThisMonth: 990, capCents: 1000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toMatch(/limit reached/i);
  });
});

describe("reuse and duplicate guards", () => {
  const now = Date.now();
  const rows = [
    { status: "matched", input_phone: "6025550142", input_email: null, created_at: new Date(now - 5 * 86_400_000).toISOString() },
    { status: "provider_error", input_phone: "6025550142", input_email: null, created_at: new Date(now - 1 * 86_400_000).toISOString() },
  ];

  it("reuses a fresh result for the same inputs — no second paid call", () => {
    const hit = findReusableLookup(rows, { phone: "6025550142" }, { now });
    expect(hit?.status).toBe("matched");
  });

  it("does not reuse errors, stale results, or different inputs", () => {
    const old = [{ status: "matched", input_phone: "6025550142", input_email: null, created_at: new Date(now - 60 * 86_400_000).toISOString() }];
    expect(findReusableLookup(old, { phone: "6025550142" }, { now })).toBeNull();
    expect(findReusableLookup(rows, { phone: "6025550142", email: "a@b.com" }, { now })).toBeNull();
    const onlyErrors = [rows[1]];
    expect(findReusableLookup(onlyErrors, { phone: "6025550142" }, { now })).toBeNull();
  });

  it("treats a recent pending row as in-flight (double-click guard)", () => {
    const pending = { status: "pending", input_phone: null, input_email: null, created_at: new Date(now - 30_000).toISOString() };
    expect(isInFlight(pending, { now })).toBe(true);
    expect(isInFlight({ ...pending, created_at: new Date(now - 10 * 60_000).toISOString() }, { now })).toBe(false);
    expect(isInFlight({ ...pending, status: "matched" }, { now })).toBe(false);
  });
});
