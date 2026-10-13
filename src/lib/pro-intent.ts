/**
 * Explicit professional-onboarding intent.
 *
 * A professional workspace is provisioned only after the visitor takes an
 * onboarding action on /lender-start or /agent-start (submitting the form,
 * choosing Google, or opening an email link that carries `intent=1`). The
 * marker survives the Google OAuth round-trip and page refreshes in the same
 * tab, and expires after an hour so a stale tab never provisions silently.
 */
export type ProRole = "lender" | "agent";
const KEY = "sucasa.pro_intent";
const TTL_MS = 60 * 60 * 1000;

export function markProIntent(role: ProRole) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ role, at: Date.now() }));
  } catch {
    /* storage unavailable — the explicit button still works */
  }
}

export function hasProIntent(role: ProRole): boolean {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return false;
    const v = JSON.parse(raw);
    return v?.role === role && Date.now() - Number(v.at) < TTL_MS;
  } catch {
    return false;
  }
}

export function clearProIntent() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
