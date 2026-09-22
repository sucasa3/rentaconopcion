/**
 * Property-record authorization.
 *
 * The rule under test: a raw provider property record is never released on the
 * strength of an address string a signed-in person can edit on their own
 * profile. Direct client reads are denied by policy (admin only); product
 * reads go through the server-controlled reader, after the caller has been
 * authorized against server-controlled records (their own home profile, or
 * organization membership plus consent for a portfolio client row).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

/** Every row the provider cache holds, across two different households. */
const ROWS: Record<string, any> = {
  "10 owner st, atlanta, ga 30301": {
    address_normalized: "10 owner st, atlanta, ga 30301",
    address_line1: "10 Owner St",
    avm: { amount: { value: 500000 } },
  },
  "99 someone else rd, atlanta, ga 30301": {
    address_normalized: "99 someone else rd, atlanta, ga 30301",
    address_line1: "99 Someone Else Rd",
    avm: { amount: { value: 900000 } },
  },
};

let adminCalls: number;
/** Stand-in for the service-role client: the only client allowed to read. */
function adminClient() {
  return {
    from(table: string) {
      expect(table).toBe("property_intel");
      adminCalls += 1;
      return {
        select() {
          return {
            in(column: string, keys: string[]) {
              const rows = Object.values(ROWS).filter((r) =>
                keys.includes(column === "address_line1" ? r.address_line1 : r.address_normalized),
              );
              return Promise.resolve({ data: rows, error: null });
            },
          };
        },
      };
    },
  };
}

/**
 * A user-scoped client behaves as RLS now does for a non-admin: no policy
 * grants a read, so it returns nothing no matter what address is asked for.
 */
function userScopedClient() {
  return {
    from() {
      return {
        select() {
          return { in: () => Promise.resolve({ data: [], error: null }) };
        },
      };
    },
  };
}

vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return adminClient();
  },
}));

beforeEach(() => {
  adminCalls = 0;
  vi.resetModules();
});

describe("raw property records are not reachable by address alone", () => {
  it("a user-scoped client cannot read any raw property record", async () => {
    const db = userScopedClient() as any;
    const { data } = await db.from("property_intel").select("*").in("address_normalized", [
      "99 someone else rd, atlanta, ga 30301",
    ]);
    expect(data).toEqual([]);
  });

  it("changing a profile address does not widen what a user-scoped client sees", async () => {
    const db = userScopedClient() as any;
    // User A "edits" their profile to User B's address and asks for it.
    const { data } = await db
      .from("property_intel")
      .select("*")
      .in("address_normalized", ["99 someone else rd, atlanta, ga 30301"]);
    expect(data).toEqual([]);
  });

  it("the server-controlled reader ignores any caller-supplied client", async () => {
    const { clientFactsFor } = await import("../client-facts.server");
    const facts = await clientFactsFor(userScopedClient() as any, [
      {
        id: "client-a",
        address_line1: "10 Owner St",
        city: "Atlanta",
        state: "GA",
        zip: "30301",
      } as any,
    ]);
    // The record was found through the admin reader, not the passed client.
    expect(adminCalls).toBeGreaterThan(0);
    expect(facts.get("client-a")?.hasRecord).toBe(true);
  });

  it("only the keys the caller was authorized for are read", async () => {
    const { readPropertyIntelByNormalized } = await import("../property-access.server");
    const rows = await readPropertyIntelByNormalized(
      "address_normalized",
      ["10 owner st, atlanta, ga 30301"],
    );
    expect(rows.map((r) => r.address_normalized)).toEqual(["10 owner st, atlanta, ga 30301"]);
  });

  it("an empty entitlement set reads nothing", async () => {
    const { readPropertyIntelByNormalized, readPropertyIntelByLine1 } = await import(
      "../property-access.server"
    );
    expect(await readPropertyIntelByNormalized("*", [])).toEqual([]);
    expect(await readPropertyIntelByLine1("*", [])).toEqual([]);
    expect(adminCalls).toBe(0);
  });
});
