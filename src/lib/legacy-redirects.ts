/**
 * Server-side permanent redirects for the sucasa.com cutover.
 *
 * Source of truth: docs/domain-migration-matrix.md (section H).
 *
 * These rules run in src/server.ts, i.e. inside the edge worker on every
 * request, BEFORE the React router. They emit real HTTP 301 responses with a
 * Location header — never client-side JavaScript navigation — so search
 * engines transfer link equity.
 *
 * Safety: the rules only apply to requests whose Host is sucasa.com or
 * www.sucasa.com. The current Lovable preview/production hosts are untouched,
 * so this code is inert until DNS is pointed here. No DNS change is required
 * to deploy it, and no DNS change is undone by removing it.
 */

export const REDIRECT_PLATFORM_ORIGIN = "https://sucasa.com";
export const REDIRECT_IDX_ORIGIN = "https://homes.sucasa.com";

/** Hosts this app will answer for after cutover. */
const APEX_HOST = "sucasa.com";
const WWW_HOST = "www.sucasa.com";

/** US state codes plus DC — rule 7 must never swallow a future 2-letter route. */
const STATE_CODES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
]);

/** Wildcard IDX families: /prefix and /prefix/anything -> identical path on IDX host. */
const IDX_PREFIX_FAMILIES = [
  "/neighborhood",
  "/neighborhoods",
  "/listing-detail",
  "/listing",
  "/available-homes",
];

/**
 * Deep /agents/* belongs to Lofty; bare /agents is the new SuCasa page.
 * Handled explicitly rather than via IDX_PREFIX_FAMILIES.
 */
const AGENTS_PREFIX = "/agents/";

/** Named market / browse pages that stay on the IDX host (matrix section B). */
const IDX_EXACT_PATHS = new Set([
  "/metro-atlanta",
  "/atlantaga",
  "/lawrenceville",
  "/lawrencevillega",
  "/gwinnett-county",
  "/arizona",
  "/phoenix",
  "/mia",
  "/orlan",
  "/northcaroline",
  "/casas-en-las-vegas",
  "/boca-raton-rentals",
  "/calm-valley",
  "/atlantaflips",
  // Single-property pages (matrix section C) — kept on the IDX host.
  "/2749-eastfield-rd-se",
  "/411-hunters-ln",
  "/1290-shallowford-rd",
  "/1359-summit-ln-nw",
  "/2880-sherwood-rd-se1",
]);

/** Superseded funnels -> closest live platform page (matrix section D). */
const PLATFORM_FUNNEL_REDIRECTS: Record<string, string> = {
  "/precalificacion": "/preaprobacion",
  "/landing-de-precalificacion": "/preaprobacion",
  "/calificacion": "/preaprobacion",
  "/cita": "/onboarding",
  "/fb-live": "/onboarding",
};

export type LegacyRedirect = { location: string; status: 301 };

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.replace(/\/+$/, "");
  return pathname;
}

function matchesPrefixFamily(path: string): boolean {
  return IDX_PREFIX_FAMILIES.some((p) => path === p || path.startsWith(`${p}/`));
}

function isStateGeoPath(path: string): boolean {
  const segments = path.split("/").filter(Boolean);
  if (segments.length < 2) return false;
  return STATE_CODES.has(segments[0]!.toUpperCase());
}

/**
 * Returns the redirect to issue for an incoming request URL, or null when the
 * app should render the request itself.
 */
export function resolveLegacyRedirect(rawUrl: string): LegacyRedirect | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const host = url.host.toLowerCase().replace(/:\d+$/, "");
  if (host !== APEX_HOST && host !== WWW_HOST) return null;

  const path = normalizePath(url.pathname);
  const query = url.search; // includes "?" when present, "" otherwise

  // www -> apex, single hop, path and query preserved. The apex request then
  // gets the path rules below, so www never needs its own rule table.
  if (host === WWW_HOST) {
    return { location: `${REDIRECT_PLATFORM_ORIGIN}${path}${query}`, status: 301 };
  }

  // Never redirect infrastructure paths.
  if (
    path.startsWith("/api/") ||
    path.startsWith("/_") ||
    path === "/robots.txt" ||
    path === "/sitemap.xml" ||
    path === "/favicon.png"
  ) {
    return null;
  }

  // Bare /agents and its explicit presentation are platform pages. This must
  // run before the deep-agent IDX family below.
  if (path === "/agents" || path === "/agents/deck") return null;
  if (path === "/lenders" || path === "/lenders/deck") return null;

  if (
    path.startsWith(AGENTS_PREFIX) ||
    matchesPrefixFamily(path) ||
    IDX_EXACT_PATHS.has(path) ||
    isStateGeoPath(path)
  ) {
    return { location: `${REDIRECT_IDX_ORIGIN}${path}${query}`, status: 301 };
  }

  const funnel = PLATFORM_FUNNEL_REDIRECTS[path];
  if (funnel) {
    return { location: `${REDIRECT_PLATFORM_ORIGIN}${funnel}${query}`, status: 301 };
  }

  // Everything else (including the platform's own pages, /blog, and the retire
  // candidates) is served by this app. Unknown paths get a real 404 — never a
  // blind redirect to the homepage.
  return null;
}

export function legacyRedirectResponse(redirect: LegacyRedirect): Response {
  return new Response(null, {
    status: redirect.status,
    headers: {
      Location: redirect.location,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
