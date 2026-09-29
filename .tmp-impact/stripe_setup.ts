import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
const T = process.env.STRIPE_TEST_SECRET_KEY!, L = process.env.STRIPE_SECRET_KEY!;
console.log("test key is test:", /^(sk|rk)_test_/.test(T), "live key is live:", /^(sk|rk)_live_/.test(L));
const { data: plans } = await (db as any).from("plan_tiers").select("key,price_cents,stripe_price_id,stripe_test_price_id").in("key",["pilot_90","mlo_growth"]);
for (const p of plans) {
  const r = await fetch(`https://api.stripe.com/v1/prices/${p.stripe_price_id}`, { headers: { Authorization: `Bearer ${L}` } });
  const j: any = await r.json();
  console.log(p.key, p.price_cents, p.stripe_test_price_id, "live:", j.type, j.unit_amount, j.currency, j.recurring?.interval, j.recurring?.interval_count);
}
