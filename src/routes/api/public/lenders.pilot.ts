import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const pilotRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(160),
  company: z.string().trim().min(1).max(160),
  loanOfficers: z.string().trim().max(80).optional(),
  markets: z.string().trim().max(200).optional(),
  message: z.string().trim().max(2000).optional(),
  visitId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/api/public/lenders/pilot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const parsed = pilotRequestSchema.safeParse(body);
        if (!parsed.success) {
          return new Response("Invalid request", { status: 400 });
        }

        const { name, email, company, loanOfficers, markets, message, visitId } = parsed.data;

        try {
          const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { logNetworkEventOnce } = await import("@/lib/network-events.server");

          await sendTemplateEmail("lender-pilot-request", email, {
            purpose: "transactional",
            templateData: { name, email, company, loanOfficers, markets, message },
            idempotencyKey: `lender-pilot-${email.toLowerCase()}-${new Date().toISOString().slice(0, 10)}`,
            replyTo: email,
          });

          if (visitId) {
            await logNetworkEventOnce(supabaseAdmin, {
              action: "lender_pilot_submitted",
              entityType: "agent_funnel_visit",
              entityId: visitId,
              metadata: {
                company,
                markets,
              },
            });
          }
        } catch (error) {
          console.error("Lender pilot request failed:", error);
          return new Response("Failed to send request", { status: 500 });
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
