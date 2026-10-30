import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { approveReverseUpload, reverseUploadSummary, confirmReverseUploadProperty } from "../upload-reverse.server";
import { approveMixedUploadSpend } from "../mixed-upload.server";

// Production server orchestration + real review RPCs against a disposable local DB.
// Every provider request is an injected in-process fixture; global fetch throws.
const args = ["-h", "/tmp/worker-local-pg/socket", "-p", "55439", "-U", "local_worker", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"];
const sql = (q: string, db = "reverse_flow") => execFileSync("psql", [...args, "-d", db, "-c", q], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const literal = (v: unknown): string => v === null || v === undefined ? "NULL" : typeof v === "number" || typeof v === "boolean" ? String(v) : `'${(typeof v === "string" ? v : JSON.stringify(v)).replace(/'/g, "''")}'`;
const U = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12,"0")}`;

/** Minimal Data API adapter for tests only. It runs SQL only on the explicit local socket. */
class LocalQuery {
  filters: string[] = []; selection = "*"; op = "select"; values: any; singleRow = false; orderBy = ""; maxRows = "";
  constructor(public table: string) {}
  select(fields = "*") { this.selection = fields; return this; }
  eq(k: string,v: unknown) { this.filters.push(`${k}=${literal(v)}`); return this; }
  is(k: string,v: unknown) { this.filters.push(`${k} IS ${literal(v)}`); return this; }
  in(k: string,vs: unknown[]) { this.filters.push(`${k} IN (${vs.map(literal).join(",")})`); return this; }
  or(s: string) { this.filters.push(`(${s.split(",").map((f) => { const [k,_op,...v]=f.split("."); return `${k}=${literal(v.join("."))}`; }).join(" OR ")})`); return this; }
  order(k: string) { this.orderBy = ` ORDER BY ${k}`; return this; }
  limit(n: number) { this.maxRows = ` LIMIT ${n}`; return this; }
  maybeSingle() { this.singleRow = true; return this; }
  single() { this.singleRow = true; return this; }
  update(v: any) { this.op = "update"; this.values = v; return this; }
  upsert(v: any[]) { this.op = "insert"; this.values = v; return this; }
  then(resolve: (v: any) => unknown) {
    try {
      const where = this.filters.length ? ` WHERE ${this.filters.join(" AND ")}` : "";
      let q = `SELECT ${this.selection} FROM ${this.table}${where}${this.orderBy}${this.maxRows}`;
      if (this.op === "update") q = `UPDATE ${this.table} SET ${Object.entries(this.values).map(([k,v]) => `${k}=${literal(v)}`).join(",")}${where} RETURNING ${this.selection}`;
      if (this.op === "insert") { const keys = Object.keys(this.values[0]); q = `INSERT INTO ${this.table}(${keys.join(",")}) VALUES ${this.values.map((v: any) => `(${keys.map((k) => literal(v[k])).join(",")})`).join(",")} ON CONFLICT DO NOTHING RETURNING *`; }
      const wrapper = this.op === "select" ? `SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM (${q}) t` : `WITH t AS (${q}) SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM t`;
      const data = JSON.parse(sql(wrapper));
      return Promise.resolve(resolve({ data: this.singleRow ? data[0] ?? null : data, error: null }));
    } catch (e) { return Promise.resolve(resolve({ data: null, error: { message: String(e) } })); }
  }
}
const admin = { from: (t: string) => new LocalQuery(t), rpc: async (name: string,p: Record<string,unknown>) => {
  try { return { data: JSON.parse(sql(`SELECT ${name}(${Object.entries(p).map(([k,v]) => `${k}=>${literal(v)}`).join(",")})`)), error: null }; }
  catch(e) { return { data: null, error: { message: String(e) } }; }
} };
function person(street: string, name = "Multi Owner") { return { name: { full: name }, propertyOwner: true,
  property: { address: { street, city: "Buford", state: "GA", zip: "30518", fullAddress: `${street}, Buford GA 30518` } },
  addresses: [{ fullAddress: "99 Mailing Rd" }] }; }
const fixture = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body));
  const phone = body.requests[0].phone;
  let persons: unknown[] = [];
  if (phone.endsWith("0001")) persons = [person("12 Oak St", "Matched Owner")];
  if (phone.endsWith("0003")) persons = [person("40 Pine Rd"),person("70 Elm Ln")];
  return new Response(JSON.stringify({ result: { data: [{ persons }] } }), { status: 200 });
});
beforeAll(() => {
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("External calls forbidden in $0 mock test"); }));
  sql("DROP DATABASE IF EXISTS reverse_flow","postgres"); sql("CREATE DATABASE reverse_flow","postgres");
  const source = readFileSync("src/lib/__tests__/mixed-upload-sql.test.ts","utf8");
  const fixtureSql = source.split("const FIXTURE = `")[1]?.split("`;\n")[0];
  if (!fixtureSql) throw new Error("Local fixture missing");
  sql(fixtureSql);
  sql(readFileSync("docs/release-candidates/mixed-upload-migration.sql","utf8"));
  sql(`CREATE TABLE lender_members(user_id uuid,lender_org_id uuid);
    CREATE TABLE property_intel(address_line1 text,zip text,avm jsonb,detail jsonb);
    CREATE TABLE batchdata_reverse_lookups(id uuid DEFAULT gen_random_uuid(),org_id uuid,requested_by uuid,input_phone text,input_email text,status text,estimated_cost_cents int,created_at timestamptz DEFAULT now());
    CREATE TABLE deletion_suppressions(email_hmac text,phone_hmac text,address_hmac text);`);
  sql(readFileSync("docs/release-candidates/upload-reverse-migration.sql","utf8"));
});

for (const [role, offset] of [["agent",100],["lender",200]] as const) {
  describe(`${role}: complete retained-contact $0 mock flow`, () => {
    const actor = U(offset), book = U(offset+1), org = U(offset+2), batch = U(offset+3);
    const ids = [U(offset+4),U(offset+5),U(offset+6)];
    const approve = () => approveReverseUpload({ admin, actor, batchId: batch, selectedIds: ids, maxLookups: 3, maxCostCents: 90, apiKey: "local-fixture-not-a-credential", monthCap: 1000, fetcher: fixture });
    it("retains 3 contacts without homes, capacity spend or searches", async () => {
      sql(`INSERT INTO lender_orgs(id,org_type,profile_allowance) VALUES('${org}','${role}',2);
        INSERT INTO lender_portfolios VALUES('${book}','${org}','${actor}'); INSERT INTO lender_members VALUES('${actor}','${org}');
        INSERT INTO contact_import_batches(id,book_id,created_by,upload_flow,total_rows,counts) VALUES('${batch}','${book}','${actor}','mixed',3,'{"contact_only":3}');`);
      for (let i=0;i<3;i++) sql(`INSERT INTO upload_staged_rows(id,batch_id,book_id,row_number,outcome,payload) VALUES('${ids[i]}','${batch}','${book}',${i+1},'contact_only',${literal({ name: ["Matched Owner","No Match","Multi Owner"][i],phone:`678${offset+200}000${i+1}`, email:i===2 ? `multi${role}@example.com`:null })})`);
      expect((await reverseUploadSummary(admin,actor,batch)).contacts.filter((c) => c.eligible)).toHaveLength(3);
      expect(sql(`SELECT count(*) FROM lender_portfolio_clients WHERE portfolio_id='${book}'`)).toBe("0");
      expect(sql(`SELECT count(*) FROM upload_reverse_searches WHERE batch_id='${batch}'`)).toBe("0");
    });
    it("approval reserves 90 cents, mock returns matched/no-match/multiple properties held for review", async () => {
      const r = await approve(); expect(r).toEqual({ sent:3,maxCostCents:90 });
      const summary = await reverseUploadSummary(admin,actor,batch);
      expect(summary.contacts.map((c) => c.search?.status)).toEqual(["matched","no_match","needs_review"]);
      expect(summary.contacts[2].search?.properties).toHaveLength(2);
      expect(summary.contacts[2].search?.properties.every((p: any) => p.status==="needs_review")).toBe(true);
      expect(summary.contacts[1].search?.estimatedCents).toBe(0);
      expect(sql(`SELECT count(*) FROM lender_portfolio_clients WHERE portfolio_id='${book}'`)).toBe("0");
      expect(sql(`SELECT count(*) FROM enrichment_release_grants WHERE portfolio_id='${book}'`)).toBe("0");
    });
    it("repeated approval dispatches no additional mock searches", async () => {
      const before = fixture.mock.calls.length;
      expect(await approve()).toEqual({ sent:0,maxCostCents:0 });
      expect(fixture.mock.calls.length).toBe(before);
    });
    it("confirmed property waits with zero agent capacity; lender adds with hold", async () => {
      const summary = await reverseUploadSummary(admin,actor,batch);
      const property = summary.contacts[0].search?.properties[0];
      expect(property).toBeDefined(); if (!property) throw new Error("Missing property");
      const r = await confirmReverseUploadProperty(admin,actor,property.id);
      expect(r.status).toBe(role==="agent"?"waiting_capacity":"added");
      if(role==="agent") { sql(`INSERT INTO agent_credit_ledger VALUES('${org}',2)`); expect((await confirmReverseUploadProperty(admin,actor,property.id)).status).toBe("added"); }
      expect(sql(`SELECT count(*) FROM enrichment_intake_holds h JOIN lender_portfolio_clients c ON c.id=h.client_id WHERE c.portfolio_id='${book}' AND released_at IS NULL`)).toBe("1");
      expect(sql(`SELECT count(*) FROM property_enrichment_queue WHERE portfolio_id='${book}'`)).toBe("0");
    });
    it("confirms two properties separately: one saved home added, other waits for capacity", async () => {
      sql("INSERT INTO property_intel VALUES('40 Pine Rd','30518','{}',null)");
      const summary = await reverseUploadSummary(admin,actor,batch);
      const properties = summary.contacts[2].search?.properties;
      expect(properties).toHaveLength(2); if(!properties) throw new Error("Missing properties");
      const pine = properties.find((p: any) => p.address.startsWith("40 Pine"));
      const elm = properties.find((p: any) => p.address.startsWith("70 Elm"));
      if(!pine || !elm) throw new Error("Missing distinct properties");
      expect(await confirmReverseUploadProperty(admin,actor,pine.id)).toEqual({ status:"added",cached:true });
      expect((await confirmReverseUploadProperty(admin,actor,elm.id)).status).toBe("waiting_capacity");
      expect((await confirmReverseUploadProperty(admin,actor,pine.id)).status).toBe("added");
      expect(sql(`SELECT count(*) FROM lender_portfolio_clients WHERE portfolio_id='${book}'`)).toBe("2");
      expect(sql(`SELECT total_rows FROM contact_import_batches WHERE id='${batch}'`)).toBe("3");
    });
    it("separate enrichment approval releases saved record free; paid home requires 10-cent approval", async () => {
      const saved = await approveMixedUploadSpend({ admin,batchId:batch,actorId:actor,maxLookups:0,maxCostCents:0 });
      expect(saved).toMatchObject({ paid_lookups:0,cached_reuse:1,max_cost_cents:0 });
      expect(sql(`SELECT max_dispatches FROM enrichment_release_grants WHERE id='${(saved as any).cached_grant_id}'`)).toBe("0");
      await expect(approveMixedUploadSpend({ admin,batchId:batch,actorId:actor,maxLookups:1,maxCostCents:9 })).rejects.toThrow();
      const paid = await approveMixedUploadSpend({ admin,batchId:batch,actorId:actor,maxLookups:1,maxCostCents:10 });
      expect(paid).toMatchObject({ paid_lookups:1,cached_reuse:0,max_cost_cents:10 });
      expect(sql(`SELECT cardinality(job_ids)||'|'||max_dispatches FROM enrichment_release_grants WHERE id='${paid.grant_id}'`)).toBe("1|1");
      expect(await approveMixedUploadSpend({ admin,batchId:batch,actorId:actor,maxLookups:1,maxCostCents:10 })).toMatchObject({ released:0 });
      // There is no worker in this fixture; release is demonstrated without any provider execution.
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    });
  });
}