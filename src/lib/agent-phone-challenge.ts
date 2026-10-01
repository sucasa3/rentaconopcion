/**
 * Pure rules for agent phone-verification challenges. SuCasa generates and
 * checks the code; the SMS provider only delivers it, so a send success or
 * delivery receipt never verifies a phone.
 */
export const AGENT_CODE_TTL_MS = 10 * 60 * 1000;
export const AGENT_MAX_ATTEMPTS = 5;
export const AGENT_RESEND_COOLDOWN_MS = 60 * 1000;
export const AGENT_MAX_SENDS_PER_HOUR = 3;

export type ChallengeRow = {
  id: string;
  user_id: string;
  phone_hash: string;
  attempts: number;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

export type IssueDecision = { ok: true } | { ok: false; reason: "cooldown" | "hourly_limit"; retryAfterMs: number };

/** Rate limit sends per account and per phone (recent = rows from the last hour for either). */
export function canIssue(recent: Pick<ChallengeRow, "created_at">[], now: number): IssueDecision {
  const times = recent.map((r) => Date.parse(r.created_at)).filter((t) => now - t < 3600_000).sort((a, b) => b - a);
  if (times.length && now - times[0] < AGENT_RESEND_COOLDOWN_MS) {
    return { ok: false, reason: "cooldown", retryAfterMs: AGENT_RESEND_COOLDOWN_MS - (now - times[0]) };
  }
  if (times.length >= AGENT_MAX_SENDS_PER_HOUR) {
    return { ok: false, reason: "hourly_limit", retryAfterMs: 3600_000 - (now - times[times.length - 1]) };
  }
  return { ok: true };
}

export type CheckDecision =
  | { ok: true }
  | { ok: false; reason: "no_challenge" | "expired" | "used" | "too_many_attempts" | "wrong_account" | "wrong_phone" | "mismatch" };

/**
 * Evaluate a code against the latest challenge. The challenge is bound to the
 * account and the normalized phone; `matches` is the constant-time hash check.
 */
export function evaluateCheck(
  c: ChallengeRow | null,
  args: { userId: string; phoneHash: string; matches: boolean; now: number },
): CheckDecision {
  if (!c) return { ok: false, reason: "no_challenge" };
  if (c.user_id !== args.userId) return { ok: false, reason: "wrong_account" };
  if (c.phone_hash !== args.phoneHash) return { ok: false, reason: "wrong_phone" };
  if (c.consumed_at) return { ok: false, reason: "used" };
  if (Date.parse(c.expires_at) <= args.now) return { ok: false, reason: "expired" };
  if (c.attempts >= AGENT_MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };
  if (!args.matches) return { ok: false, reason: "mismatch" };
  return { ok: true };
}

export const CHECK_MESSAGES: Record<Exclude<CheckDecision, { ok: true }>["reason"], string> = {
  no_challenge: "Request a code first.",
  expired: "That code has expired. Request a new one.",
  used: "That code was already used. Request a new one.",
  too_many_attempts: "Too many attempts. Request a new code.",
  wrong_account: "Request a code first.",
  wrong_phone: "This code was sent to a different number. Request a new code.",
  mismatch: "That code didn't match. Try again or request a new code.",
};
