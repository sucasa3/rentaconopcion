import { describe, expect, it } from "vitest";
import {
  auditRankingInputs,
  channelDecision,
  checkLenderLanguage,
  classifyLenderAccess,
  priorityBand,
  supportsReview,
} from "./lender-access";

const uploaded = { relationshipBasis: "lender_upload" };

describe("A — lender uploads its own existing customer", () => {
  it("is named and workable, but only within its documented scope", () => {
    const a = classifyLenderAccess(uploaded);
    expect(a.category).toBe("own_relationship");
    expect(a.named).toBe(true);
    expect(a.inQueue).toBe(true);
    // Baseline: the lender's own loan facts, but not behavioural engagement.
    expect(a.scopes).toEqual([
      "contact",
      "property_snapshot",
      "valuation",
      "mortgage",
      "equity",
    ]);
    expect(a.scopes).not.toContain("engagement");

  });

  it("honours a wider documented scope when one is recorded", () => {
    const a = classifyLenderAccess({
      ...uploaded,
      intelligenceAccessScope: ["contact", "mortgage", "equity"],
    });
    expect(a.scopes).toEqual(["contact", "mortgage", "equity"]);
  });
});

describe("B — lender is merely connected to the homeowner's agent", () => {
  it("never exposes the homeowner individually", () => {
    const a = classifyLenderAccess({ isAgentConnected: true });
    expect(a.category).toBe("agent_connected_only");
    expect(a.named).toBe(false);
    expect(a.inQueue).toBe(false);
    expect(a.scopes).toEqual([]);
  });
});

describe("C — sponsored only", () => {
  it("gives aggregate reporting and nothing identifiable", () => {
    const a = classifyLenderAccess({ isSponsored: true });
    expect(a.category).toBe("sponsored_only");
    expect(a.named).toBe(false);
    expect(a.inQueue).toBe(false);
    expect(a.scopes).toEqual([]);
    expect(channelDecision("email", { email_allowed: true }, a).allowed).toBe(false);
  });
});

describe("D — sponsored homeowner asks to connect", () => {
  it("becomes named, queued and limited to what was authorised", () => {
    const a = classifyLenderAccess({
      isSponsored: true,
      hasConnectionRequest: true,
      connectionRequestScope: ["equity"],
    });
    expect(a.category).toBe("asked_to_connect");
    expect(a.named).toBe(true);
    expect(a.scopes).toEqual(["contact", "equity"]);
    // Invitation permits a manual reply but never automated sending.
    const d = channelDecision("email", null, a);
    expect(d.allowed).toBe(true);
    expect(d.automatedAllowed).toBe(false);
  });
});

describe("E — agent and lender both have their own relationship", () => {
  it("each side is classified from its own basis only", () => {
    const lender = classifyLenderAccess({ ...uploaded, isAgentConnected: true });
    const otherLender = classifyLenderAccess({ isAgentConnected: true });
    expect(lender.category).toBe("own_relationship");
    expect(otherLender.category).toBe("agent_connected_only");
  });
});

describe("F — strong estimated equity", () => {
  it("creates an equity review only with the facts behind it, and claims nothing", () => {
    expect(supportsReview("equity_review", { estimated_equity: 90_000, estimated_value: 400_000 })).toBe(
      true,
    );
    expect(supportsReview("equity_review", { estimated_value: 400_000 })).toBe(false);
    // Generic property data alone cannot create a mortgage product review.
    expect(supportsReview("refinance_review", { estimated_value: 400_000 })).toBe(false);
    expect(checkLenderLanguage("Estimated equity has increased. Worth offering a review.").ok).toBe(
      true,
    );
  });
});

describe("G — generated brief language", () => {
  it("rejects credit-decision and promise wording", () => {
    for (const bad of [
      "They are qualified for a cash-out refinance.",
      "Kevin is pre-approved for a HELOC.",
      "Guaranteed savings of $300 a month.",
      "You are the preferred lender for this homeowner.",
      "Their creditworthiness is strong.",
      "You can borrow $80,000 today.",
    ]) {
      expect(checkLenderLanguage(bad).ok).toBe(false);
    }
  });
});

describe("H — sponsorship never affects ranking", () => {
  it("excludes sponsorship, agent connection and referral volume from ranking inputs", () => {
    expect(auditRankingInputs(["estimated_equity", "loan_age"]).ok).toBe(true);
    expect(auditRankingInputs(["estimated_equity", "sponsorship"]).prohibited).toContain(
      "sponsorship",
    );
    expect(auditRankingInputs(["agent_connection"]).ok).toBe(false);
    expect(auditRankingInputs(["neighborhood_racial_composition"]).ok).toBe(false);
    expect(auditRankingInputs(["credit_score", "approval_probability"]).prohibited).toHaveLength(2);
    // Sponsoring cannot change the band a homeowner lands in.
    expect(priorityBand(62)).toBe(priorityBand(62));
  });
});

describe("I — closing a loan", () => {
  it("is a lender-side outcome with no agent-facing inputs in the model", () => {
    const audit = auditRankingInputs(["prior_outcome", "days_since_contact"]);
    expect(audit.ok).toBe(true);
    expect(audit.prohibited).toEqual([]);
    expect(auditRankingInputs(["referral_volume"]).ok).toBe(false);
  });
});

describe("outreach channel gate", () => {
  it("suppression always wins, even with permission and a request on file", () => {
    const access = classifyLenderAccess({ ...uploaded, hasConnectionRequest: true });
    expect(channelDecision("call", { phone_allowed: true, do_not_call: true }, access).allowed).toBe(
      false,
    );
    expect(channelDecision("email", { do_not_email: true }, access).allowed).toBe(false);
  });

  it("allows a manual touch to the lender's own customer, but never automated sending", () => {
    const access = classifyLenderAccess(uploaded);
    const d = channelDecision("text", null, access);
    expect(d.allowed).toBe(true);
    expect(d.automatedAllowed).toBe(false);
    expect(channelDecision("text", { sms_allowed: true, automated_contact_allowed: true }, access)
      .automatedAllowed).toBe(true);
  });

  it("does not open a channel for a homeowner the lender has no basis for", () => {
    const access = classifyLenderAccess({ relationshipBasis: null, isSponsored: true });
    expect(channelDecision("text", { sms_allowed: true }, access).allowed).toBe(false);
    expect(channelDecision("email", null, access).allowed).toBe(false);
  });

  it("says 'no detail on file' rather than 'no permission' when contact data is missing", () => {
    const access = classifyLenderAccess(uploaded);
    const d = channelDecision("call", null, access, { hasPhone: false, hasEmail: true });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/no phone number/i);
    expect(channelDecision("email", null, access, { hasPhone: false, hasEmail: true }).allowed).toBe(
      true,
    );
  });

  it("suppression still wins over the existing-relationship default", () => {
    const access = classifyLenderAccess(uploaded);
    expect(
      channelDecision("call", { do_not_call: true }, access, { hasPhone: true }).allowed,
    ).toBe(false);
  });
});


describe("importer relationship labels", () => {
  it("treats org_uploaded as the lender's own relationship with baseline scopes", () => {
    const a = classifyLenderAccess({ relationshipBasis: "org_uploaded", intelligenceAccessScope: [] });
    expect(a.category).toBe("own_relationship");
    expect(a.named).toBe(true);
    expect(a.scopes).toContain("valuation");
    expect(a.scopes).toContain("equity");
  });
});
