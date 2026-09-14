import { describe, expect, it } from "vitest";
import {
  CLAIM_DOES_NOT_VERIFY,
  CONNECTION_SCOPE_CHOICES,
  claimVerificationPatch,
  connectionConsent,
  decideClaim,
  invitationDisplayState,
  isActiveInvitation,
  isExpired,
  mayResend,
  validationEffect,
} from "../professional-invitations";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 0, 10);
const future = new Date(now + 5 * DAY).toISOString();
const past = new Date(now - DAY).toISOString();

const invitation = (over: Record<string, unknown> = {}) =>
  ({
    status: "sent",
    expires_at: future,
    invited_email_normalized: "lo@bank.com",
    invited_professional_id: "pro-1",
    ...over,
  }) as any;

const ctx = (over: Record<string, unknown> = {}) =>
  ({
    invitation: invitation(),
    authUserId: "user-1",
    authEmail: "lo@bank.com",
    authEmailVerified: true,
    professionalUserId: null,
    usersOtherProfessionalId: null,
    ...over,
  }) as any;

describe("A. invitation lifecycle state", () => {
  it("treats a claimed identity as on SuCasa whoever invited them", () => {
    expect(invitationDisplayState(null, { claim_status: "claimed" }, now)).toBe("on_sucasa");
  });

  it("separates not invited, sent, expired, declined and revoked", () => {
    expect(invitationDisplayState(null, {}, now)).toBe("not_invited");
    expect(invitationDisplayState(invitation(), {}, now)).toBe("invitation_sent");
    expect(invitationDisplayState(invitation({ expires_at: past }), {}, now)).toBe("expired");
    expect(invitationDisplayState(invitation({ status: "declined" }), {}, now)).toBe("declined");
    expect(invitationDisplayState(invitation({ status: "revoked" }), {}, now)).toBe("revoked");
  });

  it("expires after the deadline and only resends live or expired invitations", () => {
    expect(isExpired(invitation({ expires_at: past }), now)).toBe(true);
    expect(isActiveInvitation(invitation(), now)).toBe(true);
    expect(mayResend("invitation_sent")).toBe(true);
    expect(mayResend("expired")).toBe(true);
    expect(mayResend("on_sucasa")).toBe(false);
    expect(mayResend("not_invited")).toBe(false);
  });
});

describe("B. claiming requires the invited, verified email", () => {
  it("claims when the signed-in verified email matches", () => {
    expect(decideClaim(ctx(), now)).toEqual({ outcome: "claim", professionalId: "pro-1" });
  });

  it("rejects a different signed-in account", () => {
    expect(decideClaim(ctx({ authEmail: "someone@else.com" }), now).outcome).toBe("wrong_account");
  });

  it("rejects an anonymous visitor", () => {
    expect(decideClaim(ctx({ authUserId: null }), now).outcome).toBe("wrong_account");
  });

  it("rejects an unverified email", () => {
    expect(decideClaim(ctx({ authEmailVerified: false }), now).outcome).toBe("email_not_verified");
  });

  it("refuses expired, revoked and declined invitations", () => {
    for (const over of [
      { expires_at: past },
      { status: "revoked" },
      { status: "declined" },
    ]) {
      expect(decideClaim(ctx({ invitation: invitation(over) }), now).outcome).toBe(
        "invitation_unavailable",
      );
    }
  });

  it("is idempotent for the person who already claimed", () => {
    expect(
      decideClaim(
        ctx({ invitation: invitation({ status: "accepted" }), professionalUserId: "user-1" }),
        now,
      ),
    ).toEqual({ outcome: "already_claimed_by_you", professionalId: "pro-1" });
  });
});

describe("C. conflicts reconcile, never silently merge", () => {
  it("flags a professional record already linked to someone else", () => {
    expect(decideClaim(ctx({ professionalUserId: "user-2" }), now)).toEqual({
      outcome: "reconciliation_required",
      why: "professional_linked_elsewhere",
    });
  });

  it("flags a user already linked to another professional record", () => {
    expect(decideClaim(ctx({ usersOtherProfessionalId: "pro-9" }), now)).toEqual({
      outcome: "reconciliation_required",
      why: "user_linked_elsewhere",
    });
  });
});

describe("D. claiming verifies the email only", () => {
  it("never marks phone, NMLS, license or organization verified", () => {
    const patch = claimVerificationPatch("user-1");
    for (const field of CLAIM_DOES_NOT_VERIFY) {
      expect(Object.keys(patch)).not.toContain(field);
    }
    expect(patch.user_id).toBe("user-1");
    expect(patch.claim_status).toBe("claimed");
  });
});

describe("E. homeowner validation answers relationship truth only", () => {
  it("confirms without granting any access", () => {
    const e = validationEffect("yes");
    expect(e.relationship).toBe("confirm");
    expect(e.recorded).toBe("confirmed");
    expect(e.offerConnection).toBe(true);
    expect(e).not.toHaveProperty("grantsAccess");
  });

  it("rejects a wrong professional and keeps provenance", () => {
    const e = validationEffect("no");
    expect(e.relationship).toBe("reject");
    expect(e.recorded).toBe("rejected");
    expect(e.offerConnection).toBe(false);
  });

  it("leaves the relationship unchanged when the homeowner is unsure", () => {
    const e = validationEffect("not_sure");
    expect(e.relationship).toBe("unchanged");
    expect(e.recorded).toBe("unknown");
    expect(e.offerConnection).toBe(false);
  });
});

describe("F. connection consent is a separate, explicit choice", () => {
  it("writes nothing when the homeowner declines to connect", () => {
    expect(connectionConsent({ connect: false, scopes: ["contact", "valuation"] })).toEqual({
      write: false,
    });
  });

  it("writes nothing when connecting with no scopes ticked", () => {
    expect(connectionConsent({ connect: true, scopes: [] })).toEqual({ write: false });
  });

  it("records only the scopes actually selected", () => {
    const res = connectionConsent({ connect: true, scopes: ["contact", "mortgage"] });
    expect(res.write).toBe(true);
    expect(res.scopes).toEqual(["contact", "mortgage"]);
    expect(res.scopeType).toBe("connection_request");
  });

  it("ignores anything outside the offered scope list", () => {
    const res = connectionConsent({ connect: true, scopes: ["contact", "everything"] as any });
    expect(res.scopes).toEqual(["contact"]);
    expect(CONNECTION_SCOPE_CHOICES.map((c) => c.key)).not.toContain("everything");
  });
});
