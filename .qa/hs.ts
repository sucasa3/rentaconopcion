import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../src/integrations/supabase/client.server";
const db = supabaseAdmin as any;
const stamp = Date.now().toString(36);
const URL = process.env.SUPABASE_URL!, KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
async function user(tag: string) {
  const email = `test-synthetic+qa-hs-${tag}-${stamp}@sucasa.com`, password = `QaFixture-${stamp}!9`;
  const { data: u, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { sucasa_qa_fixture: true } });
  if (error) throw error;
  const s = await (await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: KEY, "content-type": "application/json" }, body: JSON.stringify({ email, password }) })).json();
  const c = createClient(URL, KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${s.access_token}` } } });
  return { uid: u.user.id as string, c: c as any, email, password };
}
async function org(tag: string, memberUid: string) {
  const { data: o } = await db.from("lender_orgs").insert({ name: `TEST-SYNTHETIC QA hs ${tag}`, org_type: "agent", plan: "starter" }).select("id").single();
  await db.from("lender_members").insert({ lender_org_id: o.id, user_id: memberUid, role: "owner" });
  const { data: b } = await db.from("lender_portfolios").insert({ lender_org_id: o.id, name: `TEST-SYNTHETIC QA hs ${tag} book` }).select("id").single();
  return { orgId: o.id as string, bookId: b.id as string };
}
const results: [string, boolean, string][] = [];
const check = (n: string, ok: boolean, ev = "") => { results.push([n, ok, ev]); };
const args = (h: string, org: string | null, v: number | null, year: number) => ({ p_homeowner: h, p_component_key: "water_heater", p_org_id: org, p_expected_version: v, p_action: "replaced", p_installed_year: year, p_serviced_on: `${year}-01-01`, p_brand: "QA", p_model: null, p_warranty_years: null, p_provider: null, p_notes: null });

const H = await user("home"), A = await user("agentA"), A2 = await user("teammate"), B = await user("agentB");
const OA = await org("A", A.uid); await db.from("lender_members").insert({ lender_org_id: OA.orgId, user_id: A2.uid, role: "member" });
const OB = await org("B", B.uid);
const { data: cA } = await db.from("lender_portfolio_clients").insert({ portfolio_id: OA.bookId, address_line1: "1 QA Synthetic Way", client_name: "TEST-SYNTHETIC QA", homeowner_id: H.uid }).select("id").single();
const { data: cB } = await db.from("lender_portfolio_clients").insert({ portfolio_id: OB.bookId, address_line1: "1 QA Synthetic Way", client_name: "TEST-SYNTHETIC QA", homeowner_id: H.uid }).select("id").single();

// Default off; imported match grants nothing
let r = (await A.c.rpc("get_home_systems_for_agent", { p_org_id: OA.orgId, p_client_id: cA.id })).data;
check("default off: agent read denied, no details", r.allowed === false && r.reason === "no_permission" && !("entries" in r), JSON.stringify(r));
r = (await A.c.rpc("save_home_system", args(H.uid, OA.orgId, 0, 2020))).data;
check("default off: agent save denied", r.ok === false && r.error === "forbidden", JSON.stringify(r));
// Agent can't grant itself
r = (await A.c.rpc("set_home_system_access", { p_org_id: OA.orgId, p_enabled: true })).data;
check("agent cannot grant", r.ok === false, JSON.stringify(r));
const ins = await A.c.from("home_system_access_grants").insert({ homeowner_user_id: H.uid, org_id: OA.orgId });
check("agent direct insert blocked", !!ins.error, ins.error?.message ?? "");
const dl = await H.c.from("home_component_service_log").insert({ user_id: H.uid, component_key: "roof", action: "replaced" });
check("direct log write blocked (must use versioned save)", !!dl.error, dl.error?.message ?? "");
// Homeowner grants A only
const opts = (await H.c.rpc("list_home_system_access_options")).data;
check("homeowner sees both linked workspaces, both off, member counts", opts.length === 2 && opts.every((o: any) => !o.enabled) && opts.find((o: any) => o.org_id === OA.orgId).member_count === 2, JSON.stringify(opts));
r = (await H.c.rpc("set_home_system_access", { p_org_id: OA.orgId, p_enabled: true })).data;
check("homeowner grants A", r.ok === true);
r = (await A.c.rpc("get_home_systems_for_agent", { p_org_id: OA.orgId, p_client_id: cA.id })).data;
check("agent A read allowed after grant", r.allowed === true && r.versions && Array.isArray(r.entries));
r = (await A2.c.rpc("get_home_systems_for_agent", { p_org_id: OA.orgId, p_client_id: cA.id })).data;
check("teammate in A allowed", r.allowed === true);
r = (await B.c.rpc("get_home_systems_for_agent", { p_org_id: OB.orgId, p_client_id: cB.id })).data;
check("workspace B still denied", r.allowed === false);
r = (await B.c.rpc("get_home_systems_for_agent", { p_org_id: OA.orgId, p_client_id: cA.id })).data;
check("B using A's ids denied (not member)", r.allowed === false && r.reason === "not_member");
r = (await B.c.rpc("save_home_system", args(H.uid, OA.orgId, 0, 2019))).data;
check("B save via A's workspace denied", r.ok === false && r.error === "forbidden");
// Agent save + attribution
r = (await A.c.rpc("save_home_system", args(H.uid, OA.orgId, 0, 2018))).data;
check("agent A save ok, v1", r.ok === true && r.version === 1 && r.kind === "added", JSON.stringify(r));
const log = (await H.c.from("home_component_service_log").select("entered_by_role, entry_kind, entered_by_org_id, version").eq("user_id", H.uid)).data;
check("homeowner sees agent-entered value labelled agent/added", log[0]?.entered_by_role === "agent" && log[0]?.entry_kind === "added" && log[0]?.entered_by_org_id === OA.orgId);
// Conflict: homeowner updates (v1->v2), agent with stale v1 refused
r = (await H.c.rpc("save_home_system", args(H.uid, null, 1, 2021))).data;
check("homeowner update ok, v2 'updated'", r.ok && r.version === 2 && r.kind === "updated", JSON.stringify(r));
r = (await A.c.rpc("save_home_system", args(H.uid, OA.orgId, 1, 2017))).data;
check("agent stale save refused (conflict)", r.ok === false && r.error === "conflict" && r.version === 2, JSON.stringify(r));
r = (await H.c.rpc("save_home_system", args(H.uid, null, 1, 2016))).data;
check("homeowner stale save refused (conflict)", r.ok === false && r.error === "conflict");
r = (await H.c.rpc("save_home_system", args(H.uid, null, null, 2016))).data;
check("save without version refused", r.ok === false && r.error === "conflict");
// Concurrent: 8 agent saves with same version => 1 wins
const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => A.c.rpc("save_home_system", args(H.uid, OA.orgId, 2, 2010 + i))));
check("8 simultaneous saves on same version: exactly 1 accepted", rs.filter((x: any) => x.data?.ok).length === 1);
// History
const hist = (await H.c.from("home_system_changes").select("version, actor_role, change_kind, old_value, new_value, org_id").eq("homeowner_user_id", H.uid).order("version")).data;
check("history: 3 rows v1..v3, actors agent/homeowner/agent, old→new chained", hist.length === 3 && hist.map((h: any) => h.actor_role).join() === "agent,homeowner,agent" && hist[1].old_value.installed_year === 2018 && hist[1].new_value.installed_year === 2021, JSON.stringify(hist.map((h: any) => [h.version, h.actor_role, h.change_kind])));
const logCount = (await db.from("home_component_service_log").select("id", { count: "exact", head: true }).eq("user_id", H.uid)).count;
check("atomic: log rows == history rows", logCount === hist.length, `${logCount}/${hist.length}`);
const ah = (await B.c.from("home_system_changes").select("id").eq("homeowner_user_id", H.uid)).data;
check("other agents can't read history table directly", (ah ?? []).length === 0);
// Revocation
r = (await H.c.rpc("set_home_system_access", { p_org_id: OA.orgId, p_enabled: false })).data;
r = (await A.c.rpc("save_home_system", args(H.uid, OA.orgId, 3, 2022))).data;
check("after revoke: open-screen save refused", r.ok === false && r.error === "forbidden");
r = (await A2.c.rpc("get_home_systems_for_agent", { p_org_id: OA.orgId, p_client_id: cA.id })).data;
check("after revoke: teammate read refused", r.allowed === false);
// Archived client link doesn't keep access
await H.c.rpc("set_home_system_access", { p_org_id: OA.orgId, p_enabled: true });
await db.from("lender_portfolio_clients").update({ archived_at: new Date().toISOString() }).eq("id", cA.id);
r = (await A.c.rpc("get_home_systems_for_agent", { p_org_id: OA.orgId, p_client_id: cA.id })).data;
check("archived client: access refused even with grant", r.allowed === false);
await db.from("lender_portfolio_clients").update({ archived_at: null }).eq("id", cA.id);
// Separate from marketing/lender access
const cons = (await db.from("consent_records").select("id", { count: "exact", head: true }).eq("user_id", H.uid)).count;
const prof = (await db.from("profiles").select("campaign_opt_out, is_test_account").eq("id", H.uid).single()).data;
check("no consent/marketing records created; fixture flagged test", (cons ?? 0) === 0 && prof.is_test_account === true, JSON.stringify({ cons, prof }));
const q = (await db.from("ghl_sync_queue").select("id").in("entity_id", [H.uid, A.uid, A2.uid, B.uid])).data;
check("new QA accounts not queued for CRM", (q ?? []).length === 0, String(q?.length));
await Bun.write("/tmp/browser/qa/hs-fixtures.json", JSON.stringify({ H: { email: H.email, password: H.password, uid: H.uid }, A: { email: A.email, password: A.password }, B: { email: B.email, password: B.password }, OA, OB, cA: cA.id, cB: cB.id }));
for (const [n, ok, ev] of results) console.log(ok ? "PASS" : "FAIL", n, ok ? "" : ev);
