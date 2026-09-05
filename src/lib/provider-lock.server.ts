/**
 * Provider lock — server-only.
 *
 * While an isolated BatchData evaluation run is executing, no ATTOM call may
 * fire from the same invocation. `attomFetch` asserts this lock, so an
 * accidental import or shared helper can never spend an ATTOM credit during a
 * controlled test.
 */

let attomLockedReason: string | null = null;

export function lockAttom(reason: string): void {
  attomLockedReason = reason;
}

export function unlockAttom(): void {
  attomLockedReason = null;
}

export function isAttomLocked(): string | null {
  return attomLockedReason;
}

export function assertAttomAllowed(): void {
  if (attomLockedReason) {
    throw new Error(`ATTOM call blocked: ${attomLockedReason}`);
  }
}
