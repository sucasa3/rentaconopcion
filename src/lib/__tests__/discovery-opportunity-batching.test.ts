import { describe, it, expect } from "vitest";
import { listPortfolioOpportunityRows } from "../opportunities.server";

// Mocked data layer: fails like the real Data API when one GET carries >100 ids.
function fakeDb(clientCount: number) {
  const clients = Array.from({ length: clientCount }, (_, i) => ({ id: `c${i}` }));
  const calls: number[] = [];
  const q = (table: string) => {
    const state: any = { ids: null };
    const api: any = {
      select: () => api, eq: () => api, is: () => api, order: () => api, limit: () => api,
      in: (_c: string, ids: string[]) => { state.ids = ids; return api; },
      then: (res: any, rej: any) => {
        if (table === "lender_portfolio_clients") return Promise.resolve({ data: clients, error: null }).then(res, rej);
        calls.push(state.ids.length);
        if (state.ids.length > 100) return Promise.resolve({ data: null, error: { message: "Bad Request" } }).then(res, rej);
        return Promise.resolve({ data: state.ids.map((id: string, i: number) => ({ id: `o-${id}`, portfolio_client_id: id, category: "equity", score: i })), error: null }).then(res, rej);
      },
    };
    return api;
  };
  return { db: { from: q }, calls };
}

describe("Discovery results with a large book", () => {
  it("reads opportunities for a 663-home book without a Bad Request", async () => {
    const { db, calls } = fakeDb(663);
    const out = await listPortfolioOpportunityRows(db, "book");
    expect(out.opportunities).toHaveLength(663);
    expect(Math.max(...calls)).toBeLessThanOrEqual(100);
  });
});
