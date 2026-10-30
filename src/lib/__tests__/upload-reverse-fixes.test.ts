import { describe, expect, it } from "vitest";
import { reverseContactConflict, withConflictReview } from "../upload-reverse";
import { findPriorReverseSearch } from "../reverse-prior.server";
import type { ReversePersonSummary } from "../batchdata-reverse";

const person = (phones: string[], emails: string[]): ReversePersonSummary => ({
  fullName: "Ana Ruiz", firstName: "Ana", lastName: "Ruiz", propertyOwner: true, addresses: [],
  property: { id: null, fullAddress: "12 Oak St", street: "12 Oak St", city: "Buford", state: "GA", zip: "30518", owners: [] },
  phones: phones.map((number) => ({ number, type: null, dnc: null, tcpa: null })), emails, litigator: null, deceased: null,
});
const input = { phone: "6784441234", email: "ana@example.com" };
const matched = (persons: ReversePersonSummary[]) => ({ status: "matched", persons, reviewReason: null as string | null });

describe("conflicting phone/email goes to review", () => {
  it("person carrying both details stays matched (equivalent phone format)", () => {
    expect(withConflictReview(matched([person(["+1 (678) 444-1234"], ["ANA@example.com"])]), input).status).toBe("matched");
  });
  it("phone matches but the person's email differs → needs review", () => {
    const r = withConflictReview(matched([person(["6784441234"], ["other@example.com"])]), input);
    expect(r.status).toBe("needs_review"); expect(r.conflict).toBe(true);
  });
  it("email matches but the person's phone differs → needs review", () => {
    expect(withConflictReview(matched([person(["4045550000"], ["ana@example.com"])]), input).status).toBe("needs_review");
  });
  it("phone and email point to two different people → needs review", () => {
    expect(reverseContactConflict([person(["6784441234"], []), person([], ["ana@example.com"])], input)).toMatch(/different people/);
  });
  it("single-channel searches are not flagged", () => {
    expect(reverseContactConflict([person(["6784441234"], ["x@y.com"])], { phone: "6784441234" })).toBeNull();
  });
});

/** Tiny in-memory Data API stand-in. */
function fakeAdmin(tables: Record<string, any[]>, missing: string[] = []) {
  return { from(t: string) {
    let rows = [...(tables[t] ?? [])];
    const q: any = {
      select: () => q, limit: () => q,
      eq: (k: string, v: unknown) => { rows = rows.filter((r) => r[k] === v); return q; },
      or: (s: string) => { const fs = s.split(",").map((f) => { const [k, , ...v] = f.split("."); return [k, v.join(".")]; });
        rows = rows.filter((r) => fs.some(([k, v]) => r[k] === v)); return q; },
      then: (res: any) => res(missing.includes(t) ? { data: null, error: { code: "42P01" } } : { data: rows, error: null }),
    };
    return q;
  } };
}
const org = "org-1", actor = "user-1";

describe("prior searches from both workflows block a paid repeat", () => {
  it("Test Lab search in the same workspace blocks an upload search", async () => {
    const admin = fakeAdmin({ batchdata_reverse_lookups: [{ id: "L1", org_id: org, requested_by: "someone", status: "no_match", input_phone: "6784441234" }] });
    expect(await findPriorReverseSearch(admin, { orgId: org, actor, phone: "6784441234" })).toEqual({ source: "test_lab", id: "L1" });
  });
  it("an uncertain Test Lab outcome still blocks", async () => {
    const admin = fakeAdmin({ batchdata_reverse_lookups: [{ id: "L2", org_id: "other", requested_by: actor, status: "provider_error", input_email: "ana@example.com" }] });
    expect(await findPriorReverseSearch(admin, { orgId: org, actor, email: "ana@example.com" })).not.toBeNull();
  });
  it("an upload search in another book of the workspace blocks the Test Lab and other uploads", async () => {
    const admin = fakeAdmin({ upload_reverse_searches: [{ id: "S1", staged_id: "row-9", requested_by: "teammate", book_id: "book-2", input_phone: "6784441234" }],
      lender_portfolios: [{ id: "book-2", lender_org_id: org }] });
    expect(await findPriorReverseSearch(admin, { orgId: org, actor, phone: "6784441234" })).toEqual({ source: "upload", id: "S1" });
  });
  it("the row's own search is a reuse, not a prior search", async () => {
    const admin = fakeAdmin({ upload_reverse_searches: [{ id: "S1", staged_id: "row-1", requested_by: actor, book_id: "b", input_phone: "6784441234" }] });
    expect(await findPriorReverseSearch(admin, { orgId: org, actor, phone: "6784441234", excludeStagedId: "row-1" })).toBeNull();
  });
  it("other workspaces don't block, and the missing upload table reads as no searches", async () => {
    const admin = fakeAdmin({ batchdata_reverse_lookups: [{ id: "L3", org_id: "other", requested_by: "x", status: "matched", input_phone: "6784441234" }] }, ["upload_reverse_searches"]);
    expect(await findPriorReverseSearch(admin, { orgId: org, actor, phone: "6784441234" })).toBeNull();
  });
  it("a failed read fails closed", async () => {
    const admin = { from: () => { const q: any = { select: () => q, or: () => q, limit: () => q, then: (r: any) => r({ data: null, error: { code: "500" } }) }; return q; } };
    await expect(findPriorReverseSearch(admin, { orgId: org, actor, phone: "6784441234" })).rejects.toThrow(/Nothing sent/);
  });
});
