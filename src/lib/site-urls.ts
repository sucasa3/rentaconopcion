/**
 * Single source of truth for the public web addresses this app links to.
 *
 * Domain migration (see docs/cutover-runbook.md):
 *   sucasa.com          -> this platform          (still served by Lofty)
 *   www.sucasa.com      -> redirect to sucasa.com (still served by Lofty)
 *   homes.sucasa.com    -> existing Lofty IDX     (LIVE since 2026-09-15)
 *
 * Step 1 is done: IDX_BASE_URL now points at homes.sucasa.com.
 *
 * Step 2 stays pending on purpose. PLATFORM_BASE_URL must NOT point at
 * sucasa.com until sucasa.com actually resolves to this app — until then, any
 * link generated with it (invitations, tracking) would land on the old Lofty
 * site. Flip it, or set PUBLIC_SITE_URL, only once the domain is verified and
 * serving this platform.
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
