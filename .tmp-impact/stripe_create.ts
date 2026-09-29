import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
const T = process.env.STRIPE_TEST_SECRET_KEY!;
async function s(path: string, body?: Record<string,string>) {
  const r = await fetch(`https://api.stripe.com/v1${path}`, { method: body?"POST":"GET", headers: { Authorization: `Bearer ${T}`, "Content-Type":"application/x-www-form-urlencoded" }, body: body? new URLSearchParams(body).toString(): undefined });
  const j: any = await r.json(); if (!r.ok) throw new Error(j.error?.message); if (j.livemode) throw new Error("LIVE OBJECT?!"); return j;
}
const pilotProd = await s("/products", { name: "SuCasa 90-Day Pilot (TEST)", "metadata[sucasa_plan]":"pilot_90" });
const pilot = await s("/prices", { product: pilotProd.id, unit_amount: "44700", currency: "usd", "metadata[sucasa_plan]":"pilot_90" });
const growthProd = await s("/products", { name: "SuCasa MLO Growth (TEST)", "metadata[sucasa_plan]":"mlo_growth" });
const growth = await s("/prices", { product: growthProd.id, unit_amount: "14900", currency: "usd", "recurring[interval]":"month", "metadata[sucasa_plan]":"mlo_growth" });
await (db as any).from("plan_tiers").update({ stripe_test_price_id: pilot.id }).eq("key","pilot_90");
await (db as any).from("plan_tiers").update({ stripe_test_price_id: growth.id }).eq("key","mlo_growth");
const wh = await s("/webhook_endpoints", { url: "https://project--94429f0c-1687-4b34-81a7-6195279589c3-dev.lovable.app/api/public/webhooks/stripe",
  "enabled_events[0]":"checkout.session.completed","enabled_events[1]":"customer.subscription.created","enabled_events[2]":"customer.subscription.updated","enabled_events[3]":"customer.subscription.deleted","enabled_events[4]":"invoice.payment_failed","enabled_events[5]":"invoice.payment_succeeded", description: "SuCasa preview (TEST mode)" });
await Bun.write("/tmp/whsec.txt", wh.secret);
console.log("pilot", pilot.id, "growth", growth.id, "webhook", wh.id, "livemode", wh.livemode);
