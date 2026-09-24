// Branch-demo cleanup. Deletes ONLY ids listed in docs/demo-staging-manifest.json
// (plus call notes / outcomes / home profile later attached to those demo records).
// Never touches property_intel or any pre-existing row.
// Dry run (default):  bun docs/demo-cleanup.ts
// Execute:            bun docs/demo-cleanup.ts --execute
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const EXECUTE = process.argv.includes("--execute");
const M = JSON.parse(readFileSync(new URL("./demo-staging-manifest.json", import.meta.url), "utf8")).created as Record<string, string[]>;
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const clients = M.lender_portfolio_clients ?? [];
const users = M["auth.users"] ?? [];
const chunk = <T,>(a: T[], n = 100) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
async function ids(table: string, col: string, vals: string[]) {
  const out: string[] = [];
  for (const c of chunk(vals)) out.push(...((await sb.from(table).select("id").in(col, c)).data ?? []).map((r: any) => r.id));
  return out;
}

const plan: [string, string[]][] = [
  ["introduction_channel_grants", M.introduction_channel_grants ?? []],
  ["introductions", M.introductions ?? []],
  ["professional_conversations", await ids("professional_conversations", "portfolio_client_id", clients)],
  ["opportunity_outcomes", await ids("opportunity_outcomes", "portfolio_client_id", clients)],
  ["homeowner_opportunities", [...new Set([...(M.homeowner_opportunities ?? []), ...(await ids("homeowner_opportunities", "portfolio_client_id", clients))])]],
  ["outreach_events", [...new Set([...(M.outreach_events ?? []), ...(await ids("outreach_events", "portfolio_client_id", clients))])]],
  ["outreach_channel_permissions", M.outreach_channel_permissions ?? []],
  ["property_enrichment_queue", await ids("property_enrichment_queue", "portfolio_client_id", clients)],
  ["agent_credit_ledger", M.agent_credit_ledger ?? []],
  ["property_intel_misses", M.property_intel_misses ?? []],
  ["lender_portfolio_clients", clients],
  ["agent_lender_connections", M.agent_lender_connections ?? []],
  ["lender_portfolios", M.lender_portfolios ?? []],
  ["lender_members", M.lender_members ?? []],
  ["user_roles", M.user_roles ?? []],
  ["home_profiles", await ids("home_profiles", "user_id", users)],
  ["lender_orgs", M.lender_orgs ?? []],
];

console.log(EXECUTE ? "EXECUTING cleanup" : "DRY RUN — nothing deleted");
for (const [t, v] of plan) console.log(`  ${t}: ${v.length}`);
console.log(`  auth users: ${users.length}`);
if (!EXECUTE) process.exit(0);

for (const [t, v] of plan) for (const c of chunk(v)) {
  const { error } = await sb.from(t).delete().in("id", c);
  if (error) throw new Error(`${t}: ${error.message}`);
}
for (const u of users) { const { error } = await sb.auth.admin.deleteUser(u); if (error) throw error; }
console.log("done");
