/**
 * Origin for shareable invitation links. Behind hosted preview the server sees
 * an internal localhost URL, so the browser's origin is used — but only when it
 * is one of THIS project's preview hosts. Anything else gets the canonical site.
 */
const PROJECT_ID = "94429f0c-1687-4b34-81a7-6195279589c3";
const SLUG = "rentaconopcion";
const SUFFIX = String.raw`(?:\.lovable\.app|\.gpt-eng\.com|\.gptengineer\.run)`;
const PREVIEW_HOSTS = [
  new RegExp(String.raw`^(?:id-preview|preview)(?:-[a-z0-9]+)?--(?:${PROJECT_ID}|${SLUG})(?:\.[a-z0-9-]+)?${SUFFIX}$`),
  new RegExp(String.raw`^project--${PROJECT_ID}-dev${SUFFIX}$`),
  new RegExp(String.raw`^live--${PROJECT_ID}(?:-thr_[a-z0-9]+)?\.[a-z0-9-]+${SUFFIX}$`),
  new RegExp(String.raw`^${PROJECT_ID}\.lovableproject(?:-dev)?\.com$`),
];

export function isProjectPreviewOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return u.protocol === "https:" && !u.port && u.origin === origin && PREVIEW_HOSTS.some((r) => r.test(u.hostname.toLowerCase()));
  } catch {
    return false;
  }
}

export function resolveInviteOrigin(requestUrl: string, clientOrigin: string | null | undefined, canonical: string): string {
  if (clientOrigin && isProjectPreviewOrigin(clientOrigin)) return clientOrigin;
  const req = new URL(requestUrl);
  // Local sandbox only: request and page are both on localhost.
  if (clientOrigin && /^(localhost|127\.0\.0\.1)$/.test(req.hostname)) {
    try { const c = new URL(clientOrigin); if (/^(localhost|127\.0\.0\.1)$/.test(c.hostname)) return c.origin; } catch { /* ignore */ }
  }
  return canonical;
}
