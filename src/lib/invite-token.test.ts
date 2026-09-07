import { describe, expect, it } from "vitest";
import { emailMatchesInvite, signInviteToken, verifyInviteToken } from "./invite-token.server";

const CONN = "8a2d6a3e-5f2b-4a55-9a1a-2c1b0d8e9f10";

describe("invitation tokens", () => {
  it("round-trips a signed token", () => {
    const t = signInviteToken(CONN, "Agent@Example.com");
    const r = verifyInviteToken(t);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.connectionId).toBe(CONN);
      expect(r.email).toBe("agent@example.com");
    }
  });

  it("rejects a tampered payload", () => {
    const t = signInviteToken(CONN, "agent@example.com");
    const [, sig] = t.split(".");
    const forged = `${Buffer.from(
      JSON.stringify({ c: CONN, e: "attacker@example.com", x: Date.now() + 1000 }),
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")}.${sig}`;
    expect(verifyInviteToken(forged)).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects a raw connection id", () => {
    expect(verifyInviteToken(CONN).ok).toBe(false);
  });

  it("expires", () => {
    const t = signInviteToken(CONN, "agent@example.com", Date.now() - 40 * 24 * 3600 * 1000);
    expect(verifyInviteToken(t)).toEqual({ ok: false, reason: "expired" });
  });

  it("matches emails case-insensitively and rejects mismatches", () => {
    expect(emailMatchesInvite("Agent@Example.com ", "agent@example.com")).toBe(true);
    expect(emailMatchesInvite("other@example.com", "agent@example.com")).toBe(false);
    expect(emailMatchesInvite(null, "agent@example.com")).toBe(false);
  });
});
