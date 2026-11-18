import { describe, it, expect } from "vitest";
import { assertClaimInviteOwner } from "./claim-invite-guard";

const BOOK = { id: "book-1", lender_org_id: "org-1", assigned_user_id: "assigned" };
const MEMBERS = ["assigned", "member", "manager", "owner"];

function setup() {
  const invites = [{ id: "inv-1", client_id: "c1", revoked_at: null as string | null }];
  const db = {
    from(table: string) {
      const f: Record<string, any> = {};
      const q: any = {
        select: () => q,
        eq: (k: string, v: any) => ((f[k] = v), q),
        update: () => { throw new Error("guard must not write"); },
        insert: () => { throw new Error("guard must not write"); },
        maybeSingle: async () => {
          if (table === "lender_portfolios") return { data: f.id === BOOK.id ? BOOK : null, error: null };
          if (table === "lender_members") return { data: MEMBERS.includes(f.user_id) ? { user_id: f.user_id } : null };
          return { data: null };
        },
      };
      return q;
    },
  };
  // Mirrors createClaimLink ordering: guard first, then revoke + insert.
  async function create(userId: string) {
    await assertClaimInviteOwner(db, userId, BOOK.id);
    invites.forEach((i) => (i.revoked_at = "now"));
    invites.push({ id: `inv-${invites.length + 1}`, client_id: "c1", revoked_at: null });
  }
  return { invites, create };
}

describe("createClaimLink assigned-book ownership", () => {
  it("lets the assigned professional create an invitation", async () => {
    const { invites, create } = setup();
    await create("assigned");
    expect(invites).toHaveLength(2);
    expect(invites[0].revoked_at).toBe("now");
  });

  for (const who of ["member", "manager", "owner", "admin"]) {
    it(`refuses unassigned ${who} and leaves existing invitations unchanged`, async () => {
      const { invites, create } = setup();
      const before = JSON.stringify(invites);
      await expect(create(who)).rejects.toThrow("assigned");
      expect(JSON.stringify(invites)).toBe(before);
    });
  }

  it("refuses when the client has no book", async () => {
    await expect(assertClaimInviteOwner({}, "assigned", null)).rejects.toThrow("Client not found");
  });
});
