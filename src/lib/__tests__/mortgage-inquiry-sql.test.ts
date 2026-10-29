import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

// Explicit disposable loopback fixture; never reads managed connection variables.
const args = ["-h", "/tmp/worker-local-pg/socket", "-p", "55439", "-U", "local_worker", "-d", "postgres", "-X", "-At", "-v", "ON_ERROR_STOP=1"];
const sql = (query: string) => execFileSync("psql", [...args, "-c", query], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const H = "00000000-0000-4000-8000-000000000001";
const A = "00000000-0000-4000-8000-000000000002";
const O = "00000000-0000-4000-8000-000000000003";
const LO = "00000000-0000-4000-8000-000000000004";
const D = "00000000-0000-4000-8000-000000000005";
const AB = "00000000-0000-4000-8000-000000000006";
const LB = "00000000-0000-4000-8000-000000000007";
function request(optional = false) {
  return JSON.parse(sql(`SELECT record_homeowner_lending_inquiry('${H}','${D}','email','home@example.invalid',null,${optional},' {"estimated_value":350000,"estimated_equity":150000}'::jsonb,'lending-contact-v2','Specific test consent')`));
}
function seed(capacity = 10) {
  sql(`TRUNCATE homeowner_lending_requests, consent_records, lender_activity, opportunity_outcomes, homeowner_opportunities, contact_import_batches, enrichment_intake_holds, property_enrichment_queue, agent_lending_designations, agent_lender_connections, lender_members, lender_portfolio_clients, lender_portfolios, lender_orgs, profiles, sponsored_agent_seats;
    INSERT INTO profiles VALUES ('${H}','Test Homeowner','12 Test Lane','Austin','TX','78701');
    INSERT INTO lender_orgs VALUES ('${A}','agent',100,0),('${O}','lender',${capacity},0);
    INSERT INTO lender_portfolios VALUES ('${AB}','${A}','${LO}',now()),('${LB}','${O}','${LO}',now());
    INSERT INTO lender_members VALUES ('${O}','${LO}');
    INSERT INTO lender_portfolio_clients(portfolio_id,homeowner_id,archived_at) VALUES ('${AB}','${H}',null);
    INSERT INTO agent_lender_connections VALUES ('${D}','${A}','${O}','connected');
    INSERT INTO agent_lending_designations(id,agent_org_id,connection_id,lender_org_id,lo_user_id,designated_by) VALUES ('${D}','${A}','${D}','${O}','${LO}','${LO}');`);
}
beforeAll(() => {
  sql(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;
    DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$;
    CREATE TABLE profiles(id uuid PRIMARY KEY,full_name text,address text,city text,state text,zip text);
    CREATE TABLE lender_orgs(id uuid PRIMARY KEY,org_type text,profile_allowance integer,reserved_profiles integer);
    CREATE TABLE lender_members(lender_org_id uuid,user_id uuid);
    CREATE TABLE lender_portfolios(id uuid PRIMARY KEY,lender_org_id uuid,assigned_user_id uuid,created_at timestamptz);
    CREATE TABLE agent_lender_connections(id uuid PRIMARY KEY,agent_org_id uuid,lender_org_id uuid,status text);
    CREATE TABLE agent_lending_designations(id uuid PRIMARY KEY,agent_org_id uuid,connection_id uuid,lender_org_id uuid,lo_user_id uuid,designated_by uuid,removed_at timestamptz);
    CREATE TABLE lender_portfolio_clients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),portfolio_id uuid,homeowner_id uuid,client_name text,client_email text,client_phone text,address_line1 text,city text,state text,zip text,relationship_basis text,contact_marketing_permission text,intelligence_access_scope text[],archived_at timestamptz,archived_reason text,created_at timestamptz DEFAULT now());
    CREATE TABLE sponsored_agent_seats(sponsor_org_id uuid,credits_granted integer,status text);
    CREATE TABLE consent_records(id uuid DEFAULT gen_random_uuid(),homeowner_id uuid,recipient_org_id uuid,recipient_kind text,consent_type text,scope text[],source text,disclosure_version text,context jsonb);
    CREATE TABLE contact_import_batches(id uuid DEFAULT gen_random_uuid(),book_id uuid,created_by uuid,file_sha256 text,total_rows integer);
    CREATE TABLE enrichment_intake_holds(client_id uuid PRIMARY KEY,batch_id uuid);
    CREATE TABLE property_enrichment_queue(portfolio_client_id uuid);
    CREATE TABLE homeowner_opportunities(id uuid DEFAULT gen_random_uuid(),portfolio_client_id uuid,org_id uuid,category text,strength text,state text,signal_key text,reasons text[],reason_codes text[],score integer,computed_at timestamptz,UNIQUE(portfolio_client_id,category));
    CREATE TABLE homeowner_lending_requests(id uuid DEFAULT gen_random_uuid(),homeowner_id uuid,designation_id uuid,agent_org_id uuid,lender_org_id uuid,lo_user_id uuid,lender_client_id uuid,opportunity_id uuid,consent_record_id uuid,contact_name text,contact_email text,contact_phone text,preferred_channel text,shared_fields text[],disclosure_version text,status text DEFAULT 'open');
    CREATE UNIQUE INDEX inquiry_open ON homeowner_lending_requests(homeowner_id,lo_user_id) WHERE status='open';
    CREATE TABLE lender_activity(lender_org_id uuid,portfolio_client_id uuid,actor_user_id uuid,action text,detail text);
    CREATE TABLE opportunity_outcomes(org_id uuid,portfolio_client_id uuid,stage text);
    CREATE FUNCTION org_active_profile_count(o uuid) RETURNS integer LANGUAGE sql AS $$ SELECT count(*)::int FROM lender_portfolio_clients c JOIN lender_portfolios p ON p.id=c.portfolio_id WHERE p.lender_org_id=o AND c.archived_at IS NULL $$;
    CREATE FUNCTION org_profile_capacity(o uuid) RETURNS integer LANGUAGE sql AS $$ SELECT profile_allowance FROM lender_orgs WHERE id=o $$;
    CREATE FUNCTION hold_lookup() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF coalesce(current_setting('sucasa.intake_hold',true),'')<>'' THEN INSERT INTO enrichment_intake_holds VALUES(NEW.id,current_setting('sucasa.intake_hold')::uuid); ELSE INSERT INTO property_enrichment_queue VALUES(NEW.id); END IF; RETURN NEW; END $$;
    CREATE TRIGGER lookup AFTER INSERT ON lender_portfolio_clients FOR EACH ROW EXECUTE FUNCTION hold_lookup();`);
  sql(readFileSync("drizzle/migrations/0045_mortgage_inquiry_atomic_delivery.sql", "utf8"));
  sql(readFileSync("drizzle/migrations/0046_inquiry_capacity_pool_alignment.sql", "utf8"));
});
describe("atomic mortgage inquiry SQL on disposable PostgreSQL", () => {
  it("creates the chosen officer's prospect, opportunity and exact default scope with marketing off", () => {
    seed(); const r = request();
    expect(r.duplicate).toBe(false);
    expect(sql(`SELECT p.assigned_user_id||'|'||c.client_email||'|'||coalesce(c.client_phone,'none')||'|'||c.relationship_basis||'|'||c.contact_marketing_permission FROM homeowner_lending_requests r JOIN lender_portfolio_clients c ON c.id=r.lender_client_id JOIN lender_portfolios p ON p.id=c.portfolio_id WHERE r.id='${r.requestId}'`)).toBe(`${LO}|home@example.invalid|none|homeowner_requested|false`);
    expect(sql("SELECT scope::text||'|'||(context->>'source_path') FROM consent_records")).toBe("{name,contact,address}|/money");
    expect(sql("SELECT category||'|'||strength||'|'||state FROM homeowner_opportunities")).toBe("mortgage_review|strong|open");
    expect(sql("SELECT count(*) FROM homeowner_lending_requests WHERE shared_value_equity IS NOT NULL")).toBe("0");
  });
  it("full capacity preserves the inquiry without using an active profile slot", () => {
    seed(0); const r = request(); expect(r.capacityPending).toBe(true);
    expect(sql(`SELECT org_active_profile_count('${O}')`)).toBe("0");
    expect(sql("SELECT count(*) FROM homeowner_lending_requests WHERE lender_client_id IS NOT NULL AND opportunity_id IS NOT NULL")).toBe("1");
  });
  it("honors reserved capacity and sponsorship grace allocations", () => {
    seed(10); sql(`UPDATE lender_orgs SET reserved_profiles=7 WHERE id='${O}'; INSERT INTO sponsored_agent_seats VALUES('${O}',3,'grace')`);
    expect(request().capacityPending).toBe(true);
  });
  it("does not enqueue a paid lookup for the inbound prospect", () => {
    seed(); request();
    expect(sql("SELECT count(*) FROM property_enrichment_queue q JOIN homeowner_lending_requests r ON r.lender_client_id=q.portfolio_client_id")).toBe("0");
    expect(sql("SELECT count(*) FROM enrichment_intake_holds h JOIN homeowner_lending_requests r ON r.lender_client_id=h.client_id")).toBe("1");
  });
  it("blocks active duplicates without expanding their consent", () => {
    seed(); const first = request(); const second = request(true);
    expect(second.requestId).toBe(first.requestId); expect(second.duplicate).toBe(true);
    expect(sql("SELECT count(*) FROM consent_records")).toBe("1");
    expect(sql("SELECT shared_fields::text FROM homeowner_lending_requests")).toBe("{name,contact,address}");
  });
  it("allows another legitimate inquiry after resolution and saves optional equity only then", () => {
    seed(); const first = request();
    sql(`INSERT INTO opportunity_outcomes SELECT lender_org_id,lender_client_id,'not_interested' FROM homeowner_lending_requests`);
    const second = request(true); expect(second.requestId).not.toBe(first.requestId);
    expect(sql(`SELECT shared_fields::text||'|'||(shared_value_equity->>'estimated_equity') FROM homeowner_lending_requests WHERE id='${second.requestId}'`)).toBe("{name,contact,address,value_equity}|150000");
  });
  it("removed contact stops future sharing but preserves the historical request", () => {
    seed(); request(); sql("UPDATE agent_lending_designations SET removed_at=now()");
    expect(() => request()).toThrow(); expect(sql("SELECT count(*) FROM homeowner_lending_requests")).toBe("1");
  });
  it("a failed write rolls back consent and prospect creation", () => {
    seed(); sql("ALTER TABLE lender_activity ADD CONSTRAINT reject_fixture CHECK(action <> 'homeowner_conversation_request')");
    try { expect(() => request()).toThrow(); expect(sql("SELECT count(*) FROM consent_records")).toBe("0"); expect(sql(`SELECT org_active_profile_count('${O}')`)).toBe("0"); }
    finally { sql("ALTER TABLE lender_activity DROP CONSTRAINT reject_fixture"); }
  });
  it("browser roles cannot call the privileged intake function", () => {
    expect(sql("SELECT has_function_privilege('authenticated','record_homeowner_lending_inquiry(uuid,uuid,text,text,text,boolean,jsonb,text,text)','EXECUTE')")).toBe("f");
    expect(sql("SELECT has_function_privilege('anon','record_homeowner_lending_inquiry(uuid,uuid,text,text,text,boolean,jsonb,text,text)','EXECUTE')")).toBe("f");
  });
});