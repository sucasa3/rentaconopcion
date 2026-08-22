import { createFileRoute } from "@tanstack/react-router";

/** 1x1 transparent GIF. */
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

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
