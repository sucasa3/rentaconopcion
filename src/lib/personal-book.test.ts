import { describe, expect, it } from "vitest";
import { personalBook, assertPersonalBook } from "./personal-book";

describe("uploader ownership", () => {
  const own = { id: "manager-book", assigned_user_id: "manager" };
  const other = { id: "officer-book", assigned_user_id: "officer" };
  it("keeps the manager's uploads in their own book regardless of team order", () => {
    expect(personalBook([other, own], "manager")).toEqual(own);
    expect(personalBook([own, other], "manager")).toEqual(own);
  });
  it("never falls back to another member or unassigned book", () => {
    expect(personalBook([other, { id: "pool", assigned_user_id: null }], "manager")).toBeNull();
  });
  const db = (book: unknown, member: unknown) => ({ from: (table: string) => {
    const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: table === "lender_portfolios" ? book : member }) };
    return q;
  } });
  it("rejects another officer's book even for a manager", async () => {
    await expect(assertPersonalBook(db(other, { user_id: "manager" }), "manager", other.id)).rejects.toThrow("own book");
  });
  it("rejects paused or removed members", async () => {
    await expect(assertPersonalBook(db(own, null), "manager", own.id)).rejects.toThrow("membership");
  });
  it("accepts only an active uploader's own book", async () => {
    expect(await assertPersonalBook(db(own, { user_id: "manager" }), "manager", own.id)).toEqual(own);
  });
});