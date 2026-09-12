import { describe, it, expect } from "vitest";
import {
  agentMayChangeLender,
  isReviewed,
  orderReviewQueue,
  progressLabel,
  rankProfessionals,
  reviewProgress,
  skipChangesState,
  suggestionLabel,
  summarizeBulk,
  visibleProfessionalContact,
  isLockedByHomeowner,
  type NetworkProfessional,
  type ReviewQueueItem,
} from "../agent-network";
import { classifyLenderAccess } from "../lender-access";

const item = (over: Partial<ReviewQueueItem>): ReviewQueueItem => ({
  portfolioClientId: "c1",
  clientName: "Kevin DeJesus",
  address: "1010 Arbor Creek Dr",
  suggestions: [],
  onFile: null,
  decision: null,
  ...over,
});

describe("review progress semantics", () => {
  it("skip leaves the record pending and never counts as reviewed", () => {
    expect(skipChangesState()).toBe(false);
    const p = reviewProgress([{ decision: null }, { decision: "pending" }], 2);
    expect(p.reviewed).toBe(0);
    expect(progressLabel(p)).toBe("0 of 2 client Home Teams reviewed");
  });

  it("'I don't know' counts as reviewed", () => {
    expect(isReviewed("unknown")).toBe(true);
    expect(reviewProgress([{ decision: "unknown" }, { decision: null }], 2).reviewed).toBe(1);
  });

  it("counts assigned and no-lender as reviewed, pending as not", () => {
    expect(isReviewed("assigned")).toBe(true);
    expect(isReviewed("no_lender")).toBe(true);
    expect(isReviewed("pending")).toBe(false);
  });

  it("never reports more reviewed than the total", () => {
    expect(reviewProgress([{ decision: "assigned" }, { decision: "assigned" }], 1).reviewed).toBe(1);
  });
});

describe("provider evidence stays a suggestion", () => {
  it("labels an unresolved institution as a hint, never as the answer", () => {
    expect(suggestionLabel("Movement Mortgage")).toBe("Property data suggests: Movement Mortgage");
  });
});

describe("homeowner confirmation is authoritative over agent actions", () => {
  it("an agent may not change a homeowner-confirmed lender", () => {
    expect(agentMayChangeLender("confirmed")).toBe(false);
    expect(agentMayChangeLender("asserted")).toBe(true);
    expect(agentMayChangeLender(null)).toBe(true);
  });

  it("a confirmed record is locked in the review UI", () => {
    const locked = item({
      onFile: {
        relationshipId: "r1",
        professionalId: "p1",
        professionalName: "John Smith",
        status: "confirmed",
      },
    });
    expect(isLockedByHomeowner(locked)).toBe(true);
    expect(isLockedByHomeowner(item({}))).toBe(false);
  });
});

describe("bulk apply reports what actually happened", () => {
  it("does not claim 12 updates when only 10 changed", () => {
    const results = [
      ...Array.from({ length: 10 }, (_, i) => ({ portfolioClientId: `c${i}`, outcome: "assigned" as const })),
      { portfolioClientId: "x1", outcome: "blocked_homeowner_confirmed" as const },
      { portfolioClientId: "x2", outcome: "not_in_workspace" as const },
    ];
    const s = summarizeBulk(results);
    expect(s.updated).toBe(10);
    expect(s.blocked).toBe(2);
    expect(s.message).toContain("10 Home Teams updated");
    expect(s.message).not.toContain("12 Home Teams updated");
  });
});

describe("contact provenance between agent workspaces", () => {
  const unclaimed = {
    email_normalized: "maria@lender.com",
    email_verified: false,
    phone_normalized: "3055551234",
    phone_verified: false,
    claim_status: "unclaimed" as const,
  };

  it("workspace A cannot see unverified contact supplied by workspace B", () => {
    // Workspace A supplied nothing itself.
    const seen = visibleProfessionalContact(unclaimed, {});
    expect(seen.email).toBeNull();
    expect(seen.phone).toBeNull();
  });

  it("a workspace sees back what it supplied itself", () => {
    const seen = visibleProfessionalContact(unclaimed, {
      email: "maria.mine@lender.com",
      phone: "4045559999",
    });
    expect(seen.email).toBe("maria.mine@lender.com");
    expect(seen.phone).toBe("4045559999");
  });

  it("verified or claimed contact is shared", () => {
    const seen = visibleProfessionalContact({ ...unclaimed, email_verified: true }, {});
    expect(seen.email).toBe("maria@lender.com");
    expect(seen.emailShared).toBe(true);
    const claimed = visibleProfessionalContact({ ...unclaimed, claim_status: "claimed" }, {});
    expect(claimed.phone).toBe("3055551234");
  });
});

describe("queue ordering and search", () => {
  it("puts unreviewed records with a hint first", () => {
    const ordered = orderReviewQueue([
      item({ portfolioClientId: "reviewed", clientName: "Ana", decision: "assigned" }),
      item({ portfolioClientId: "no-hint", clientName: "Bob" }),
      item({
        portfolioClientId: "hint",
        clientName: "Zed",
        suggestions: [{ candidateId: "k1", institution: "Movement Mortgage", confidence: 0.7 }],
      }),
    ]);
    expect(ordered.map((i) => i.portfolioClientId)).toEqual(["hint", "no-hint", "reviewed"]);
  });

  it("ranks recently used people first, then by usage", () => {
    const people: NetworkProfessional[] = [
      {
        id: "a",
        full_name: "Ana Lender",
        org_name: "Fairway",
        roles: [],
        email: null,
        phone: null,
        clientCount: 9,
        hasSucasaIdentity: false,
        needsReview: false,
        lastUsedAt: null,
      },
      {
        id: "m",
        full_name: "Maria Lopez",
        org_name: "Movement",
        roles: [],
        email: null,
        phone: null,
        clientCount: 1,
        hasSucasaIdentity: true,
        needsReview: false,
        lastUsedAt: null,
      },
    ];
    expect(rankProfessionals(people, { recentIds: ["m"] })[0]!.id).toBe("m");
    expect(rankProfessionals(people)[0]!.id).toBe("a");
    expect(rankProfessionals(people, { query: "movement" }).map((p) => p.id)).toEqual(["m"]);
  });
});

describe("SECURITY: an agent assignment is not an access basis", () => {
  it("naming a lender for a client grants that lender nothing", () => {
    // An agent asserting "this is the client's lender" supplies no basis at all.
    const access = classifyLenderAccess({ relationshipBasis: "agent_asserted" });
    expect(access.named).toBe(false);
    expect(access.category).not.toBe("own_relationship");
    expect(access.scopes).toHaveLength(0);
  });
});

