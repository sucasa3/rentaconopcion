// QA-only integration checks against the real database. Text messages are mocked.
import { test, expect, mock, beforeAll } from "bun:test";
import path from "path";

const sent: { to: string; body: string }[] = [];
let failNextSend = false;
const ghl = path.resolve(import.meta.dir, "../src/lib/ghl.server.ts");
mock.module(ghl, () => ({
  ensureVerificationContact: async () => "qa-contact",
  lookupContactDndById: async () => false,
  findContactIdByPhone: async () => "qa-contact",
  sendProSms: async (to: string, body: string) => {
    if (failNextSend) {
      failNextSend = false;
      throw new Error("mock provider failure");
    }
    sent.push({ to, body });
    return { sent: true };
  },
}));
process.env.GHL_API_KEY ||= "qa-mock";
process.env.GHL_LOCATION_ID ||= "qa-mock";

const { supabaseAdmin } = await import("../src/integrations/supabase/client.server");
const db = supabaseAdmin as any;
const S = await import("../src/lib/agent-discovery.server");

const stamp = Date.now().toString(36);
async function fixture(tag: string) {
  const email = `test-synthetic+qa-${tag}-${stamp}@sucasa.com`;
  const { data: u, error } = await db.auth.admin.createUser({
    email, password: `QaFixture-${stamp}!9`, email_confirm: true, app_metadata: { sucasa_qa_fixture: true },
  });
  if (error) throw error;
  const uid = u.user.id;
  const { data: org, error: oe } = await db.from("lender_orgs").insert({ name: `TEST-SYNTHETIC QA ${tag}`, org_type: "agent", plan: "starter" }).select("id").single(); if (oe) throw oe;
  await db.from("lender_members").insert({ lender_org_id: org.id, user_id: uid, role: "owner" });
  const { data: book } = await db.from("lender_portfolios").insert({ lender_org_id: org.id, name: `TEST-SYNTHETIC QA ${tag} book` }).select("id").single();
  return { email, uid, orgId: org.id as string, bookId: book.id as string };
}
const ledger = async (org: string) => (await db.from("agent_credit_ledger").select("kind,delta").eq("org_id", org)).data ?? [];
const codeOf = () => sent.at(-1)!.body.match(/(\d{6})/)![1];

const PHONE = "+14045550142";
let A: any, B: any, C: any;
beforeAll(async () => {
  [A, B, C] = await Promise.all([fixture("a"), fixture("b"), fixture("c")]);
  console.log("FIXTURES", JSON.stringify({ A, B, C }));
});

test("failed dispatch invalidates its code and doesn't trigger cooldown", async () => {
  failNextSend = true;
  const r = await S.sendSmsCode(A.uid, PHONE);
  expect(r).toMatchObject({ sent: false, reason: "send_failed" });
  const { data } = await db.from("agent_phone_challenges").select("consumed_at,delivery_status").eq("user_id", A.uid);
  expect(data[0].consumed_at).not.toBeNull();
  expect(data[0].delivery_status).toBe("failed");
  expect((await S.sendSmsCode(A.uid, PHONE)).sent).toBe(true);
});

test("resend inside cooldown refused, no new code", async () => {
  const before = sent.length;
  expect(await S.sendSmsCode(A.uid, PHONE)).toMatchObject({ sent: false, reason: "cooldown" });
  expect(sent.length).toBe(before);
});

test("wrong code rejected, attempt counted, nothing unlocked", async () => {
  const good = codeOf();
  const bad = good === "000000" ? "111111" : "000000";
  const r = await S.checkSmsCode(A.uid, PHONE, bad);
  expect(r.ok).toBe(false);
  expect((r as any).message).toMatch(/incorrect|match|wrong/i);
  expect(await ledger(A.orgId)).toHaveLength(0);
  expect(await S.redeemForVerifiedUser({ userId: A.uid, orgId: A.orgId })).toBe("not_verified");
});

test("expired code rejected", async () => {
  const good = codeOf();
  const { data: c } = await db.from("agent_phone_challenges").select("id,expires_at").eq("user_id", A.uid).order("created_at", { ascending: false }).limit(1).single();
  await db.from("agent_phone_challenges").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", c.id);
  const r = await S.checkSmsCode(A.uid, PHONE, good);
  expect((r as any).message).toMatch(/expired/i);
  await db.from("agent_phone_challenges").update({ expires_at: c.expires_at }).eq("id", c.id);
});

test("correct code verifies once; reuse refused", async () => {
  const good = codeOf();
  const [r1, r2] = await Promise.all([S.checkSmsCode(A.uid, PHONE, good), S.checkSmsCode(A.uid, PHONE, good)]);
  expect([r1.ok, r2.ok].filter(Boolean)).toHaveLength(1);
  await S.recordVerifiedPhone({ userId: A.uid, orgId: A.orgId, e164: PHONE, licenseKey: null, licenseNumber: null, licenseState: null });
  expect((await S.checkSmsCode(A.uid, PHONE, good)).ok).toBe(false);
});

test("claim after a failed attempt needs no new code; 12 concurrent claims → one grant", async () => {
  const codesBefore = sent.length;
  const outs = await Promise.all(Array.from({ length: 12 }, () => S.redeemForVerifiedUser({ userId: A.uid, orgId: A.orgId })));
  expect(outs.filter((o) => o === "granted")).toHaveLength(1);
  expect(outs.every((o) => ["granted", "already_entitled", "org_used"].includes(o))).toBe(true);
  const l = await ledger(A.orgId);
  expect(l).toEqual([{ kind: "base", delta: 100 }]);
  expect(sent.length).toBe(codesBefore);
  const { count } = await db.from("agent_promo_redemptions").select("id", { count: "exact", head: true }).eq("org_id", A.orgId);
  expect(count).toBe(1);
  expect(await S.redeemForVerifiedUser({ userId: A.uid, orgId: A.orgId })).toBe("org_used");
});

test("already-used number can't get a second free allowance (separate account)", async () => {
  await S.recordVerifiedPhone({ userId: B.uid, orgId: B.orgId, e164: PHONE, licenseKey: null, licenseNumber: null, licenseState: null });
  const outs = await Promise.all(Array.from({ length: 5 }, () => S.redeemForVerifiedUser({ userId: B.uid, orgId: B.orgId })));
  expect(outs.every((o) => o === "phone_used")).toBe(true);
  expect(await ledger(B.orgId)).toHaveLength(0);
});

test("fresh number, concurrent claims from two code paths → one grant", async () => {
  await S.recordVerifiedPhone({ userId: C.uid, orgId: C.orgId, e164: "+14045550143", licenseKey: null, licenseNumber: null, licenseState: null });
  const outs = await Promise.all([
    ...Array.from({ length: 6 }, () => S.redeemForVerifiedUser({ userId: C.uid, orgId: C.orgId })),
    ...Array.from({ length: 6 }, () => db.rpc("redeem_agent_promotion", { _user_id: C.uid, _org_id: C.orgId, _phone_hash: "x".repeat(64) }).then((r: any) => r.data)),
  ]);
  expect(outs.filter((o) => o === "granted")).toHaveLength(1);
  expect(await ledger(C.orgId)).toEqual([{ kind: "base", delta: 100 }]);
});

test("verify-only account restriction untouched", async () => {
  const { data } = await db.auth.admin.getUserById("2b6b70fb-18ad-4eba-ac85-3dd731a5a487");
  expect(data.user.app_metadata.sucasa_verify_only).toBe(true);
  expect(await ledger("083a5ff6-13e1-4c88-9ca5-f44f02288d6f")).toHaveLength(0);
});
