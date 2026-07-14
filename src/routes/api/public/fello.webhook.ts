import { createFileRoute } from "@tanstack/react-router";

// Fello webhook receiver. Auth via ?token=<FELLO_WEBHOOK_TOKEN> in the URL
// (Fello doesn't sign payloads, so we use a shared bearer in the query).
// Events are logged to public.fello_events and best-effort mapped to a user.
export const Route = createFileRoute("/api/public/fello/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.FELLO_WEBHOOK_TOKEN;
        const url = new URL(request.url);
        const provided = url.searchParams.get("token") ?? "";
        if (!expected || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        const eventType =
          (body.eventType as string) ??
          (body.event as string) ??
          (body.type as string) ??
          "unknown";
        const contact = (body.contact ?? body.data ?? {}) as Record<string, unknown>;
        const felloContactId =
          (contact.contactId as string) ??
          (body.contactId as string) ??
          null;
        const email = (contact.email as string) ?? (body.email as string) ?? null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Try to resolve user_id by fello_contact_id or email.
        let userId: string | null = null;
        if (felloContactId) {
          const { data } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("fello_contact_id", felloContactId)
            .maybeSingle();
          userId = data?.id ?? null;
        }
        if (!userId && email) {
          const { data } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("email", email)
            .maybeSingle();
          userId = data?.id ?? null;
        }

        await supabaseAdmin.from("fello_events").insert({
          event_type: eventType,
          fello_contact_id: felloContactId,
          user_id: userId,
          payload: body,
        });

        // On enrichment events, refresh valuation on the profile.
        if (eventType === "ContactEnriched" && felloContactId) {
          try {
            const fello = await import("@/lib/fello.server");
            const enriched = await fello.getFelloContact({ contactId: felloContactId });
            if (enriched && userId) {
              const v = fello.extractValuation(enriched);
              await supabaseAdmin
                .from("profiles")
                .update({
                  fello_estimated_value_cents: v.estimatedValueCents,
                  fello_equity_cents: v.equityCents,
                  fello_lead_score:
                    typeof enriched.leadScore === "number" ? enriched.leadScore : null,
                  fello_last_synced_at: new Date().toISOString(),
                })
                .eq("id", userId);
            }
          } catch {
            /* logged in fello_events already */
          }
        }

        return Response.json({ ok: true });
      },
    },
  },
});
