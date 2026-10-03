/**
 * Hosts that run the preview/development build. Only these may ever use the
 * Stripe test key or generate preview-origin links; the published site and
 * custom domains always run live.
 */
export function isPreviewHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.toLowerCase().split(":")[0] ?? "";
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h.startsWith("id-preview--") ||
    /^project--[^.]+-dev\.lovable\.app$/.test(h)
  );
}
