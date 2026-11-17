import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("../suppression.server", () => ({
  partitionSuppressed: async (_db: any, rows: any[]) => ({ allowed: rows, suppressed: [] }),
}));

const REAL = readFileSync(join(__dirname, "fixtures/discovery-test-5-rows-fello.csv"), "utf8");
const state: any = {};
function reset(owner = "neil") {
  state.clients = []; state.staged = []; state.rpc = []; state.runs = [];
  state.book = { id: "p1", lender_org_id: "o1", assigned_user_id: owner };
}
const fakeDb = {
  from(table: string) {
    const api: any = {
      select: () => api, eq: () => api, is: () => api, in: () => api,
      maybeSingle: async () => ({ data: table === "lender_portfolios" ? state.book : table === "lender_members" ? { user_id: "neil" } : table === "agent_discovery_runs" ? (state.runs.at(-1) ?? null) : null, error: null }),
      range: async () => ({ data: table === "lender_portfolio_clients" ? state.clients : state.staged, error: null }),
      insert: async (rows: any) => { state.clients.push(...[].concat(rows)); return { error: null }; },
      upsert: async (r: any) => { state.runs.push(r); return { error: null }; },
      then: (res: any, rej: any) => Promise.resolve({
        data: table === "agent_credit_ledger" ? [{ delta: 100 }] : table === "lender_portfolio_clients" ? state.clients : state.staged,
        error: null }).then(res, rej),
    };
    return api;
  },
  async rpc(_n: string, args: any) {
    state.rpc.push(args);
    for (const r of args.p_rows) state.staged.push({ identity_key: r.identity_key, outcome: r.outcome, payload: r.payload });
    return { data: { batch_id: "b", counts: {} }, error: null };
  },
};
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: fakeDb }));

import { runAgentDiscovery } from "../agent-discovery.server";
const run = () => runAgentDiscovery({ userId: "neil", orgId: "o1", portfolioId: "p1", csv: REAL });

describe("Agent Discovery with Neil's five-row Fello file (mocked saves)", () => {
  beforeEach(() => reset());

  it("maps Fello headers: 2 homes, 1 duplicate, 1 contact kept with phone, 1 name-only kept visible", async () => {
    const r = await run();
    expect(r.submitted).toBe(5);
    expect(r.imported).toBe(2);
    expect(r.duplicates).toBe(1);
    expect(r.contactsSaved).toBe(1);
    expect(state.staged).toHaveLength(1);
    expect(state.staged[0].payload.name).toBe("Marlene Lara");
    expect(state.staged[0].payload.phone).toBeTruthy();
    expect(state.staged[0].payload.address).toBeNull();
    expect(state.rpc[0].p_flow).toBe("agent");
    const names = state.runs[0].needs_address.map((n: any) => n.full_name);
    expect(names).toContain("Test Incomplete");
    expect(r.rows!.map((x) => [x.row, x.outcome])).toEqual([
      [1, "property_saved"], [2, "property_saved"], [3, "duplicate"], [4, "contact_saved"], [5, "unusable"],
    ]);
    expect(r.rows![4].name).toBe("Test Incomplete");
    expect(r.contactBatchId).toBe("b");
  });

  it("a retry with the homes already present adds no homes and no second contact", async () => {
    await run();
    const r = await run();
    expect(r.imported).toBe(0);
    expect(r.duplicates).toBe(3);
    expect(r.contactsSaved).toBe(0);
    expect(state.clients).toHaveLength(2);
    expect(state.staged).toHaveLength(1);
    expect(r.rows!.map((x) => [x.row, x.outcome])).toEqual([
      [1, "duplicate"], [2, "duplicate"], [3, "duplicate"], [4, "duplicate"], [5, "unusable"],
    ]);
    expect(state.rpc).toHaveLength(1); // no second staging, no search started
    expect(r.contactBatchId).toBe("b"); // Matchups still reachable after the retry
  });

  it("refuses a book assigned to someone else (e.g. Sam's) before saving anything", async () => {
    reset("sam");
    await expect(run()).rejects.toThrow(/your own book/);
    expect(state.clients).toHaveLength(0);
    expect(state.staged).toHaveLength(0);
  });
});
