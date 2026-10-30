import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { beforeAll, it, expect } from "vitest";

// Disposable local PostgreSQL only, no hosted writes and no provider IO.
const args = ["-h", "/tmp/worker-local-pg/socket", "-p", "55439", "-U", "local_worker", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"];
const sql = (q: string, db = "reverse_upload") => execFileSync("psql", [...args, "-d", db, "-c", q], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const U = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const actor = U(1), book = U(2), org = U(3), batch = U(4), row = U(5);
function reserve(id = row, phone = "6784441234", cost = 30, owner = actor) {
  return JSON.parse(sql(`SELECT reserve_upload_reverse('${batch}','${owner}','[{"stagedId":"${id}","phone":"${phone}"}]',1,${cost},1000)`));
}
function fails(fn: () => unknown) { try { fn(); return false; } catch { return true; } }
beforeAll(() => {
  sql("DROP DATABASE IF EXISTS reverse_upload", "postgres"); sql("CREATE DATABASE reverse_upload", "postgres");
  const source = readFileSync("src/lib/__tests__/mixed-upload-sql.test.ts", "utf8");
  const fixture = source.split("const FIXTURE = `")[1]?.split("`;\n")[0];
  if (!fixture) throw new Error("Local upload fixture missing");
  sql(fixture);
  sql(readFileSync("docs/release-candidates/mixed-upload-migration.sql", "utf8"));
  sql(`CREATE TABLE lender_members(user_id uuid,lender_org_id uuid);
    CREATE TABLE property_intel(address_line1 text,zip text,avm jsonb,detail jsonb);
    CREATE TABLE batchdata_reverse_lookups(id uuid DEFAULT gen_random_uuid(),org_id uuid,requested_by uuid,input_phone text,input_email text,status text,estimated_cost_cents int,created_at timestamptz DEFAULT now());`);
  sql(readFileSync("docs/release-candidates/upload-reverse-migration.sql", "utf8"));
  sql(`INSERT INTO lender_orgs(id,org_type,profile_allowance) VALUES('${org}','agent',0);
    INSERT INTO lender_portfolios VALUES('${book}','${org}','${actor}'); INSERT INTO lender_members VALUES('${actor}','${org}');
    INSERT INTO contact_import_batches(id,book_id,created_by,upload_flow,total_rows) VALUES('${batch}','${book}','${actor}','mixed',1);
    INSERT INTO upload_staged_rows(id,batch_id,book_id,row_number,outcome,payload) VALUES('${row}','${batch}','${book}',1,'contact_only','{"name":"Ana Ruiz","phone":"6784441234"}');`);
});
it("reserves 30 cents before IO and refuses a 10-cent ceiling", () => {
  expect(fails(() => reserve(row, "6784441234", 10))).toBe(true);
  const r = reserve(); expect(r.dispatchIds).toHaveLength(1); expect(r.maxCostCents).toBe(30);
  expect(sql("SELECT status FROM upload_reverse_searches")).toBe("reserved");
});
it("repeated clicks, equivalent normalized inputs and another staged row cannot reserve again", () => {
  expect(reserve().dispatchIds).toEqual([]);
  sql(`INSERT INTO upload_staged_rows(id,batch_id,book_id,row_number,outcome) VALUES('${U(6)}','${batch}','${book}',2,'contact_only')`);
  expect(reserve(U(6)).dispatchIds).toEqual([]);
  expect(sql("SELECT count(*) FROM upload_reverse_searches")).toBe("1");
});
it("another account cannot reserve or confirm", () => {
  expect(fails(() => reserve(row, "6784441234", 30, U(99)))).toBe(true);
  expect(fails(() => sql(`SELECT confirm_upload_reverse_property('${U(99)}','${U(99)}')`))).toBe(true);
});
it("a prior Test Lab result blocks paid replay including uncertain outcomes", () => {
  sql(`INSERT INTO batchdata_reverse_lookups(org_id,input_phone,status,estimated_cost_cents) VALUES('${org}','6784449999','provider_error',0)`);
  expect(fails(() => reserve(U(6), "6784449999"))).toBe(true);
});
it("agent without capacity preserves confirmed match; no home, release or reward", () => {
  sql(`INSERT INTO upload_reverse_properties(id,search_id,person_index,property_key,payload)
    SELECT '${U(7)}',id,0,'12oak|30518','{"name":"Ana Ruiz","address":"12 Oak St","zip":"30518","city":"Buford","state":"GA","address_key":"12oak|30518"}' FROM upload_reverse_searches WHERE staged_id='${row}';
    UPDATE upload_reverse_searches SET status='matched' WHERE staged_id='${row}';`);
  expect(JSON.parse(sql(`SELECT confirm_upload_reverse_property('${U(7)}','${actor}')`)).status).toBe("waiting_capacity");
  expect(sql("SELECT count(*) FROM lender_portfolio_clients")).toBe("0");
  expect(sql("SELECT count(*) FROM enrichment_release_grants")).toBe("0");
  expect(sql("SELECT count(*) FROM agent_credit_ledger")).toBe("0");
});
it("lender with capacity reuses saved record, holds enrichment, and repeat confirmation adds nothing", () => {
  sql(`UPDATE lender_orgs SET org_type='lender',profile_allowance=1 WHERE id='${org}'; INSERT INTO property_intel VALUES('12 Oak St','30518','{}',null)`);
  expect(JSON.parse(sql(`SELECT confirm_upload_reverse_property('${U(7)}','${actor}')`))).toEqual({ status: "added", cached: true });
  expect(JSON.parse(sql(`SELECT confirm_upload_reverse_property('${U(7)}','${actor}')`)).status).toBe("added");
  expect(sql("SELECT count(*) FROM lender_portfolio_clients")).toBe("1");
  expect(sql("SELECT count(*) FROM enrichment_intake_holds WHERE released_at IS NULL")).toBe("1");
  expect(sql("SELECT count(*) FROM property_enrichment_queue")).toBe("0");
  expect(sql("SELECT count(*) FROM enrichment_release_grants")).toBe("0");
  expect(sql("SELECT total_rows FROM contact_import_batches")).toBe("1");
});
it("same confirmed property cannot duplicate an existing book home", () => {
  sql(`INSERT INTO upload_reverse_properties(id,search_id,person_index,property_key,payload)
    SELECT '${U(8)}',id,1,'alternative-key','{"address_key":"12oak|30518"}' FROM upload_reverse_searches`);
  expect(JSON.parse(sql(`SELECT confirm_upload_reverse_property('${U(8)}','${actor}')`)).status).toBe("already_in_book");
  expect(sql("SELECT count(*) FROM lender_portfolio_clients")).toBe("1");
});
it("saved-record release gets zero paid allowance; reverse approval released nothing", () => {
  const r = JSON.parse(sql(`SELECT approve_upload_spend('${batch}','${actor}',0,0)`));
  expect(r).toMatchObject({ cached_reuse: 1, paid_lookups: 0, max_cost_cents: 0 });
  expect(sql(`SELECT max_dispatches FROM enrichment_release_grants WHERE id='${r.cached_grant_id}'`)).toBe("0");
});

it("two concurrent approvals reserve just one paid search", async () => {
  sql(`INSERT INTO upload_staged_rows(id,batch_id,book_id,row_number,outcome) VALUES('${U(20)}','${batch}','${book}',20,'contact_only')`);
  const q = `SELECT reserve_upload_reverse('${batch}','${actor}','[{"stagedId":"${U(20)}","phone":"6784442222"}]',1,30,1000)`;
  const run = promisify(execFile);
  const results = await Promise.all([run("psql",[...args,"-d","reverse_upload","-c",q]),run("psql",[...args,"-d","reverse_upload","-c",q])]);
  expect(results.map((r) => JSON.parse(r.stdout.trim()).dispatchIds.length).sort()).toEqual([0,1]);
  expect(sql("SELECT count(*) FROM upload_reverse_searches WHERE input_phone='6784442222'")).toBe("1");
});

it("concurrent confirmation of the same book address adds at most one home", async () => {
  sql(`UPDATE lender_orgs SET profile_allowance=4 WHERE id='${org}';
    UPDATE upload_reverse_searches SET status='matched' WHERE input_phone='6784442222';
    INSERT INTO upload_reverse_properties(id,search_id,person_index,property_key,payload)
      SELECT '${U(21)}',id,0,'new-1','{"name":"Ana","address":"9 Elm Ln","zip":"30518","address_key":"9elm|30518"}' FROM upload_reverse_searches WHERE input_phone='6784442222';
    INSERT INTO upload_reverse_properties(id,search_id,person_index,property_key,payload)
      SELECT '${U(22)}',id,1,'new-2','{"name":"Ana","address":"9 Elm Ln","zip":"30518","address_key":"9elm|30518"}' FROM upload_reverse_searches WHERE input_phone='6784442222';`);
  const run = promisify(execFile);
  const results = await Promise.all([21,22].map((n) => run("psql",[...args,"-d","reverse_upload","-c",`SELECT confirm_upload_reverse_property('${U(n)}','${actor}')`])));
  expect(results.map((r) => JSON.parse(r.stdout.trim()).status).sort()).toEqual(["added","already_in_book"]);
  expect(sql("SELECT count(*) FROM lender_portfolio_clients WHERE address_key='9elm|30518'")).toBe("1");
});

it("local authenticated RLS permits owner reads only and forbids direct write/RPC", () => {
  sql(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT SELECT ON lender_portfolios TO authenticated;`);
  const read = (u: string) => sql(`SET ROLE authenticated; SET test.actor='${u}'; SELECT count(*) FROM upload_reverse_searches`);
  expect(Number(read(actor))).toBe(2);
  expect(Number(read(U(99)))).toBe(0);
  expect(fails(() => sql(`SET ROLE authenticated; INSERT INTO upload_reverse_searches(batch_id,staged_id,book_id,requested_by) VALUES('${batch}','${row}','${book}','${actor}')`))).toBe(true);
  expect(fails(() => sql(`SET ROLE authenticated; SELECT confirm_upload_reverse_property('${U(21)}','${actor}')`))).toBe(true);
});
it("an upload search in another workspace book, or a Test Lab search by the same person elsewhere, blocks paid replay", () => {
  sql(`INSERT INTO lender_portfolios VALUES('${U(40)}','${org}','${U(41)}'); INSERT INTO lender_members VALUES('${U(41)}','${org}');
    INSERT INTO contact_import_batches(id,book_id,created_by,upload_flow,total_rows) VALUES('${U(42)}','${U(40)}','${U(41)}','mixed',1);
    INSERT INTO upload_staged_rows(id,batch_id,book_id,row_number,outcome) VALUES('${U(43)}','${U(42)}','${U(40)}',1,'contact_only');
    INSERT INTO upload_reverse_searches(batch_id,staged_id,book_id,requested_by,input_phone,status) VALUES('${U(42)}','${U(43)}','${U(40)}','${U(41)}','6784447777','no_match');
    INSERT INTO batchdata_reverse_lookups(org_id,requested_by,input_phone,status,estimated_cost_cents) VALUES('${U(98)}','${actor}','6784448888','matched',10);`);
  sql(`INSERT INTO upload_staged_rows(id,batch_id,book_id,row_number,outcome) VALUES('${U(44)}','${batch}','${book}',3,'contact_only')`);
  expect(fails(() => reserve(U(44), "6784447777"))).toBe(true);
  expect(fails(() => reserve(U(44), "6784448888"))).toBe(true);
  expect(sql(`SELECT count(*) FROM upload_reverse_searches WHERE staged_id='${U(44)}'`)).toBe("0");
});
it("an uncertain upload result cannot be confirmed", () => {
  sql(`INSERT INTO upload_reverse_properties(id,search_id,person_index,property_key,payload)
    SELECT '${U(45)}',id,0,'9x|30518','{"address":"9 X St","zip":"30518","address_key":"9x|30518"}' FROM upload_reverse_searches WHERE staged_id='${U(43)}';
    UPDATE upload_reverse_searches SET status='provider_error' WHERE staged_id='${U(43)}';`);
  expect(fails(() => sql(`SELECT confirm_upload_reverse_property('${U(45)}','${U(41)}')`))).toBe(true);
});
