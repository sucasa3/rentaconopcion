/**
 * Account deletion core: pure logic with no database or network access, so it
 * can be tested directly.
 *
 * Two rules shape everything here:
 *  1. Nothing destructive happens on an old session. Typed confirmation is not
 *     enough on its own — the person must have authenticated recently.
 *  2. Future activity stops BEFORE personal data is removed, and the person is
 *     entered in the suppression register before the account disappears, so a
 *     failure part-way through can never leave them deleted-but-contactable.
 */

/** How recent an authentication must be to accept a deletion request. */
export const RECENT_AUTH_MAX_AGE_SECONDS = 10 * 60;

/** The exact word the person types to confirm. */
export const DELETION_CONFIRM_WORD = "DELETE";

/**
 * When the current session last actually authenticated. Supabase records each
 * authentication in `amr` with its own timestamp; `iat` only tells us when the
 * access token was last refreshed, so it is a fallback, not the primary signal.
 */
export function authenticatedAtSeconds(claims: unknown): number | null {
  const c = (claims ?? {}) as {
    amr?: Array<{ method?: string; timestamp?: number }>;
    iat?: number;
  };
  const stamps = (c.amr ?? [])
    .map((entry) => entry?.timestamp)
    .filter((t): t is number => typeof t === "number" && Number.isFinite(t));
  if (stamps.length > 0) return Math.max(...stamps);
  return typeof c.iat === "number" && Number.isFinite(c.iat) ? c.iat : null;
}

/** True only when this session authenticated within the allowed window. */
export function isRecentlyAuthenticated(
  claims: unknown,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  const at = authenticatedAtSeconds(claims);
  if (at == null) return false;
  const age = nowSeconds - at;
  // A timestamp far in the future is not evidence of a recent sign-in.
  if (age < -60) return false;
  return age <= RECENT_AUTH_MAX_AGE_SECONDS;
}

// --- Suppression matching ---------------------------------------------------

export type SuppressionRow = {
  email_hmac?: string | null;
  phone_hmac?: string | null;
  address_hmac?: string | null;
};

export type SuppressionCandidate = {
  emailHmac?: string | null;
  phoneHmac?: string | null;
  addressHmac?: string | null;
};

/**
 * Email and phone are the primary identity keys. An address match alone NEVER
 * suppresses: a future unrelated occupant of the same property must not inherit
 * someone else's deletion. Address only counts as a secondary factor, and only
 * when the register row also carries an identifier we can line up.
 */
export function suppressionMatches(
  rows: ReadonlyArray<SuppressionRow>,
  candidate: SuppressionCandidate,
): boolean {
  const email = candidate.emailHmac || null;
  const phone = candidate.phoneHmac || null;
  if (!email && !phone) return false;

  return rows.some((row) => {
    if (email && row.email_hmac && row.email_hmac === email) return true;
    if (phone && row.phone_hmac && row.phone_hmac === phone) return true;
    return false;
  });
}

// --- Ordered deletion steps -------------------------------------------------

/**
 * Deliberate order. Everything that could contact, re-match or re-create the
 * person runs before any personal data is removed, and the irreversible auth
 * deletion runs last.
 */
export const DELETION_STEPS = [
  "stop_outreach",
  "cancel_scheduled_work",
  "handle_subscription",
  "record_suppression",
  "document_open_transactions",
  "unlink_business_records",
  "delete_storage_files",
  "revoke_sessions_and_delete_account",
] as const;

export type DeletionStep = (typeof DELETION_STEPS)[number];

export type DeletionStepResult = {
  step: DeletionStep;
  ok: boolean;
  detail?: string;
  error?: string;
};

export type DeletionOutcome = {
  status: "completed" | "partial";
  steps: DeletionStepResult[];
  failures: DeletionStepResult[];
  needsAdminAttention: boolean;
};

/** One handler per step. Each must be safe to run twice. */
export type DeletionIo = Record<DeletionStep, () => Promise<string | void>>;

/**
 * Run the steps in order. A failed step is recorded and the run continues, so a
 * single external failure (Stripe, storage) can never leave the person stopped
 * half-way with outreach still live. The final account removal is only
 * attempted when suppression has been recorded, because a deleted account that
 * is not suppressed could be re-imported and contacted again.
 */
export async function runAccountDeletion(
  io: DeletionIo,
  opts: { alreadyDone?: ReadonlyArray<string> } = {},
): Promise<DeletionOutcome> {
  const done = new Set(opts.alreadyDone ?? []);
  const steps: DeletionStepResult[] = [];

  for (const step of DELETION_STEPS) {
    if (done.has(step)) {
      steps.push({ step, ok: true, detail: "already completed" });
      continue;
    }

    if (step === "revoke_sessions_and_delete_account") {
      const suppression = steps.find((s) => s.step === "record_suppression");
      if (!suppression?.ok) {
        steps.push({
          step,
          ok: false,
          error:
            "Suppression was not recorded, so the account was not removed. Nothing was left contactable.",
        });
        continue;
      }
    }

    try {
      const detail = await io[step]();
      steps.push({ step, ok: true, detail: detail ?? undefined });
    } catch (e) {
      steps.push({ step, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const failures = steps.filter((s) => !s.ok);
  return {
    status: failures.length === 0 ? "completed" : "partial",
    steps,
    failures,
    needsAdminAttention: failures.length > 0,
  };
}
