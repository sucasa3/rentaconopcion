import { describe, it, expect, vi } from "vitest";

vi.mock("../suppression.server", () => ({
  partitionSuppressed: async (_db: any, rows: any[]) => ({ allowed: rows, suppressed: [] }),
}));

import { saveDiscoveryRows } from "../discovery.server";

const CSV = [
  "full_name,address,city,state,zip,email,phone",
  "Ana Uno,101 Oak St,Roswell,GA,30075,ana@example.com,",
  "Ben Dos,202 Pine Ave,Roswell,GA,30075,,",
  "Ana Again,101 Oak St,Roswell,GA,30075,,",
  "Cara Contact,,,,,cara@example.com,404-555-0101",
  "Dan NameOnly,,,,,,",
].join("\n");

/** In-memory book: clients, staged contacts, and a stage_mixed_upload stand-in. */
function fakeBook() {
  const clients: any[] = [];
  const staged: any[] = [];
  const rpcCalls: any[] = [];
  const from = (table: string) => {
    let filters: [string, any][] = [];
    const api: any = {
      select: () => api,
      eq: (c: string, v: any) => { filters.push([c, v]); return api; },
      is: () => api, in: () => api,
      range: () => Promise.resolve({ data: table === "lender_portfolio_clients" ? clients : staged.filter((s) => s.outcome === "contact_only"), error: null }),
      insert: (rows: any[]) => { clients.push(...rows); return Promise.resolve({ error: null }); },
      then: (res: any, rej: any) => {
        const batch = filters.find(([c]) => c === "batch_id")?.[1];
        return Promise.resolve({ data: staged.filter((s) => s.batch_id === batch), error: null }).then(res, rej);
      },
    };
    return api;
  };
  const rpc = async (name: string, args: any) => {
    rpcCalls.push({ name, args });
    const batch = `b${rpcCalls.length}`;
    const counts: Record<string, number> = {};
    for (const r of args.p_rows) {
      const dup = staged.some((s) => s.identity_key === r.identity_key && s.outcome === "contact_only");
      const outcome = dup ? "already_uploaded" : r.outcome;
      staged.push({ batch_id: batch, row_number: r.row_number, identity_key: r.identity_key, outcome });
      counts[outcome] = (counts[outcome] ?? 0) + 1;
    }
    return { data: { batch_id: batch, counts }, error: null };
  };
  return { db: { from, rpc }, clients, staged, rpcCalls };
}

describe("Discovery five-row upload", () => {
  it("accounts for all five rows and saves the phone/email-only contact", async () => {
    const book = fakeBook();
    const { results } = await saveDiscoveryRows(book.db, { userId: "u1", portfolioId: "p1", csv: CSV });
    expect(results.map((r) => r.outcome)).toEqual([
      "property_saved", "property_saved", "duplicate", "contact_saved", "unusable",
    ]);
    expect(book.clients).toHaveLength(2);
    expect(book.staged.filter((s) => s.outcome === "contact_only")).toHaveLength(1);
    expect(book.staged[0].identity_key).toBe("email:cara@example.com");
    expect(book.rpcCalls[0].args.p_actor).toBe("u1");
    expect(results[4].name).toBe("Dan NameOnly");
  });

  it("a retry of the same file saves nothing new", async () => {
    const book = fakeBook();
    await saveDiscoveryRows(book.db, { userId: "u1", portfolioId: "p1", csv: CSV });
    const { results, homeRows } = await saveDiscoveryRows(book.db, { userId: "u1", portfolioId: "p1", csv: CSV });
    expect(homeRows).toHaveLength(0);
    expect(results.filter((r) => r.outcome === "duplicate")).toHaveLength(4);
    expect(book.clients).toHaveLength(2);
    expect(book.rpcCalls).toHaveLength(1);
  });

  it("reports a failed home save instead of hiding it", async () => {
    const book = fakeBook();
    const db = { ...book.db, from: (t: string) => {
      const a = book.db.from(t);
      a.insert = () => Promise.resolve({ error: { message: "boom" } });
      return a;
    } };
    const { results } = await saveDiscoveryRows(db, { userId: "u1", portfolioId: "p1", csv: CSV });
    expect(results.filter((r) => r.outcome === "failed")).toHaveLength(2);
    expect(results).toHaveLength(5);
  });
});
