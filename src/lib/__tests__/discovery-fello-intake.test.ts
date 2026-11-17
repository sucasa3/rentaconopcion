import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("../suppression.server", () => ({
  partitionSuppressed: async (_db: any, rows: any[]) => ({ allowed: rows, suppressed: [] }),
}));

import { saveDiscoveryRows } from "../discovery.server";
import { parseUploadCsv } from "../upload-intake";

// Real Fello export header (44 columns, BOM, CRLF, combined "Address" column).
const CSV = readFileSync(join(__dirname, "fixtures/discovery-fello-5-rows.csv"), "utf8");

function fakeBook(existing: any[] = []) {
  const clients: any[] = [...existing];
  const staged: any[] = [];
  const rpcCalls: any[] = [];
  const from = (table: string) => {
    const api: any = {
      select: () => api, eq: () => api, is: () => api, in: () => api,
      range: () => Promise.resolve({ data: table === "lender_portfolio_clients" ? clients : staged, error: null }),
      insert: (rows: any[]) => { clients.push(...rows); return Promise.resolve({ error: null }); },
      then: (res: any, rej: any) => Promise.resolve({ data: staged, error: null }).then(res, rej),
    };
    return api;
  };
  const rpc = async (_n: string, args: any) => {
    rpcCalls.push(args);
    for (const r of args.p_rows) staged.push({ row_number: r.row_number, identity_key: r.identity_key, outcome: r.outcome });
    return { data: { batch_id: "b", counts: {} }, error: null };
  };
  return { db: { from, rpc }, clients, staged, rpcCalls };
}

describe("Fello five-row file through Discovery", () => {
  it("maps Fello headers (names, phone, email, combined address)", () => {
    const { rows } = parseUploadCsv(CSV);
    expect(rows.map((r) => r.rowNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(rows[0].name).toBe("Ana Uno");
    expect(rows[0].address).toBe("101 Oak St, Roswell, GA 30075");
    expect(rows[3].phone).toBe("+14045550101");
    expect(rows[3].email).toBe("cara@example.com");
  });

  it("with the two homes already in the book: 3 duplicates, 1 contact saved, 1 named unusable", async () => {
    const first = fakeBook();
    await saveDiscoveryRows(first.db, { userId: "u1", portfolioId: "p1", csv: CSV });
    expect(first.clients).toHaveLength(2);

    const book = fakeBook(first.clients);
    const { results } = await saveDiscoveryRows(book.db, { userId: "u1", portfolioId: "p1", csv: CSV });
    expect(results.map((r) => [r.row, r.outcome])).toEqual([
      [1, "duplicate"], [2, "duplicate"], [3, "duplicate"], [4, "contact_saved"], [5, "unusable"],
    ]);
    expect(results[4].name).toBe("Dan NameOnly");
    expect(book.clients).toHaveLength(2); // no new homes, so no new lookups
    expect(book.rpcCalls).toHaveLength(1);
  });
});
