/**
 * Signed, opaque tokens for email open/click tracking.
 *
 * The token carries only a message id plus a truncated HMAC. No email address,
 * no name, no org id — a leaked URL reveals nothing about the homeowner and
 * cannot be forged into a different message.
 *
 * Server-only.
 */

import { createHmac, timingSafeEqual } from "crypto";

export const SITE_URL = "https://rentaconopcion.lovable.app";

function secret(): string {
  const s = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? process.env["LOVABLE_API_KEY"];
  if (!s) throw new Error("Tracking is not configured");
  return s;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input as any)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function signToken(messageId: string): string {
  const mac = createHmac("sha256", secret()).update(messageId).digest("hex").slice(0, 20);
  return `${b64url(messageId)}.${mac}`;
}

export function verifyToken(token: string | null | undefined): string | null {
  if (!token || !token.includes(".")) return null;
  const [raw, mac] = token.split(".");
  if (!raw || !mac) return null;
  let messageId: string;
  try {
    messageId = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return null;
  }
  if (!/^[0-9a-f-]{36}$/i.test(messageId)) return null;
  const expected = createHmac("sha256", secret()).update(messageId).digest("hex").slice(0, 20);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return messageId;
}

export function openPixelUrl(messageId: string): string {
  return `${SITE_URL}/api/public/t/open?m=${encodeURIComponent(signToken(messageId))}`;
}

export function clickUrl(messageId: string, target: string): string {
  return `${SITE_URL}/api/public/t/click?m=${encodeURIComponent(
    signToken(messageId),
  )}&u=${encodeURIComponent(target)}`;
}

/**
 * Records an engagement event for a tracked message. Idempotent-ish: repeated
 * opens inside the same hour collapse into one row so a mail client that
 * prefetches images cannot inflate the funnel.
 */
export async function recordTrackedEvent(
  messageId: string,
  event: "open" | "click",
  detail?: string | null,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: msg } = await supabaseAdmin
    .from("outreach_messages")
    .select("id, org_id, portfolio_client_id, opportunity_id")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg) return;

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabaseAdmin
    .from("outreach_events")
    .select("id")
    .eq("message_id", messageId)
    .eq("event", event)
    .gte("occurred_at", since)
    .limit(1);
  if (recent && recent.length) return;

  await supabaseAdmin.from("outreach_events").insert({
    org_id: msg.org_id,
    portfolio_client_id: msg.portfolio_client_id,
    opportunity_id: msg.opportunity_id,
    message_id: msg.id,
    event,
    detail: detail ? String(detail).slice(0, 300) : null,
  });
}
