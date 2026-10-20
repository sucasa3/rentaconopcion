import { describe, expect, it } from "vitest";
import { planHouseholdImport, type ImportSourceRow } from "../household-import";

const row = (n: number, r: Partial<ImportSourceRow>): ImportSourceRow => ({
  rowNumber: n, full_name: "Ana Diaz", address: "1 Main St", zip: "30060", ...r,
});
const plan = (rows: ImportSourceRow[], extra: Partial<Parameters<typeof planHouseholdImport>[0]> = {}) =>
  planHouseholdImport({ rows, existingClients: [], existingContacts: [], suppressedRowNumbers: new Set(), remainingCapacity: 100, ...extra });

describe("household import planner", () => {
  it("gives every source row exactly one outcome", () => {
    const rows = Array.from({ length: 130 }, (_, i) => row(i + 1, { address: `${i % 70} Oak St`, email: `o${i % 40}@x.com`, full_name: `Owner ${i % 40}` }));
    const p = plan(rows);
    expect(p.rows).toHaveLength(130);
    expect(new Set(p.rows.map((r) => r.rowNumber)).size).toBe(130);
  });

  it("keeps separate units as separate properties", () => {
    const p = plan([row(1, { address: "3474 Whisperwood Ct # 62" }), row(2, { address: "3474 Whisperwood Ct # 63" }), row(3, { address: "3474 Whisperwood Ct Apt 62" })]);
    expect(p.newProperties).toBe(2);
    expect(p.rows[2].outcome).toBe("exact_duplicate");
  });

  it("links one owner with the same name and email to several homes", () => {
    const p = plan([row(1, { email: "a@x.com" }), row(2, { email: "a@x.com", address: "2 Elm St" })]);
    expect(p.newProperties).toBe(2);
    expect(p.uniqueContacts).toBe(1);
  });

  it("holds a shared email with a different name for review", () => {
    const p = plan([row(1, { email: "a@x.com" }), row(2, { email: "a@x.com", full_name: "Luis Diaz", address: "2 Elm St" })]);
    expect(p.rows[1].outcome).toBe("needs_review");
    expect(p.newProperties).toBe(1);
  });

  it("never merges people by name alone across different homes", () => {
    const p = plan([row(1, {}), row(2, { address: "2 Elm St" })]);
    expect(p.uniqueContacts).toBe(2);
  });

  it("keeps a second person at the same address as associated, not co-borrower", () => {
    const p = plan([row(1, {}), row(2, { full_name: "Luis Diaz" })]);
    expect(p.rows[1]).toMatchObject({ outcome: "additional_contact", role: "associated" });
    expect(p.newProperties).toBe(1);
  });

  it("matches existing book properties and keeps their ids", () => {
    const p = plan([row(1, { address: "1 Main Street" })], {
      existingClients: [{ id: "c-65", address_line1: "1 Main St", zip: "30060" }],
      existingContacts: [{ id: "k-1", name: "Ana Diaz", clientIds: ["c-65"] }],
    });
    expect(p.rows[0]).toMatchObject({ outcome: "existing_property", propertyRef: "c-65", contactRef: "k-1" });
    expect(p.newProperties).toBe(0);
  });

  it("re-uploading the same file adds nothing new", () => {
    const rows = [row(1, { email: "a@x.com" }), row(2, { email: "a@x.com", address: "2 Elm St" }), row(3, { full_name: "Luis Diaz" })];
    const first = plan(rows);
    // Simulate persisted result of the first run.
    const ids = new Map<string, string>();
    first.rows.forEach((r) => r.propertyRef && ids.set(r.propertyRef, r.propertyRef.replace("new:", "id-")));
    const existingClients = [{ id: "id-1 main st|30060", address_line1: "1 Main St", zip: "30060" }, { id: "id-2 elm st|30060", address_line1: "2 Elm St", zip: "30060" }];
    const existingContacts = [
      { id: "k-ana", name: "Ana Diaz", email: "a@x.com", clientIds: existingClients.map((c) => c.id) },
      { id: "k-luis", name: "Luis Diaz", clientIds: ["id-1 main st|30060"] },
    ];
    const second = plan(rows, { existingClients, existingContacts });
    expect(second.newProperties).toBe(0);
    expect(second.rows.every((r) => r.outcome === "existing_property")).toBe(true);
    expect(second.rows.every((r) => r.contactRef?.startsWith("k-"))).toBe(true);
  });

  it("holds new properties above capacity instead of inserting them", () => {
    const p = plan([row(1, {}), row(2, { address: "2 Elm St" }), row(3, { address: "3 Elm St" })], { remainingCapacity: 2 });
    expect(p.newProperties).toBe(2);
    expect(p.rows[2].outcome).toBe("waiting_for_capacity");
  });

  it("reports suppressed and invalid rows explicitly", () => {
    const p = plan([row(1, {}), row(2, { address: " " })], { suppressedRowNumbers: new Set([1]) });
    expect(p.rows.map((r) => r.outcome)).toEqual(["suppressed", "invalid_address"]);
  });
});
