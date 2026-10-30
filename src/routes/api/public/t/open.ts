import { createFileRoute } from "@tanstack/react-router";

/** 1x1 transparent GIF. */
// Decoded with atob (not Node Buffer) so this module is safe in every runtime.
const PIXEL = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));

export const Route = createFileRoute("/api/public/t/open")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const { verifyToken, recordTrackedEvent } = await import("@/lib/tracking.server");
          const messageId = verifyToken(url.searchParams.get("m"));
          if (messageId) await recordTrackedEvent(messageId, "open");
        } catch {
          // Tracking must never break image loading.
        }
        return new Response(PIXEL, {
          headers: {
            "Content-Type": "image/gif",
            "Cache-Control": "no-store, no-cache, must-revalidate, private",
          },
        });
      },
    },
  },
});
