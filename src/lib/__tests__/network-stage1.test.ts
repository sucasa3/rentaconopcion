import { describe, it, expect } from "vitest";
import { buildHomeTeamCandidates, institutionSuppressionReason } from "../home-team";
import {
  canTransition,
  countRelationships,
  grantsNamedHomeownerAccess,
  supportsInvitation,
} from "../relationships";
import { resolveProfessional, type ProfessionalRecord } from "../professionals";
import { classifyLenderAccess } from "../lender-access";
import { normalizeOrgName, resolveOrganization, isAutoResolvable } from "../org-resolution";

const lien = (lender: string | null) => ({ lender, recordingDate: "2019-04-01", loanType: "FHA" });

describe("Home Team candidate quality", () => {
  it("accepts a real lending institution from an open lien", () => {
    const { candidates, suppressed } = buildHomeTeamCandidates({
      openLienCount: 1,
      liens: [lien("MOVEMENT MORTGAGE LLC")],
      history: [],
    });
    expect(suppressed).toHaveLength(0);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.role).toBe("lender_organization");
    expect(candidates[0]!.rawName).toBe("MOVEMENT MORTGAGE LLC");
    expect(candidates[0]!.status).toBe("detected");
    expect(candidates[0]!.confidence).toBeGreaterThan(0.5);
  });

  it("suppresses insurance/bond entities seen in real provider data", () => {
    expect(institutionSuppressionReason("US IMMIGRATION BONDS & INSURANCE SERVICE")).toBe(
      "not_a_lending_entity",
    );
  });

  it("suppresses empty, placeholder and malformed values", () => {
    expect(institutionSuppressionReason("")).toBe("empty");
    expect(institutionSuppressionReason("   ")).toBe("empty");
    expect(institutionSuppressionReason("N/A")).toBe("generic_placeholder");
    expect(institutionSuppressionReason("Unknown")).toBe("generic_placeholder");
    expect(institutionSuppressionReason("###")).toBe("no_letters");
    expect(institutionSuppressionReason("ab")).toBe("too_short");
  });

  it("prefers no candidate over an individual-looking name", () => {
    const { candidates, suppressed } = buildHomeTeamCandidates({
      openLienCount: 1,
      liens: [lien("John A Smith")],
      history: [],
    });
    expect(candidates).toHaveLength(0);
    expect(suppressed[0]!.reason).toBe("individual_name_not_institution");
  });

  it("de-duplicates the same institution across lien and history", () => {
    const { candidates, suppressed } = buildHomeTeamCandidates({
      openLienCount: 1,
      liens: [lien("Fairway Independent Mortgage Corp")],
      history: [lien("FAIRWAY INDEPENDENT MORTGAGE CORP.")],
    });
    expect(candidates).toHaveLength(1);
    expect(suppressed.map((s) => s.reason)).toContain("duplicate");
  });

  it("ranks history as weaker evidence than an open lien", () => {
    const open = buildHomeTeamCandidates({ openLienCount: 1, liens: [lien("Wells Fargo Bank NA")], history: [] });
    const past = buildHomeTeamCandidates({ openLienCount: 0, liens: [], history: [lien("Wells Fargo Bank NA")] });
    expect(open.candidates[0]!.confidence).toBeGreaterThan(past.candidates[0]!.confidence);
    expect(past.candidates[0]!.evidence.lienKind).toBe("mortgage_history");
  });

  it("never invents an individual loan officer from an institution", () => {
    const { candidates } = buildHomeTeamCandidates({
      openLienCount: 1,
      liens: [lien("Movement Mortgage LLC")],
      history: [],
    });
    expect(candidates.every((c) => c.role === "lender_organization")).toBe(true);
  });
});

describe("relationship evidence semantics", () => {
  it("lets an agent assertion progress from detected/suggested but not to confirmed", () => {
    expect(canTransition("detected", "suggested")).toBe(true);
    expect(canTransition("suggested", "asserted")).toBe(true);
    expect(canTransition("rejected", "confirmed")).toBe(false);
    expect(canTransition("revoked", "confirmed")).toBe(false);
  });

  it("supports invitation once asserted, but never grants homeowner access", () => {
    expect(supportsInvitation("asserted")).toBe(true);
    expect(supportsInvitation("suggested")).toBe(false);
    expect(grantsNamedHomeownerAccess()).toBe(false);
  });

  it("counts potential, asserted and confirmed separately", () => {
    const counts = countRelationships([
      { status: "detected", revoked_at: null },
      { status: "suggested", revoked_at: null },
      { status: "asserted", revoked_at: null },
      { status: "confirmed", revoked_at: null },
      { status: "rejected", revoked_at: null },
      { status: "confirmed", revoked_at: "2026-01-01T00:00:00Z" },
    ]);
    expect(counts).toEqual({ potential: 2, asserted: 1, confirmed: 1 });
  });
});

const pro = (over: Partial<ProfessionalRecord>): ProfessionalRecord => ({
  id: "p1",
  user_id: null,
  org_id: null,
  org_name_raw: "Movement Mortgage",
  full_name: "John Smith",
  email_normalized: null,
  email_verified: false,
  phone_normalized: null,
  phone_verified: false,
  nmls_id: null,
  license_number: null,
  license_state: null,
  claim_status: "unclaimed",
  verification_status: "unverified",
  ...over,
});

describe("conservative professional resolution", () => {
  it("links on NMLS id", () => {
    const r = resolveProfessional([pro({ nmls_id: "123456" })], {
      fullName: "J Smith",
      nmlsId: "123-456",
    });
    expect(r.strength).toBe("strong");
    expect(r.basis).toBe("nmls");
  });

  it("links on an individually verified email", () => {
    const r = resolveProfessional(
      [pro({ email_normalized: "john.smith@movement.com", email_verified: true })],
      { fullName: "John Smith", email: "John.Smith@Movement.com", emailVerified: true },
    );
    expect(r.strength).toBe("strong");
  });

  it("does NOT auto-merge on a shared office mailbox", () => {
    const r = resolveProfessional(
      [pro({ email_normalized: "info@movement.com", email_verified: true })],
      { fullName: "John Smith", email: "info@movement.com", emailVerified: true },
    );
    expect(r.strength).toBe("possible");
  });

  it("does NOT auto-merge on name + organization", () => {
    const r = resolveProfessional([pro({})], {
      fullName: "John Smith",
      orgNameRaw: "Movement Mortgage",
    });
    expect(r.strength).toBe("possible");
    expect(r.basis).toBe("name_and_org");
    expect(r.match).toBeNull();
  });

  it("does NOT auto-merge on an unverified phone match", () => {
    const r = resolveProfessional([pro({ phone_normalized: "3055551234" })], {
      fullName: "Jon Smyth",
      phone: "(305) 555-1234",
    });
    expect(r.strength).toBe("possible");
    expect(r.basis).toBe("unverified_contact");
  });

  it("returns none when nothing plausibly matches", () => {
    const r = resolveProfessional([pro({})], { fullName: "Maria Gomez", orgNameRaw: "Fairway" });
    expect(r.strength).toBe("none");
  });
});

describe("licence resolution needs a jurisdiction", () => {
  it("links on licence + matching state", () => {
    const r = resolveProfessional([pro({ license_number: "MLO4477", license_state: "FL" })], {
      fullName: "J Smith",
      licenseNumber: "mlo-4477",
      licenseState: "fl",
    });
    expect(r.strength).toBe("strong");
    expect(r.basis).toBe("license_and_state");
  });

  it("does NOT auto-merge a licence number with no state", () => {
    const r = resolveProfessional([pro({ license_number: "MLO4477", license_state: "FL" })], {
      fullName: "J Smith",
      licenseNumber: "MLO4477",
    });
    expect(r.strength).toBe("possible");
    expect(r.basis).toBe("license_without_state");
  });

  it("does NOT auto-merge the same licence number in a different state", () => {
    const r = resolveProfessional([pro({ license_number: "MLO4477", license_state: "GA" })], {
      fullName: "J Smith",
      licenseNumber: "MLO4477",
      licenseState: "FL",
    });
    expect(r.strength).toBe("possible");
  });
});

describe("organization resolution is exact or reviewed, never fuzzy", () => {
  const orgs = [{ id: "o1", name: "Movement Mortgage, LLC" }];

  it("auto-resolves an exact normalized legal-name match", () => {
    const r = resolveOrganization("MOVEMENT MORTGAGE LLC", orgs);
    expect(r.outcome).toBe("exact");
    expect(r.orgId).toBe("o1");
    expect(isAutoResolvable(r.outcome)).toBe(true);
  });

  it("auto-resolves an explicitly trusted alias", () => {
    const r = resolveOrganization("Movement Mtg", orgs, [
      { org_id: "o1", alias_normalized: normalizeOrgName("Movement Mtg"), trusted: true },
    ]);
    expect(r.outcome).toBe("trusted_alias");
    expect(r.orgId).toBe("o1");
  });

  it("never auto-resolves an untrusted alias or a near miss", () => {
    const untrusted = resolveOrganization("Movement Mtg", orgs, [
      { org_id: "o1", alias_normalized: normalizeOrgName("Movement Mtg"), trusted: false },
    ]);
    expect(untrusted.outcome).toBe("ambiguous");
    expect(untrusted.orgId).toBeNull();

    const near = resolveOrganization("Movement Mortgage of Florida", orgs);
    expect(near.outcome).toBe("ambiguous");
    expect(near.orgId).toBeNull();

    expect(resolveOrganization("Fairway Independent", orgs).outcome).toBe("none");
  });
});

describe("SECURITY: a mistaken agent assertion never exposes a homeowner", () => {
  it("asserted status alone confers no named homeowner access", () => {
    // Jennifer picks the wrong John Smith as Kevin's loan officer, and John
    // then claims his invitation. The relationship is asserted at most.
    const row = { status: "asserted" as const, revoked_at: null };
    expect(supportsInvitation(row.status)).toBe(true);
    // No path from an asserted relationship to named homeowner access:
    expect(grantsNamedHomeownerAccess()).toBe(false);
    // And an agent assertion cannot masquerade as homeowner confirmation.
    expect(countRelationships([row]).confirmed).toBe(0);
  });

  it("the canonical access classifier grants no named access from an assertion", () => {
    // Jennifer asserted the Home Team relationship. There is no homeowner
    // connection request, no consent, and no documented lender relationship.
    const access = classifyLenderAccess({
      relationshipBasis: null,
      hasConnectionRequest: false,
      hasIntelligenceConsent: false,
      isSponsored: false,
      isAgentConnected: false,
    });
    expect(access.named).toBe(false);
    expect(access.scopes).toEqual([]);
  });

  it("an asserted relationship is never translated into an own-relationship basis", () => {
    // "asserted" is not in the accepted own-relationship basis vocabulary.
    const access = classifyLenderAccess({ relationshipBasis: "asserted" });
    expect(access.named).toBe(false);
    const viaType = classifyLenderAccess({ relationshipBasis: "professional_homeowner_lender" });
    expect(viaType.named).toBe(false);
  });
});
