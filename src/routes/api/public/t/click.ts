import { createFileRoute } from "@tanstack/react-router";

const FALLBACK = "https://rentaconopcion.lovable.app/dashboard";

/** Only same-site destinations are ever redirected to. */
function safeTarget(raw: string | null): string {
  if (!raw) return FALLBACK;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    const ok =
      host.endsWith("lovable.app") || host === "sucasa.com" || host.endsWith(".sucasa.com");
    return ok ? u.toString() : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export const Route = createFileRoute("/api/public/t/click")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const target = safeTarget(url.searchParams.get("u"));
        try {
          const { verifyToken, recordTrackedEvent } = await import("@/lib/tracking.server");
          const messageId = verifyToken(url.searchParams.get("m"));
          if (messageId) await recordTrackedEvent(messageId, "click", target);
        } catch {
          // Never block the homeowner's click.
        }
        return new Response(null, {
          status: 302,
          headers: { Location: target, "Cache-Control": "no-store" },
        });
      },
    },
  },
});
