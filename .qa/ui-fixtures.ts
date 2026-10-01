// QA-only: isolated UI fixtures. D = unverified with a seeded (mock-sent) code; E = verified, unclaimed; B reused from server run.
import { supabaseAdmin } from "../src/integrations/supabase/client.server";
import { hashCode } from "../src/lib/account.server";
import { phoneHash } from "../src/lib/agent-discovery.server";
const db = supabaseAdmin as any;
const stamp = Date.now().toString(36);
const mode = process.argv[2];

async function fixture(tag: string) {
  const email = `test-synthetic+qa-${tag}-${stamp}@sucasa.com`;
  const password = `QaFixture-${stamp}!9`;
  const { data: u, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { sucasa_qa_fixture: true } });
  if (error) throw error;
  const { data: org, error: oe } = await db.from("lender_orgs").insert({ name: `TEST-SYNTHETIC QA ${tag}`, org_type: "agent", plan: "starter" }).select("id").single();
  if (oe) throw oe;
  await db.from("lender_members").insert({ lender_org_id: org.id, user_id: u.user.id, role: "owner" });
  const { data: book } = await db.from("lender_portfolios").insert({ lender_org_id: org.id, name: `TEST-SYNTHETIC QA ${tag} book` }).select("id").single();
  const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY!, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const session = await r.json();
  return { uid: u.user.id, orgId: org.id, bookId: book.id, session };
}

/** Seed an accepted challenge with a known code (stands in for a mocked text). */
async function seedCode(uid: string, e164: string, code: string, ageSec = 0) {
  await db.from("agent_phone_challenges").update({ consumed_at: new Date().toISOString() }).eq("user_id", uid).is("consumed_at", null);
  await db.from("agent_phone_challenges").insert({
    user_id: uid, phone_hash: await phoneHash(e164), code_hash: hashCode(code, `agent:${uid}:${e164}`),
    expires_at: new Date(Date.now() + 600_000).toISOString(), delivery_status: "accepted",
    created_at: new Date(Date.now() - ageSec * 1000).toISOString(),
  });
}

if (mode === "seed") {
  await seedCode(process.argv[3], process.argv[4], process.argv[5], Number(process.argv[6] ?? 0));
  console.log("seeded");
} else if (mode === "state") {
  const org = process.argv[3];
  const l = (await db.from("agent_credit_ledger").select("kind,delta").eq("org_id", org)).data;
  const r = (await db.from("agent_promo_redemptions").select("id").eq("org_id", org)).data;
  console.log(JSON.stringify({ ledger: l, redemptions: r?.length }));
} else {
  const D = await fixture("d");
  const E = await fixture("e");
  const F = await fixture("f");
  // E: verified phone, unclaimed. F: verified with the number already used by fixture A.
  const { recordVerifiedPhone } = await import("../src/lib/agent-discovery.server");
  await recordVerifiedPhone({ userId: E.uid, orgId: E.orgId, e164: `+1404555${String(1000 + Math.floor(Math.random() * 8999))}`, licenseKey: null, licenseNumber: null, licenseState: null });
  await recordVerifiedPhone({ userId: F.uid, orgId: F.orgId, e164: "+14045550142", licenseKey: null, licenseNumber: null, licenseState: null });
  await Bun.write("/tmp/browser/qa/fixtures.json", JSON.stringify({ D, E, F }));
  console.log("ok", D.bookId, E.bookId, F.bookId, Boolean(D.session.access_token));
}
