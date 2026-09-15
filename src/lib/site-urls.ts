/**
 * Single source of truth for the public web addresses this app links to.
 *
 * Domain migration (approved 2026-09-14):
 *   sucasa.com          -> this platform          (not connected yet)
 *   www.sucasa.com      -> redirect to sucasa.com (not configured yet)
 *   homes.sucasa.com    -> existing Lofty IDX     (does not resolve yet)
 *
 * Nothing here points at sucasa.com or homes.sucasa.com yet, on purpose: those
 * hosts do not yet resolve to the right place, so switching early would create
 * dead links, including in emails already sitting in people's inboxes.
 *
 * Cutover is two edits, in this order:
 *   1. homes.sucasa.com live and tested  -> set IDX_BASE_URL to "https://homes.sucasa.com"
 *   2. sucasa.com connected as primary   -> set PLATFORM_BASE_URL to "https://sucasa.com"
 *
 * Links already delivered stay valid either way: the current Lovable address
 * keeps resolving and, once sucasa.com is primary, redirects to it preserving
 * path and query string — which is where the invitation token lives.
 */

/** Base for links this app generates (emails, invitations, tracking). */
export const PLATFORM_BASE_URL = "https://rentaconopcion.lovable.app";

/** Where the platform will live after cutover. Not in use yet. */
export const PLANNED_PLATFORM_BASE_URL = "https://sucasa.com";

/** Base for the Lofty-powered IDX search / listing experience. Live since 2026-09-15. */
export const IDX_BASE_URL = "https://homes.sucasa.com";

/** Where IDX will live after cutover. Not in use yet. */
export const PLANNED_IDX_BASE_URL = "https://homes.sucasa.com";

/** Server-side base: env override wins, so cutover needs no code change. */
export function siteUrl(): string {
  return (
    process.env["PUBLIC_SITE_URL"] ??
    process.env["SITE_URL"] ??
    PLATFORM_BASE_URL
  );
}
