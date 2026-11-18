import { beforeEach, describe, expect, it, vi } from "vitest";

const signTypedInviteToken = vi.fn(() => "signed-test-token");
const isSuppressed = vi.fn(async () => false);

vi.mock("./invite-token.server", () => ({ signTypedInviteToken }));
vi.mock("./suppression.server", () => ({ isSuppressed }));

const invites: any[] = [];
const admin = {
  from(table: string) {
    const filters: Record<string, any> = {};
    const nullFilters = new Set<string>();
    const query: any = {
      select: () => query,
      eq: (key: string, value: any) => ((filters[key] = value), query),
      is: (key: string, value: any) => {
        if (value === null) nullFilters.add(key);
        return query;
      },
      update: (values: Record<string, any>) => {
        Object.assign(query, {
          then: (resolve: any, reject: any) => Promise.resolve().then(() => {
            for (const invite of invites) {
              if (invite.client_id !== filters.client_id) continue;
              if ([...nullFilters].some((key) => invite[key] !== null)) continue;
              Object.assign(invite, values);
            }
            return { data: null, error: null };
          }).then(resolve, reject),
        });
        return query;
      },
      insert: (values: Record<string, any>) => {
        Object.assign(query, {
          single: async () => {
            const row = { ...values, id: `inv-${invites.length + 1}`, revoked_at: null, claimed_at: null };
            invites.push(row);
            return { data: { id: row.id }, error: null };
          },
        });
        return query;
      },
      maybeSingle: async () => ({
        data: table === "profiles" ? { full_name: "Assigned Professional" } : null,
        error: null,
      }),
    };
    return query;
  },
};

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: admin }));

import { createClaimLinkHandler } from "./homeowner-claim-create";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const BOOK_ID = "book-1";
const ASSIGNED = "assigned";

type SetupOptions = {
  assignedUserId?: string | null;
  activeMember?: boolean;
  portfolioId?: string | null;
};

function setup({ assignedUserId = ASSIGNED, activeMember = true, portfolioId = BOOK_ID }: SetupOptions = {}) {
  invites.splice(0, invites.length, {
    id: "inv-1",
    client_id: CLIENT_ID,
    revoked_at: null,
    claimed_at: null,
  });
  signTypedInviteToken.mockClear();
  isSuppressed.mockClear();

  const client = {
    id: CLIENT_ID,
    portfolio_id: portfolioId,
    client_name: "Test Homeowner",
    client_email: "homeowner@example.com",
    client_phone: null,
    address_line1: "1 Main St",
    city: "Austin",
    state: "TX",
    zip: "78701",
    archived_at: null,
    homeowner_id: null,
    lender_portfolios: { lender_org_id: "org-1" },
  };
  const book = {
    id: BOOK_ID,
    lender_org_id: "org-1",
    assigned_user_id: assignedUserId,
  };
  const filters: Record<string, any> = {};
  const db = {
    from(table: string) {
      const query: any = {
        select: () => query,
        eq: (key: string, value: any) => ((filters[`${table}.${key}`] = value), query),
        maybeSingle: async () => {
          if (table === "lender_portfolio_clients") return { data: client, error: null };
          if (table === "lender_portfolios") {
            return { data: filters[`${table}.id`] === BOOK_ID ? book : null, error: null };
          }
          if (table === "lender_members") {
            const userId = filters[`${table}.user_id`];
            return { data: activeMember && userId === ASSIGNED ? { user_id: userId } : null, error: null };
          }
          return { data: null, error: null };
        },
      };
      return query;
    },
  };

  return {
    invites,
    create: (userId = ASSIGNED) => createClaimLinkHandler({
      data: { clientId: CLIENT_ID, origin: "https://sucasa.com" },
      context: { supabase: db, userId },
      requestUrl: "https://sucasa.com/lender",
    }),
  };
}

function expectDeniedWithoutChanges(before: string) {
  expect(JSON.stringify(invites)).toBe(before);
  expect(signTypedInviteToken).not.toHaveBeenCalled();
}

describe("createClaimLink production handler assigned-book ownership", () => {
  beforeEach(() => setup());

  it("lets the assigned active professional create an invitation", async () => {
    const { create } = setup();
    const result = await create();

    expect(invites).toHaveLength(2);
    expect(invites[0].revoked_at).not.toBeNull();
    expect(invites[1]).toMatchObject({
      client_id: CLIENT_ID,
      created_by: ASSIGNED,
      email: "homeowner@example.com",
      revoked_at: null,
    });
    expect(signTypedInviteToken).toHaveBeenCalledTimes(1);
    expect(signTypedInviteToken).toHaveBeenCalledWith(expect.objectContaining({
      invitationId: "inv-2",
      context: "homeowner_claim",
      email: "homeowner@example.com",
    }));
    expect(result.url).toBe("https://sucasa.com/claim?t=signed-test-token");
  });

  for (const who of ["member", "manager", "owner", "admin"]) {
    it(`denies an unassigned ${who}, leaves invitations unchanged, and creates no token`, async () => {
      const { create } = setup();
      const before = JSON.stringify(invites);

      await expect(create(who)).rejects.toThrow("Only the professional assigned to this client's book");
      expectDeniedWithoutChanges(before);
    });
  }

  it("denies an assigned but inactive member, leaves invitations unchanged, and creates no token", async () => {
    const { create } = setup({ activeMember: false });
    const before = JSON.stringify(invites);

    await expect(create()).rejects.toThrow("Only the professional assigned to this client's book");
    expectDeniedWithoutChanges(before);
  });

  it("denies a client without a book, leaves invitations unchanged, and creates no token", async () => {
    const { create } = setup({ portfolioId: null });
    const before = JSON.stringify(invites);

    await expect(create()).rejects.toThrow("Client not found.");
    expectDeniedWithoutChanges(before);
  });
});
