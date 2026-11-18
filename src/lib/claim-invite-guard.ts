import { assertPersonalBook } from "./personal-book";

/**
 * Only the professional assigned to the client's book may create or replace a
 * homeowner invitation. Runs before any token is minted or earlier link revoked.
 */
export async function assertClaimInviteOwner(db: any, userId: string, portfolioId: string | null | undefined) {
  if (!portfolioId) throw new Error("Client not found.");
  try {
    await assertPersonalBook(db, userId, portfolioId);
  } catch {
    throw new Error("Only the professional assigned to this client's book can send an invitation.");
  }
}
