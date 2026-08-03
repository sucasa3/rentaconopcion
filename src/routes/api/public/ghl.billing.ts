import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

// GHL billing webhook → activates / suspends a pro's membership.
// Auth: HMAC-SHA256 of the raw body with GHL_WEBHOOK_SECRET in `x-sucasa-signature`.
const Payload = z.object({
  pro_id: z.string().uuid().optional(),
  email: z.string().email().max(200).optional(),
  status: z.enum([
    "active",
    "paid",
    "subscription_active",
    "past_due",
    "payment_failed",
    "canceled",
    "cancelled",
    "subscription_canceled",
  ]),
  ghl_contact_id: z.string().max(120).optional(),
});

function normalizeStatus(s: string): "active" | "past_due" | "canceled" {
  if (s === "active" || s === "paid" || s === "subscription_active") return "active";
  if (s === "past_due" || s === "payment_failed") return "past_due";
  return "canceled";
}

export const Route = createFileRoute("/api/public/ghl/billing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.GHL_WEBHOOK_SECRET;
        if (!secret) return new Response("Server not configured", { status: 500 });

        const raw = await request.text();
        const sig = request.headers.get("x-sucasa-signature") ?? "";
        const expected = createHmac("sha256", secret).update(raw).digest("hex");
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let parsed;
        try {
          parsed = Payload.parse(JSON.parse(raw));
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }
        if (!parsed.pro_id && !parsed.email) {
          return new Response("pro_id or email required", { status: 400 });
        }

        const status = normalizeStatus(parsed.status);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let query = supabaseAdmin.from("pros").select("id").limit(1);
        query = parsed.pro_id ? query.eq("id", parsed.pro_id) : query.eq("email", parsed.email!);
        const { data: rows } = await query;
        const pro = rows?.[0];
        if (!pro) return new Response("Pro not found", { status: 404 });

        const patch: {
          subscription_status: string;
          active: boolean;
          accepting_leads: boolean;
          subscription_activated_at?: string;
          ghl_contact_id?: string;
        } = {

          active: status === "active",
          accepting_leads: status === "active",
        };
        if (status === "active") patch.subscription_activated_at = new Date().toISOString();
        if (parsed.ghl_contact_id) patch.ghl_contact_id = parsed.ghl_contact_id;

        const { error } = await supabaseAdmin.from("pros").update(patch).eq("id", pro.id);
        if (error) return new Response("Update failed", { status: 500 });

        return Response.json({ ok: true, pro_id: pro.id, subscription_status: status });
      },
    },
  },
});
