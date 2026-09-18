import { describe, expect, it } from "vitest";
import {
  ANONYMITY_THRESHOLD,
  ECONOMIC_GUARDRAIL,
  DISCLOSURE_VERSION,
  aggregateOpportunities,
  agentMayRespond,
  authorizedChannels,
  canRevealHomeowner,
  canTransition,
  consentDisclosure,
  lenderCategoryFor,
  stateAfterRevocation,
  suppressionFor,
} from "@/lib/introductions";

describe("introduction state machine", () => {
  it("starts at lender_requested and only the agent may move it forward", () => {
    expect(agentMayRespond("lender_requested")).toBe(true);
    expect(agentMayRespond("agent_offered")).toBe(false);
    expect(canTransition("lender_requested", "agent_offered")).toBe(true);
    expect(canTransition("lender_requested", "agent_declined")).toBe(true);
    // The lender can never jump the homeowner step.
    expect(canTransition("lender_requested", "homeowner_accepted")).toBe(false);
    expect(canTransition("agent_offered", "connection_active")).toBe(false);
  });

  it("is terminal after a decline", () => {
    expect(canTransition("agent_declined", "agent_offered")).toBe(false);
    expect(canTransition("homeowner_declined", "homeowner_accepted")).toBe(false);
  });
});

describe("reveal gate", () => {
  const granted = [{ channel: "email" as const, status: "granted" as const }];

  it("reveals nothing before homeowner acceptance", () => {
    for (const state of ["lender_requested", "agent_offered", "agent_declined", "homeowner_declined"] as const) {
      expect(canRevealHomeowner(state, granted)).toBe(false);
    }
  });

  it("reveals only after acceptance with a live channel", () => {
    expect(canRevealHomeowner("homeowner_accepted", granted)).toBe(true);
    expect(canRevealHomeowner("connection_active", granted)).toBe(true);
    expect(canRevealHomeowner("homeowner_accepted", [])).toBe(false);
    expect(canRevealHomeowner("permission_revoked", granted)).toBe(false);
  });
});

describe("channel-specific consent", () => {
  it("exposes only affirmatively granted channels", () => {
    const grants = [
      { channel: "call" as const, status: "granted" as const },
      { channel: "text" as const, status: "revoked" as const },
    ];
    expect(authorizedChannels(grants)).toEqual(["call"]);
  });

  it("keeps the connection active while one channel remains", () => {
    expect(
      stateAfterRevocation([
        { channel: "call", status: "revoked" },
        { channel: "email", status: "granted" },
      ]),
    ).toBe("connection_active");
  });

  it("only revokes the introduction when every channel is withdrawn", () => {
    expect(
      stateAfterRevocation([
        { channel: "call", status: "revoked" },
        { channel: "email", status: "revoked" },
      ]),
    ).toBe("permission_revoked");
  });

  it("scopes suppression to homeowner + lender + purpose + channel", () => {
    const rows = suppressionFor("client-1", "lender-1", ["text"]);
    expect(rows).toEqual([
      { homeownerRef: "client-1", lenderOrgId: "lender-1", purpose: "introduction", channel: "text" },
    ]);
  });
});

describe("consent disclosure", () => {
  it("names the lender, the destination and the required terms", () => {
    const text = consentDisclosure({
      lenderOrgName: "Acme Mortgage",
      lenderContactName: "Dana Lopez",
      phone: "+1 305 555 0134",
      channels: ["call", "text"],
    });
    expect(text).toContain("Acme Mortgage");
    expect(text).toContain("Dana Lopez");
    expect(text).toContain("+1 305 555 0134");
    expect(text).toContain("automated technology");
    expect(text).toContain("Consent is not a condition");
    expect(text).toContain("withdraw your consent");
    expect(DISCLOSURE_VERSION).toBe("intro_consent_v1");
  });

  it("omits automated-dialer language when only email is authorized", () => {
    const text = consentDisclosure({
      lenderOrgName: "Acme Mortgage",
      email: "someone@example.com",
      channels: ["email"],
    });
    expect(text).not.toContain("automated technology");
  });

  it("has a Spanish version", () => {
    const text = consentDisclosure({
      lenderOrgName: "Acme Mortgage",
      phone: "305-555-0134",
      channels: ["call"],
      language: "es",
    });
    expect(text).toContain("Conéctame");
    expect(text).toContain("no es una condición");
  });
});

describe("aggregate anonymity", () => {
  const many = (category: string, n: number) => Array.from({ length: n }, () => ({ category }));

  it("returns broad categories with counts only", () => {
    const out = aggregateOpportunities(many("equity", 7));
    expect(out).toHaveLength(1);
    expect(out[0]!.category).toBe("equity_access");
    expect(out[0]!.count).toBe(7);
    expect(out[0]!.suppressed).toBe(false);
    expect(Object.keys(out[0]!)).toEqual(["category", "label", "explanation", "count", "suppressed"]);
  });

  it("collapses narrow internal categories so filters cannot narrow a population", () => {
    const out = aggregateOpportunities([...many("equity", 3), ...many("heloc", 3)]);
    expect(out).toHaveLength(1);
    expect(out[0]!.count).toBe(6);
    expect(lenderCategoryFor("heloc")).toBe("equity_access");
  });

  it("withholds counts below the anonymity threshold instead of rounding them", () => {
    const out = aggregateOpportunities(many("refinance_review", ANONYMITY_THRESHOLD - 1));
    expect(out[0]!.count).toBeNull();
    expect(out[0]!.suppressed).toBe(true);
  });

  it("exposes no identifying or reconstructable dimension", () => {
    const out = aggregateOpportunities([
      ...many("equity", 6),
      ...many("move_up", 6),
    ]);
    const serialized = JSON.stringify(out);
    for (const forbidden of ["city", "zip", "state", "band", "score", "equity_cents", "id", "at"]) {
      expect(serialized.toLowerCase()).not.toContain(`"${forbidden}`);
    }
  });

  it("ignores categories with no lender-facing equivalent", () => {
    expect(aggregateOpportunities(many("maintenance", 9))).toEqual([]);
  });
});

describe("economic separation", () => {
  it("declares every table and event that introduction activity may not touch", () => {
    expect(ECONOMIC_GUARDRAIL.forbiddenTables).toContain("agent_credit_ledger");
    expect(ECONOMIC_GUARDRAIL.forbiddenTables).toContain("plan_tiers");
    expect(ECONOMIC_GUARDRAIL.forbiddenFunctions).toContain("award_agent_credit");
    for (const event of ["homeowner_accepted", "application", "funded_loan", "closing"]) {
      expect(ECONOMIC_GUARDRAIL.neutralEvents).toContain(event);
    }
  });
});
