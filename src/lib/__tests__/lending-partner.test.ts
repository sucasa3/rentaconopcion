import { describe, it, expect } from "vitest";
import {
  authorizedAgentOrg,
  contactPayload,
  designationIsLive,
  sharedFieldsFor,
  suggestedOfficer,
  displayedNmls,
  inquiryConsentLanguage,
} from "../lending-partner";

const H = "home-1";

describe("NMLS identifiers", () => {
  it("does not show placeholder zeros as a credential", () => {
    expect(displayedNmls("NMLS 000000")).toBeNull();
    expect(displayedNmls("pending")).toBeNull();
    expect(displayedNmls("NMLS #123456")).toBe("123456");
  });
});

describe("suggested officer", () => {
  it("suggests the LO who invited the agent", () => {
    expect(suggestedOfficer({ owner_user_id: null, invited_by: "lo-1" })).toBe("lo-1");
  });
  it("suggests the assigned LO when a branch manager invited on their behalf", () => {
    expect(suggestedOfficer({ owner_user_id: "lo-2", invited_by: "bm-1" })).toBe("lo-2");
  });
});

describe("authorized agent relationship", () => {
  it("a CSV row without the homeowner's own account link does not authorize", () => {
    expect(
      authorizedAgentOrg(H, [
        { agent_org_id: "a", org_type: "agent", homeowner_id: null, archived_at: null, created_at: "2026-01-01" },
      ]),
    ).toBeNull();
  });
  it("an archived link does not authorize", () => {
    expect(
      authorizedAgentOrg(H, [
        { agent_org_id: "a", org_type: "agent", homeowner_id: H, archived_at: "2026-02-01", created_at: "2026-01-01" },
      ]),
    ).toBeNull();
  });
  it("a lender's own book row is not an agent relationship", () => {
    expect(
      authorizedAgentOrg(H, [
        { agent_org_id: "l", org_type: "lender", homeowner_id: H, archived_at: null, created_at: "2026-01-01" },
      ]),
    ).toBeNull();
  });
  it("a linked, active agent row authorizes", () => {
    expect(
      authorizedAgentOrg(H, [
        { agent_org_id: "a", org_type: "agent", homeowner_id: H, archived_at: null, created_at: "2026-01-01" },
      ]),
    ).toBe("a");
  });
});

describe("designation liveness", () => {
  it("disappears when the agent–lender connection is disconnected", () => {
    expect(designationIsLive({ designationRemoved: false, connectionStatus: "disconnected", officerActiveMember: true })).toBe(false);
  });
  it("disappears when the agent removes it", () => {
    expect(designationIsLive({ designationRemoved: true, connectionStatus: "connected", officerActiveMember: true })).toBe(false);
  });
  it("disappears when the LO leaves the branch", () => {
    expect(designationIsLive({ designationRemoved: false, connectionStatus: "connected", officerActiveMember: false })).toBe(false);
  });
});

describe("what is shared", () => {
  it("records the selected language and explicit optional sharing decision", () => {
    expect(inquiryConsentLanguage("en", false)).toContain("I do not authorize sharing my estimated home value or equity");
    expect(inquiryConsentLanguage("es", true)).toContain("También autorizo compartir el valor estimado de mi casa y mi equity");
  });
  it("defaults to name, contact and address only", () => {
    expect(sharedFieldsFor(false)).toEqual(["name", "contact", "address"]);
  });
  it("adds value/equity only when separately authorized", () => {
    expect(sharedFieldsFor(true)).toContain("value_equity");
  });
  it("passes only the chosen contact channel", () => {
    expect(contactPayload({ channel: "email", email: "a@b.co", phone: "555" })).toEqual({ email: "a@b.co", phone: null });
  });
});
