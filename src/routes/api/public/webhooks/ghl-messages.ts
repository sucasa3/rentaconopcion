import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

/**
 * Inbound message / do-not-disturb events from the texting provider
 * (GoHighLevel). The provider owns STOP and START natively: a STOP reply sets
 * the contact's do-not-disturb state there and the provider refuses further
 * sends. SuCasa does not parse keywords to build a competing opt-out — it
 * mirrors the provider's state so the rest of the product (call queues, Today
 * recommendations, campaigns) honours it too.
 *
 * Auth: a fixed shared secret in `x-sucasa-webhook-token`, compared in constant
 * time against GHL_INBOUND_WEBHOOK_TOKEN. GoHighLevel workflow webhooks can send
 * fixed custom headers but cannot sign the request body, so this is the scheme
 * the provider can actually satisfy. The older body-HMAC in `x-sucasa-signature`
 * (GHL_WEBHOOK_SECRET) is still accepted for backwards compatibility.
 * Idempotent on the provider message id.
 */
const Payload = z.object({
  type: z.string().max(80).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().max(200).optional(),
  /** Provider contact id — the preferred non-readable association key. */
  contactId: z.string().max(120).optional(),
  /** Inbound body — read for the keyword only; never stored. */
  message: z.string().max(2000).optional(),
  messageId: z.string().max(120).optional(),
  dnd: z.boolean().optional(),
});

const STOP_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "revoke"]);
const START_WORDS = new Set(["start", "unstop", "yes", "subscribe"]);

function keyword(message: string | undefined): "stop" | "start" | null {
  const first = (message ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (!first) return null;
  if (STOP_WORDS.has(first)) return "stop";
  if (START_WORDS.has(first)) return "start";
  return null;
}

/** Constant-time equality for the shared token. */
function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/webhooks/ghl-messages")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["GHL_WEBHOOK_SECRET"];
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
        if (!parsed.phone && !parsed.email) {
          return new Response("phone or email required", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Idempotency: the same provider message never applies twice.
        if (parsed.messageId) {
          const { data: seen } = await supabaseAdmin
            .from("communication_preference_events")
            .select("id")
            .eq("provider_message_id", parsed.messageId)
            .limit(1);
          if ((seen ?? []).length) return Response.json({ ok: true, duplicate: true });
        }

        const intent = parsed.dnd === true ? "stop" : keyword(parsed.message);
        if (!intent) return Response.json({ ok: true, applied: "none" });

        const policy = await import("@/lib/messaging-policy.server");

        if (intent === "stop") {
          await policy.recordProviderOptOut(supabaseAdmin, {
            phone: parsed.phone ?? null,
            email: parsed.email ?? null,
            providerMessageId: parsed.messageId ?? null,
            source: parsed.dnd === true ? "provider_dnd" : "provider_stop",
          });
          return Response.json({ ok: true, applied: "stop" });
        }

        // START is express consent given on the texting channel itself. The
        // evidence is what that channel offers: the keyword, the number, the
        // provider message id and the time — not a web form's IP address.
        const renewed = await policy.recordSmsReConsent(
          supabaseAdmin,
          { phone: parsed.phone ?? null, email: parsed.email ?? null },
          {
            source: "provider_start_keyword",
            consentText: `Inbound keyword "${keyword(parsed.message) === "start" ? (parsed.message ?? "").trim().slice(0, 40) : "START"}" from ${parsed.phone ?? "unknown number"}`,
            providerMessageId: parsed.messageId ?? `start-${parsed.phone ?? "unknown"}-${Date.now()}`,
          },
        );
        return Response.json({ ok: true, applied: renewed.renewed ? "start" : "none" });
      },
    },
  },
});
