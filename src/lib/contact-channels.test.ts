import { describe, expect, it } from "vitest";
import {
  blockedChannels,
  evaluateAgentChannels,
  permittedChannels,
  type ChannelOption,
} from "@/lib/contact-channels";
import { channelDecision, classifyLenderAccess } from "@/lib/lender-access";

const perm = (over: Record<string, unknown> = {}) =>
  ({
    email_allowed: false,
    sms_allowed: false,
    phone_allowed: false,
    automated_contact_allowed: false,
    do_not_call: false,
    do_not_text: false,
    do_not_email: false,
    consent_source: null,
    consent_basis: null,
    consent_at: null,
    ...over,
  }) as never;

const base = {
  relationshipBasis: "org_uploaded",
  hasPhone: true,
  hasEmail: true,
  permission: null,
  recommended: "email" as const,
};

const get = (opts: ChannelOption[], c: string) => opts.find((o) => o.channel === c)!;

describe("agent channel eligibility", () => {
  it("A — documented relationship with full contact details offers all three", () => {
    const opts = evaluateAgentChannels(base);
    expect(permittedChannels(opts).map((o) => o.channel)).toEqual(["email", "call", "text"]);
    expect(blockedChannels(opts)).toHaveLength(0);
  });

  it("B — phone only: email is blocked with a data reason, not a permission reason", () => {
    const opts = evaluateAgentChannels({ ...base, hasEmail: false });
    expect(permittedChannels(opts).map((o) => o.channel).sort()).toEqual(["call", "text"]);
    expect(get(opts, "email").reason).toMatch(/No email address/);
  });

  it("C — email only: call and text explain the missing phone number", () => {
    const opts = evaluateAgentChannels({ ...base, hasPhone: false });
    expect(permittedChannels(opts).map((o) => o.channel)).toEqual(["email"]);
    expect(get(opts, "call").reason).toMatch(/No phone number/);
  });

  it("D — no documented relationship: nothing is contactable, reason says why", () => {
    const opts = evaluateAgentChannels({ ...base, relationshipBasis: null });
    expect(permittedChannels(opts)).toHaveLength(0);
    expect(get(opts, "call").reason).toMatch(/no documented client relationship/);
  });

  it("E — explicit recorded permission alone is enough without a documented basis", () => {
    const opts = evaluateAgentChannels({
      ...base,
      relationshipBasis: "unknown_source",
      permission: perm({ sms_allowed: true }),
    });
    expect(permittedChannels(opts).map((o) => o.channel)).toEqual(["text"]);
  });

  it("F — opt-out always wins over a documented relationship", () => {
    const opts = evaluateAgentChannels({
      ...base,
      permission: perm({ do_not_text: true, phone_allowed: true }),
    });
    expect(get(opts, "text").available).toBe(false);
    expect(get(opts, "text").reason).toMatch(/not to be texted/);
    expect(get(opts, "call").available).toBe(true);
  });

  it("G — the recommendation marks emphasis, it never hides other channels", () => {
    const opts = evaluateAgentChannels({ ...base, recommended: "text" });
    expect(get(opts, "text").recommended).toBe(true);
    expect(get(opts, "call").available).toBe(true);
    expect(get(opts, "email").available).toBe(true);
    expect(permittedChannels(opts)[0]!.channel).toBe("text");
  });

  it("H — no usable channel at all is reported, not silently empty", () => {
    const opts = evaluateAgentChannels({
      ...base,
      hasPhone: false,
      hasEmail: false,
    });
    expect(permittedChannels(opts)).toHaveLength(0);
    expect(blockedChannels(opts)).toHaveLength(3);
    expect(blockedChannels(opts).every((o) => Boolean(o.reason))).toBe(true);
  });

  it("I — the same homeowner can be contactable by their agent and not by a lender", () => {
    const agent = evaluateAgentChannels(base);
    expect(get(agent, "call").available).toBe(true);

    const lenderAccess = classifyLenderAccess({
      relationshipBasis: null,
      sponsored: true,
      askedToConnect: false,
      agentConnected: true,
      consentScopes: [],
      suppressed: false,
    } as never);
    const lender = channelDecision("call", null, lenderAccess, {
      hasPhone: true,
      hasEmail: true,
    });
    expect(lender.allowed).toBe(false);
  });
});
