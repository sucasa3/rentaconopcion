import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { addressKey as legacyKey } from "../agent-discovery";
import { addressKey, parseUploadCsv, planUpload, stagePayload, type UploadRole } from "../upload-intake";

// Disposable loopback-only PostgreSQL (docs/release-candidates/run-focused-worker-tests.sh),
// own throwaway database "mixed"; never a hosted database.
const base = ["-h", "/tmp/worker-local-pg/socket", "-p", "55439", "-U", "local_worker", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"];
const sql = (q: string, db = "mixed") => execFileSync("psql", [...base, "-d", db, "-c", q], { encoding: "utf8" }).trim();
const fails = (q: string) => { try { sql(q); return ""; } catch (e: any) { return String(e.stderr ?? e.message); } };
const U = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const AGENT_ORG = U(1), AGENT_BOOK = U(2), AGENT = U(3), LENDER_ORG = U(4), LENDER_BOOK = U(5), LO = U(6), OTHER = U(7);

const CSV = `full_name,address,city,state,zip,email,phone,loan_balance,interest_rate
Ana Ruiz,12 Oak Street,Buford,GA,30518,ana@example.invalid,,250000,6.75
Ben Cole,40 Pine Rd,Buford,GA,30518,,,,
Cara Diaz,,,,,cara@example.invalid,,,
Dan Eto,,,,,,6785550101,,
Eve Fox,,,,,,,,
Ana Ruiz,12 Oak St.,Buford,GA,30518,,,,
Gil Hart,9 Elm Ln,Gainesville,GA,30504,,,,
Ivy Jo,77 Ash Ct,Gainesville,GA,30504,,,,
`;

const FIXTURE = `
DO $$ BEGIN
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE SCHEMA private; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE TABLE lender_orgs(id uuid PRIMARY KEY, org_type text, profile_allowance int, is_test_account boolean DEFAULT false);
CREATE TABLE lender_portfolios(id uuid PRIMARY KEY, lender_org_id uuid, assigned_user_id uuid);
CREATE TABLE lender_portfolio_clients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), portfolio_id uuid, homeowner_id uuid,
  client_name text, client_email text, client_phone text, address_line1 text, city text, state text, zip text,
  address_key text, loan_amount_at_close_cents bigint, rate_at_close numeric, archived_at timestamptz);
CREATE TABLE agent_credit_ledger(org_id uuid, delta int);
CREATE FUNCTION private.agent_credit_remaining(_o uuid) RETURNS int LANGUAGE sql AS $$ SELECT coalesce(sum(delta),0)::int FROM agent_credit_ledger WHERE org_id=_o $$;
CREATE FUNCTION org_profile_capacity(_o uuid) RETURNS int LANGUAGE sql AS $$ SELECT profile_allowance FROM lender_orgs WHERE id=_o $$;
CREATE FUNCTION org_active_profile_count(_o uuid) RETURNS int LANGUAGE sql AS $$
  SELECT count(*)::int FROM lender_portfolio_clients c JOIN lender_portfolios p ON p.id=c.portfolio_id WHERE p.lender_org_id=_o AND c.archived_at IS NULL $$;
CREATE FUNCTION lender_book_visible(_u uuid, _o uuid, _a uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT _u=_a $$;
CREATE TABLE contact_import_batches(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), book_id uuid, created_by uuid, file_sha256 text,
  total_rows int, counts jsonb, enrichment_hold boolean, created_at timestamptz DEFAULT now());
CREATE TABLE enrichment_intake_holds(client_id uuid PRIMARY KEY, batch_id uuid, held_at timestamptz DEFAULT now(), released_at timestamptz, released_by uuid);
CREATE TABLE property_enrichment_queue(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), portfolio_client_id uuid UNIQUE, portfolio_id uuid, priority int);
CREATE TABLE enrichment_release_grants(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), portfolio_id uuid, job_ids uuid[], max_dispatches int,
  approved_by text, approval_note text, created_at timestamptz DEFAULT clock_timestamp(), expires_at timestamptz, revoked_at timestamptz);
-- Exact production trigger body.
CREATE FUNCTION tg_enqueue_property_enrichment() RETURNS trigger LANGUAGE plpgsql AS $f$
DECLARE _hold text := current_setting('sucasa.intake_hold', true);
BEGIN
  IF NEW.address_line1 IS NULL OR btrim(NEW.address_line1) = '' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM lender_portfolios p JOIN lender_orgs o ON o.id = p.lender_org_id
             WHERE p.id = NEW.portfolio_id AND o.is_test_account) THEN RETURN NEW; END IF;
  IF _hold IS NOT NULL AND _hold <> '' THEN
    INSERT INTO enrichment_intake_holds (client_id, batch_id) VALUES (NEW.id, _hold::uuid) ON CONFLICT (client_id) DO NOTHING;
    RETURN NEW;
  END IF;
  INSERT INTO property_enrichment_queue (portfolio_client_id, portfolio_id, priority)
  VALUES (NEW.id, NEW.portfolio_id, 50) ON CONFLICT (portfolio_client_id) DO NOTHING;
  RETURN NEW;
END $f$;
-- Production spend rule (simplified): each agent-book insert spends one credit.
CREATE FUNCTION tg_spend() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN INSERT INTO agent_credit_ledger SELECT p.lender_org_id, -1 FROM lender_portfolios p JOIN lender_orgs o ON o.id=p.lender_org_id
  WHERE p.id=NEW.portfolio_id AND o.org_type='agent'; RETURN NEW; END $f$;
CREATE TRIGGER trg_spend AFTER INSERT ON lender_portfolio_clients FOR EACH ROW EXECUTE FUNCTION tg_spend();
CREATE TRIGGER trg_enqueue AFTER INSERT ON lender_portfolio_clients FOR EACH ROW EXECUTE FUNCTION tg_enqueue_property_enrichment();
`;

const cached = new Set([addressKey({ address: "12 Oak St", zip: "30518", city: null, state: null })!]);
function stage(role: UploadRole, book: string, actor: string, csv = CSV, sha = "file-1") {
  const { rows } = parseUploadCsv(csv);
  const plan = planUpload({ role, rows, existingKeys: new Set(), cachedAddressKeys: cached,
    capacityRemaining: 1e9, approvedLookups: 0, lookupCostCents: 10 });
  const payload = JSON.stringify(stagePayload(plan, rows, (r) => legacyKey(r as any))).replace(/'/g, "''");
  return JSON.parse(sql(`SELECT stage_mixed_upload('${book}','${actor}','${sha}','${role}','${payload}'::jsonb)`));
}
const count = (q: string) => Number(sql(q));

beforeAll(() => {
  sql("DROP DATABASE IF EXISTS mixed", "postgres");
  sql("CREATE DATABASE mixed", "postgres");
  sql(FIXTURE);
  sql(readFileSync("docs/release-candidates/mixed-upload-migration.sql", "utf8"));
  sql(`INSERT INTO lender_orgs VALUES ('${AGENT_ORG}','agent',0,false),('${LENDER_ORG}','lender',2,false);
       INSERT INTO lender_portfolios VALUES ('${AGENT_BOOK}','${AGENT_ORG}','${AGENT}'),('${LENDER_BOOK}','${LENDER_ORG}','${LO}');
       INSERT INTO agent_credit_ledger VALUES ('${AGENT_ORG}', 2);`);
});

for (const [role, book, actor] of [["agent", AGENT_BOOK, AGENT], ["lender", LENDER_BOOK, LO]] as const) {
  describe(`${role} mixed upload (local database)`, () => {
    it("stores an outcome for every row and enforces real capacity", () => {
      const r = stage(role, book, actor);
      expect(r.counts).toEqual({ added_cached: 1, added_needs_lookup: 1, contact_only: 2, unusable: 1, duplicate_in_file: 1, waiting_capacity: 2 });
      expect(count(`SELECT count(*) FROM upload_staged_rows WHERE batch_id='${r.batch_id}'`)).toBe(8);
      expect(count(`SELECT count(*) FROM lender_portfolio_clients WHERE portfolio_id='${book}'`)).toBe(2);
    });
    it("holds every added home — nothing queued before approval", () => {
      expect(count(`SELECT count(*) FROM property_enrichment_queue WHERE portfolio_id='${book}'`)).toBe(0);
      expect(count(`SELECT count(*) FROM enrichment_intake_holds h JOIN lender_portfolio_clients c ON c.id=h.client_id WHERE c.portfolio_id='${book}' AND released_at IS NULL`)).toBe(2);
    });
    it("re-uploading the same file changes nothing", () => {
      const r = stage(role, book, actor);
      expect(r.replayed).toBe(true);
      expect(count(`SELECT count(*) FROM upload_staged_rows WHERE book_id='${book}'`)).toBe(8);
    });
    it("a different file with the same people adds no duplicates", () => {
      const r = stage(role, book, actor, CSV + "Zed Q,1 New Way,Buford,GA,30518,,,,\n", "file-2");
      expect(r.counts.already_uploaded).toBe(6);
      expect(count(`SELECT count(*) FROM lender_portfolio_clients WHERE portfolio_id='${book}'`)).toBe(2);
    });
    it("only the book owner can upload or approve", () => {
      expect(fails(`SELECT stage_mixed_upload('${book}','${OTHER}','x','${role}','[]'::jsonb)`)).toMatch(/own book/);
      const b = sql(`SELECT batch_id FROM upload_staged_rows WHERE book_id='${book}' LIMIT 1`);
      expect(fails(`SELECT approve_upload_spend('${b}','${OTHER}',1,10)`)).toMatch(/Not allowed/);
    });
    it("approval of 0 paid lookups releases only the saved-record home", () => {
      const b = sql(`SELECT batch_id FROM upload_staged_rows WHERE book_id='${book}' AND row_number=1 AND outcome='added_cached'`);
      const r = JSON.parse(sql(`SELECT approve_upload_spend('${b}','${actor}',0,0)`));
      expect(r).toMatchObject({ released: 1, paid_lookups: 0, cached_reuse: 1, grant_id: null });
      // Saved-record reuse gets a zero-dispatch grant: it can never trigger or use a paid lookup.
      const g = sql(`SELECT max_dispatches || '|' || cardinality(job_ids) FROM enrichment_release_grants WHERE id='${r.cached_grant_id}'`);
      expect(g).toBe("0|1");
    });
    it("approval of 1 paid lookup releases exactly one more, then nothing", () => {
      const b = sql(`SELECT batch_id FROM upload_staged_rows WHERE book_id='${book}' AND row_number=1 AND outcome='added_cached'`);
      expect(fails(`SELECT approve_upload_spend('${b}','${actor}',1,9)`)).toMatch(/spending limit/);
      const r = JSON.parse(sql(`SELECT approve_upload_spend('${b}','${actor}',1,10)`));
      expect(r).toMatchObject({ released: 1, paid_lookups: 1, cached_reuse: 0, max_cost_cents: 10 });
      expect(sql(`SELECT max_dispatches FROM enrichment_release_grants WHERE id='${r.grant_id}'`)).toBe("1");
      expect(JSON.parse(sql(`SELECT approve_upload_spend('${b}','${actor}',5,50)`))).toMatchObject({ released: 0, grant_id: null });
      expect(count(`SELECT spend_approved_lookups FROM contact_import_batches WHERE id='${b}'`)).toBe(1);
    });
  });
}

it("lender loan details carry into the lender book only", () => {
  expect(sql(`SELECT loan_amount_at_close_cents || '|' || rate_at_close::float FROM lender_portfolio_clients WHERE portfolio_id='${LENDER_BOOK}' AND client_email='ana@example.invalid'`)).toBe("25000000|6.75");
  expect(sql(`SELECT coalesce(loan_amount_at_close_cents::text,'none') FROM lender_portfolio_clients WHERE portfolio_id='${AGENT_BOOK}' AND client_email='ana@example.invalid'`)).toBe("none");
});
