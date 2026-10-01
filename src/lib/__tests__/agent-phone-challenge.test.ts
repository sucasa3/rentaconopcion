import { describe, it, expect } from "vitest";
import { canIssue, evaluateCheck, AGENT_MAX_ATTEMPTS } from "../agent-phone-challenge";

const now = Date.parse("2026-10-01T12:00:00Z");
const iso = (ms: number) => new Date(now - ms).toISOString();
const base = { id: "c1", user_id: "u1", phone_hash: "p1", attempts: 0, expires_at: new Date(now + 60_000).toISOString(), consumed_at: null, created_at: iso(0) };
const ok = { userId: "u1", phoneHash: "p1", matches: true, now };

describe("agent phone challenge", () => {
  it("allows the first send", () => expect(canIssue([], now).ok).toBe(true));
  it("enforces a resend cooldown", () => expect(canIssue([{ created_at: iso(10_000) }], now)).toMatchObject({ ok: false, reason: "cooldown" }));
  it("caps sends per hour", () =>
    expect(canIssue([{ created_at: iso(120_000) }, { created_at: iso(600_000) }, { created_at: iso(1_200_000) }], now)).toMatchObject({ ok: false, reason: "hourly_limit" }));
  it("ignores sends older than an hour", () => expect(canIssue([{ created_at: iso(3_700_000) }], now).ok).toBe(true));
  it("accepts a matching, fresh, unused code", () => expect(evaluateCheck(base, ok).ok).toBe(true));
  it("is single-use", () => expect(evaluateCheck({ ...base, consumed_at: iso(1) }, ok)).toMatchObject({ reason: "used" }));
  it("expires", () => expect(evaluateCheck({ ...base, expires_at: iso(1) }, ok)).toMatchObject({ reason: "expired" }));
  it("limits attempts even with a correct code", () =>
    expect(evaluateCheck({ ...base, attempts: AGENT_MAX_ATTEMPTS }, ok)).toMatchObject({ reason: "too_many_attempts" }));
  it("is bound to the account", () => expect(evaluateCheck(base, { ...ok, userId: "u2" })).toMatchObject({ reason: "wrong_account" }));
  it("is bound to the phone", () => expect(evaluateCheck(base, { ...ok, phoneHash: "p2" })).toMatchObject({ reason: "wrong_phone" }));
  it("rejects a wrong code", () => expect(evaluateCheck(base, { ...ok, matches: false })).toMatchObject({ reason: "mismatch" }));
  it("rejects with no challenge", () => expect(evaluateCheck(null, ok)).toMatchObject({ reason: "no_challenge" }));
});
