/**
 * Single source of truth for the public web addresses this app links to.
 *
 * Domain migration (approved 2026-09-14):
 *   sucasa.com          -> this platform          (not connected yet)
 *   www.sucasa.com      -> redirect to sucasa.com (not configured yet)
 *   homes.sucasa.com    -> existing Lofty IDX     (not created yet)
 *
 * Nothing here points at sucasa.com or homes.sucasa.com yet, on purpose: those
 * hosts do not resolve to the right place at the time of writing, so switching
 * early would produce dead links in emails already in people's inboxes.
 *
 * Cutover is two edits, in this order:
 *   1. homes.sucasa.com live and tested  -> set IDX_BASE_URL to it
 *   2. sucasa.com connected as primary   -> set CANONICAL_SITE_URL to it
 *
 * Links already delivered stay valid either way: the Lovable address keeps
 * resolving and, once sucasa.com is primary, redirects to it preserving the
 * path and query string (which is where the invitation token lives).
 */

/** Fallback used until sucasa.com is connected to this project. */
export const LEGACY_SITE_URL = "https://sucasa.com";

/** Base for links this app generates (emails, invitations, tracking). */
export const CANONICAL_SITE_URL = "https://sucasa.com";

/** Base for the Lofty-powered IDX search / listing experience. */
export const IDX_BASE_URL = "https://sucasa.com/homes";

/** Server-side base: env override wins, so cutover needs no redeploy. */
export function siteUrl(): string {
  return (
    process.env["PUBLIC_SITE_URL"] ??
    process.env["SITE_URL"] ??
    CANONICAL_SITE_URL
  );
}
