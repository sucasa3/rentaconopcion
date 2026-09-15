/**
 * Single source of truth for the public web addresses this app links to.
 *
 * Domain migration complete (see docs/cutover-runbook.md):
 *   sucasa.com          -> this platform (primary), DNS verified 2026-09-15
 *   www.sucasa.com      -> redirects to sucasa.com
 *   homes.sucasa.com    -> existing Lofty IDX, live 2026-09-15
 *
 * Links already delivered stay valid: the Lovable address keeps resolving and
 * redirects to sucasa.com preserving path and query string — which is where the
 * invitation token lives. PUBLIC_SITE_URL still overrides at runtime, so a
 * rollback needs no code change.
 */

/** Base for links this app generates (emails, invitations, tracking). */
export const PLATFORM_BASE_URL = "https://sucasa.com";

/** Previous platform address; kept resolving and redirecting to PLATFORM_BASE_URL. */
export const LEGACY_PLATFORM_BASE_URL = "https://rentaconopcion.lovable.app";

/** Base for the Lofty-powered IDX search / listing experience. */
export const IDX_BASE_URL = "https://homes.sucasa.com";

/** Server-side base: env override wins, so cutover needs no code change. */
export function siteUrl(): string {
  return (
    process.env["PUBLIC_SITE_URL"] ??
    process.env["SITE_URL"] ??
    PLATFORM_BASE_URL
  );
}
