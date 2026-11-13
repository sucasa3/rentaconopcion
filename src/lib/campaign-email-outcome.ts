/**
 * Classifies one campaign email attempt. Only the provider's explicit
 * `recipient_suppressed` answer is a permanent email suppression; our own
 * preference block is non-retryable too but is not a provider event; anything
 * thrown (rate limits, network, 5xx) stays a retryable temporary failure.
 */
export type EmailOutcome = {
  status: "sent" | "suppressed" | "blocked" | "queued";
  retryable: boolean;
  error: string | null;
};

export const PROVIDER_SUPPRESSED = "provider: recipient_suppressed";

export function classifyEmailOutcome(
  res: { sent: true } | { sent: false; reason: string } | unknown,
): EmailOutcome {
  if (res && typeof res === "object" && "sent" in res) {
    const r = res as { sent: boolean; reason?: string };
    if (r.sent) return { status: "sent", retryable: false, error: null };
    if (r.reason === "recipient_suppressed")
      return { status: "suppressed", retryable: false, error: PROVIDER_SUPPRESSED };
    return { status: "blocked", retryable: false, error: "contact preference" };
  }
  const code = (res as any)?.code;
  if (code === "recipient_suppressed")
    return { status: "suppressed", retryable: false, error: PROVIDER_SUPPRESSED };
  const msg = res instanceof Error ? res.message : String(res);
  return { status: "queued", retryable: true, error: `temporary: ${msg}`.slice(0, 500) };
}
