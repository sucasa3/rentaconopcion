import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import { planHouseholdImport, type ImportSourceRow } from "../household-import";
import { addressKey } from "../agent-discovery";

// Disposable loopback-only PostgreSQL (docs/release-candidates/run-focused-worker-tests.sh).
// Uses its own throwaway database "hh"; never a hosted database.
const base = ["-h", "/tmp/worker-local-pg/socket", "-p", "55439", "-U", "local_worker", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"];
const args = [...base, "-d", "hh"];
const sql = (q: string) => execFileSync("psql", [...args, "-c", q], { encoding: "utf8" }).trim();
const sqlFails = (q: string) => { try { sql(q); return ""; } catch (e: any) { return String(e.stderr ?? e.message); } };
const run = promisify(execFile);

const U = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
// Org P: representative production-like book. Org C: concurrency. 
const ORG_P = U(0x100), BOOK_P = U(0x101), LO_P = U(0x102);
const ORG_C = U(0x200), BOOK_A = U(0x201), BOOK_B = U(0x202), OFF_A = U(0x203), OFF_B = U(0x204), MGR = U(0x205);

// Exact production bodies (from the sanitized compatibility reference) for
// capacity and visibility; plan_tiers lookup is the only simplified dependency.
const FIXTURE = `
DO $$ BEGIN
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$;
CREATE SCHEMA private; CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA public, private, auth TO authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
CREATE TYPE public.app_role AS ENUM ('admin','homeowner','pro','lender');
CREATE TABLE user_roles (user_id uuid, role app_role);
CREATE TABLE plan_tiers (key text PRIMARY KEY, team_enabled boolean);
CREATE TABLE lender_orgs (id uuid PRIMARY KEY, org_type text NOT NULL, plan_key text, profile_allowance int, is_test_account boolean DEFAULT false);
CREATE TABLE addon_products (key text PRIMARY KEY, kind text, unit_quantity int);
CREATE TABLE org_addons (org_id uuid, addon_key text, quantity int, status text);
CREATE TABLE lender_members (user_id uuid, lender_org_id uuid, role text);
CREATE TABLE lender_portfolios (id uuid PRIMARY KEY, lender_org_id uuid, assigned_user_id uuid, name text);
CREATE TABLE lender_portfolio_clients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), portfolio_id uuid REFERENCES lender_portfolios(id),
  homeowner_id uuid, client_name text, client_email text, client_phone text, address_line1 text, city text, state text, zip text,
  close_date date, loan_amount_at_close_cents bigint, rate_at_close numeric, term_months int, notes text, last_intel_refreshed_at timestamptz,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), archived_at timestamptz, archived_reason text,
  relationship_basis text, contact_marketing_permission text, intelligence_access_scope text, address_key text);
CREATE UNIQUE INDEX uniq_portfolio_client_address_key ON lender_portfolio_clients (portfolio_id, address_key) WHERE address_key IS NOT NULL AND archived_at IS NULL;
CREATE TABLE property_enrichment_queue (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), portfolio_client_id uuid UNIQUE REFERENCES lender_portfolio_clients(id) ON DELETE CASCADE,
  portfolio_id uuid, priority int, status text DEFAULT 'pending', attempts int DEFAULT 0);
CREATE TABLE property_intel (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), address_normalized text UNIQUE, payload jsonb, fetched_at timestamptz);
CREATE FUNCTION has_role(_user_id uuid, _role app_role) RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public' AS $f$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $f$;
CREATE FUNCTION private.is_lender_member(_user_id uuid, _org_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $f$ SELECT EXISTS (SELECT 1 FROM public.lender_members WHERE user_id = _user_id AND lender_org_id = _org_id) $f$;
CREATE FUNCTION private.agent_credit_remaining(_org_id uuid) RETURNS int LANGUAGE sql AS $f$ SELECT 1000 $f$;
CREATE FUNCTION is_lender_manager(_user_id uuid, _org_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT EXISTS (SELECT 1 FROM public.lender_members WHERE user_id = _user_id AND lender_org_id = _org_id AND role IN ('owner','admin','manager')) $f$;
CREATE FUNCTION lender_team_enabled(_org_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT COALESCE((SELECT pt.team_enabled FROM public.lender_orgs o JOIN public.plan_tiers pt ON pt.key = o.plan_key WHERE o.id = _org_id), false) $f$;
CREATE FUNCTION lender_book_visible(_user_id uuid, _org_id uuid, _assigned uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT CASE WHEN public.has_role(_user_id, 'admin') THEN true
    WHEN NOT private.is_lender_member(_user_id, _org_id) THEN false
    WHEN (SELECT org_type FROM public.lender_orgs WHERE id = _org_id) IS DISTINCT FROM 'lender' THEN true
    WHEN public.is_lender_manager(_user_id, _org_id) THEN true
    WHEN _assigned = _user_id THEN true
    WHEN _assigned IS NULL AND NOT public.lender_team_enabled(_org_id) THEN true
    ELSE false END $f$;
CREATE FUNCTION org_profile_capacity(_org_id uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT COALESCE(o.profile_allowance, 0) + COALESCE((SELECT sum(a.quantity * p.unit_quantity)::int FROM public.org_addons a
    JOIN public.addon_products p ON p.key = a.addon_key WHERE a.org_id = _org_id AND a.status = 'active' AND p.kind = 'profiles'), 0)
  FROM public.lender_orgs o WHERE o.id = _org_id $f$;
CREATE FUNCTION org_active_profile_count(_org_id uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT count(*)::int FROM public.lender_portfolio_clients c JOIN public.lender_portfolios p ON p.id = c.portfolio_id
  WHERE p.lender_org_id = _org_id AND c.archived_at IS NULL $f$;
-- Production policies on books (RLS) so read isolation is exercised for real.
ALTER TABLE lender_portfolios ENABLE ROW LEVEL SECURITY;
CREATE POLICY lender_portfolios_visible_select ON lender_portfolios FOR SELECT TO authenticated USING (lender_book_visible(auth.uid(), lender_org_id, assigned_user_id));
ALTER TABLE lender_portfolio_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY homeowner_book_visibility_select ON lender_portfolio_clients FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM lender_portfolios p WHERE p.id = portfolio_id AND lender_book_visible(auth.uid(), p.lender_org_id, p.assigned_user_id)));
GRANT SELECT ON lender_portfolios, lender_portfolio_clients TO authenticated;
`;
const PROD_ENQUEUE = `CREATE FUNCTION tg_enqueue_property_enrichment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  IF NEW.address_line1 IS NULL OR btrim(NEW.address_line1) = '' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM lender_portfolios p JOIN lender_orgs o ON o.id = p.lender_org_id WHERE p.id = NEW.portfolio_id AND o.is_test_account) THEN RETURN NEW; END IF;
  INSERT INTO public.property_enrichment_queue (portfolio_client_id, portfolio_id, priority)
  VALUES (NEW.id, NEW.portfolio_id, CASE WHEN NEW.homeowner_id IS NOT NULL THEN 10 ELSE 50 END) ON CONFLICT (portfolio_client_id) DO NOTHING;
  RETURN NEW; END; $f$;
CREATE TRIGGER trg_enqueue_property_enrichment AFTER INSERT ON lender_portfolio_clients FOR EACH ROW EXECUTE FUNCTION tg_enqueue_property_enrichment();`;

// ---- Representative 65-home book (62 with property records, 3 pending) ----
type Existing = { id: string; name: string; email: string | null; street: string; zip: string };
const existing: Existing[] = Array.from({ length: 65 }, (_, i) => ({
  id: U(0x1000 + i), name: `Owner ${i % 50}`, email: i < 50 ? `owner${i}@example.test` : null,
  // Clients 63 and 64 are one home typed twice: a genuine key collision.
  street: i === 64 ? "500 Pine Rd" : i === 63 ? "500  pine rd" : `${100 + i} Oak St${i % 13 === 0 ? ` Apt ${i}` : ""}`,
  zip: "30060",
}));
const keyOf = (street: string, zip: string) => addressKey({ address: street, zip, city: null, state: null });

// 130 source rows: 65 re-listings of existing homes + 65 new rows.
function sourceRows(): ImportSourceRow[] {
  const rows: ImportSourceRow[] = existing.map((e, i) => ({ rowNumber: i + 1, full_name: e.name, email: e.email, address: e.street, zip: e.zip }));
  let n = 66;
  const push = (r: Omit<ImportSourceRow, "rowNumber">) => rows.push({ rowNumber: n++, ...r });
  for (let i = 0; i < 30; i++) push({ full_name: `Owner ${i}`, email: `owner${i}@example.test`, address: `${900 + i} Second Home Ln`, zip: "30060" }); // same owner, another home
  for (let i = 0; i < 10; i++) push({ full_name: `Unit Owner ${i}`, email: `unit${i}@example.test`, address: `77 Tower Way # ${i + 1}`, zip: "30060" }); // separate units
  for (let i = 0; i < 10; i++) push({ full_name: `Partner ${i}`, email: `partner${i}@example.test`, address: existing[i].street, zip: "30060" }); // another person, existing home
  for (let i = 0; i < 5; i++) push({ full_name: `Owner ${i}`, email: `owner${i}@example.test`, address: `${900 + i} Second Home Ln`, zip: "30060" }); // exact duplicates in file
  for (let i = 0; i < 5; i++) push({ full_name: `Someone Else ${i}`, email: `owner${10 + i}@example.test`, address: `${700 + i} Shared Mail Ct`, zip: "30060" }); // shared email, different name
  for (let i = 0; i < 3; i++) push({ full_name: `No Address ${i}`, email: null, address: "", zip: "30060" }); // invalid
  for (let i = 0; i < 2; i++) push({ full_name: `Pine Buyer ${i}`, email: null, address: "500 Pine Rd", zip: "30060" }); // hits the collision
  return rows;
}

function readBook(book: string) {
  const clients = JSON.parse(sql(`SELECT coalesce(json_agg(json_build_object('id',id,'address_line1',address_line1,'city',city,'state',state,'zip',zip,'address_key',address_key)),'[]') FROM lender_portfolio_clients WHERE portfolio_id='${book}'`));
  const contacts = JSON.parse(sql(`SELECT coalesce(json_agg(json_build_object('id',k.id,'name',k.full_name,'email',k.email,'phone',k.phone,
    'clientIds',(SELECT coalesce(json_agg(l.client_id),'[]') FROM client_contact_links l WHERE l.contact_id=k.id))),'[]') FROM book_contacts k WHERE k.book_id='${book}'`));
  return { clients, contacts };
}
function payloadFor(rows: ImportSourceRow[], book: string, capacity: number) {
  const { clients, contacts } = readBook(book);
  const plan = planHouseholdImport({ rows, existingClients: clients, existingContacts: contacts, suppressedRowNumbers: new Set(), remainingCapacity: capacity });
  const by = new Map(rows.map((r) => [r.rowNumber, r]));
  const p = plan.rows.map((x) => {
    const r = by.get(x.rowNumber)!;
    return { row_number: x.rowNumber, raw: r, outcome: x.outcome, reason: x.reason, property_key: x.propertyKey, property_ref: x.propertyRef,
      contact_ref: x.contactRef, role: x.role, client: { client_name: r.full_name, client_email: r.email ?? null, address_line1: r.address, zip: r.zip } };
  });
  const keys = clients.filter((c: any) => c.address_line1?.trim()).map((c: any) => ({ property_key: c.address_key ?? keyOf(c.address_line1, c.zip), client_id: c.id }));
  return { plan, p, keys };
}
const q = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
const importCall = (book: string, actor: string, p: unknown, keys: unknown, cap: number) =>
  `SELECT import_household_batch('${book}','${actor}','sha',${q(p)},${q(keys)},${cap})`;
function importBook(book: string, actor: string, rows: ImportSourceRow[], cap = 1000) {
  const { plan, p, keys } = payloadFor(rows, book, cap);
  return { plan, result: JSON.parse(sql(importCall(book, actor, p, keys, cap))) };
}
const snapshot = () => ({
  clients: sql(`SELECT md5(string_agg(row_to_json(c)::text, '|' ORDER BY id)) FROM lender_portfolio_clients c WHERE id::text LIKE '00000000-0000-4000-8000-0000000010%'`),
  intel: sql(`SELECT md5(string_agg(row_to_json(i)::text, '|' ORDER BY address_normalized)) || ':' || count(*) FROM property_intel i`),
  queue: sql(`SELECT md5(string_agg(row_to_json(q)::text, '|' ORDER BY portfolio_client_id)) || ':' || count(*) FROM property_enrichment_queue q WHERE portfolio_id='${BOOK_P}' AND portfolio_client_id IN (SELECT id FROM lender_portfolio_clients WHERE id::text LIKE '00000000-0000-4000-8000-0000000010%')`),
});
const as = (user: string, query: string) =>
  execFileSync("psql", [...args, "-c", "SET ROLE authenticated", "-c", `SET request.jwt.claim.sub = '${user}'`, "-c", query], { encoding: "utf8" }).trim();

let before: ReturnType<typeof snapshot>;
let firstBatch = "";

beforeAll(() => {
  execFileSync("psql", [...base, "-d", "postgres", "-c", "DROP DATABASE IF EXISTS hh"]);
  execFileSync("psql", [...base, "-d", "postgres", "-c", "CREATE DATABASE hh"]);
  sql(FIXTURE);
  sql(PROD_ENQUEUE);
  sql(`INSERT INTO plan_tiers VALUES ('branch', true);
    INSERT INTO lender_orgs (id, org_type, plan_key, profile_allowance) VALUES ('${ORG_P}','lender','branch',1000), ('${ORG_C}','lender','branch',10);
    INSERT INTO lender_members VALUES ('${LO_P}','${ORG_P}','member'), ('${OFF_A}','${ORG_C}','member'), ('${OFF_B}','${ORG_C}','member'), ('${MGR}','${ORG_C}','manager');
    INSERT INTO lender_portfolios VALUES ('${BOOK_P}','${ORG_P}','${LO_P}','LO book'), ('${BOOK_A}','${ORG_C}','${OFF_A}','A'), ('${BOOK_B}','${ORG_C}','${OFF_B}','B');`);
  const values = existing.map((e, i) => `('${e.id}','${BOOK_P}','${e.name}',${e.email ? `'${e.email}'` : "NULL"},'${e.street}','30060',
    ${i % 3 === 0 ? 31500000 : "NULL"},'2025-0${(i % 9) + 1}-15','opted_in','household','2026-01-0${(i % 9) + 1}')`).join(",");
  sql(`INSERT INTO lender_portfolio_clients (id, portfolio_id, client_name, client_email, address_line1, zip, loan_amount_at_close_cents, close_date, contact_marketing_permission, intelligence_access_scope, created_at) VALUES ${values}`);
  // Existing queue history: 62 done, 3 pending. 62 property records.
  sql(`UPDATE property_enrichment_queue SET status = CASE WHEN portfolio_client_id IN ('${U(0x1000 + 10)}','${U(0x1000 + 20)}','${U(0x1000 + 30)}') THEN 'pending' ELSE 'done' END, attempts = 1`);
  sql(`INSERT INTO property_intel (address_normalized, payload, fetched_at)
    SELECT lower(address_line1)||'|30060', jsonb_build_object('avm', 400000 + row_number() over ()), '2026-02-01' FROM lender_portfolio_clients
    WHERE portfolio_id='${BOOK_P}' AND id NOT IN ('${U(0x1000 + 10)}','${U(0x1000 + 20)}','${U(0x1000 + 30)}')`);
  // Concurrency org: 2 existing homes per officer book -> 6 of 10 left.
  for (const b of [BOOK_A, BOOK_B]) sql(`INSERT INTO lender_portfolio_clients (portfolio_id, client_name, address_line1, zip) VALUES ('${b}','x','1 ${b.slice(-3)} Rd','30060'),('${b}','y','2 ${b.slice(-3)} Rd','30060')`);
  before = snapshot();
  sql(readFileSync("docs/release-candidates/household-import-migration.sql", "utf8"));
});

describe("household import v2 (local only)", () => {
  it("fixture is representative: 65 clients, 62 property records, 62 done + 3 pending", () => {
    expect(sql(`SELECT count(*) FROM lender_portfolio_clients WHERE portfolio_id='${BOOK_P}'`)).toBe("65");
    expect(before.intel.endsWith(":62")).toBe(true);
    expect(sql(`SELECT string_agg(status||'='||n, ',' ORDER BY status) FROM (SELECT status, count(*) n FROM property_enrichment_queue WHERE portfolio_id='${BOOK_P}' GROUP BY 1) s`)).toBe("done=62,pending=3");
  });

  it("migration backfills one primary contact per existing client and changes no existing row", () => {
    expect(sql(`SELECT count(*) FROM client_contact_links l JOIN book_contacts k ON k.id=l.contact_id WHERE k.source_client_id IS NOT NULL AND l.role='primary'`)).toBe("69");
    expect(snapshot()).toEqual(before);
  });

  it("130-row upload: every row gets one result; collisions go to review; existing records untouched", () => {
    const rows = sourceRows();
    expect(rows).toHaveLength(130);
    const { result } = importBook(BOOK_P, LO_P, rows);
    firstBatch = result.batch_id;
    expect(sql(`SELECT count(*) FROM contact_import_rows WHERE batch_id='${firstBatch}'`)).toBe("130");
    expect(result.counts).toEqual({
      existing_property: 63, // 65 listed minus the two typed copies of 500 Pine Rd
      new_property: 40, // 30 second homes + 10 separate units
      additional_contact: 10, // another person at an existing home (role associated, never co-borrower)
      exact_duplicate: 5,
      needs_review: 9, // 5 shared email + different name, 2 existing collision copies, 2 new rows at the collision
      invalid_address: 3,
    });
    expect(result.inserted).toBe(40);
    // One owner, two homes.
    expect(sql(`SELECT count(*) FROM client_contact_links l JOIN book_contacts k ON k.id=l.contact_id WHERE k.email='owner3@example.test'`)).toBe("2");
    expect(sql(`SELECT DISTINCT role FROM client_contact_links l JOIN book_contacts k ON k.id=l.contact_id WHERE k.full_name LIKE 'Partner %'`)).toBe("associated");
    expect(sql(`SELECT count(DISTINCT address_line1) FROM lender_portfolio_clients WHERE address_line1 LIKE '77 Tower Way%'`)).toBe("10");
    expect(snapshot()).toEqual(before);
  });

  it("new homes are held server-side: no queue rows, one hold each", () => {
    expect(sql(`SELECT count(*) FROM enrichment_intake_holds WHERE batch_id='${firstBatch}' AND released_at IS NULL`)).toBe("40");
    expect(sql(`SELECT count(*) FROM property_enrichment_queue q JOIN enrichment_intake_holds h ON h.client_id=q.portfolio_client_id`)).toBe("0");
  });

  it("re-uploading the same CSV adds no clients, contacts, links, holds or jobs", () => {
    const count = () => sql(`SELECT (SELECT count(*) FROM lender_portfolio_clients)||'/'||(SELECT count(*) FROM book_contacts)||'/'||(SELECT count(*) FROM client_contact_links)||'/'||(SELECT count(*) FROM enrichment_intake_holds)||'/'||(SELECT count(*) FROM property_enrichment_queue)`);
    const c0 = count();
    const { result } = importBook(BOOK_P, LO_P, sourceRows());
    expect(result.inserted).toBe(0);
    expect(result.counts.new_property ?? 0).toBe(0);
    expect(count()).toBe(c0);
    expect(snapshot()).toEqual(before);
  });

  it("a stale plan that matches a collided key is forced to review by the database", () => {
    const k = keyOf("500 Pine Rd", "30060");
    const r = JSON.parse(sql(importCall(BOOK_P, LO_P, [{ row_number: 1, raw: {}, outcome: "existing_property", property_key: k, property_ref: existing[64].id, contact_ref: "new:1", role: "associated", client: { client_name: "Z" } }],
      [{ property_key: k, client_id: existing[63].id }, { property_key: k, client_id: existing[64].id }], 10)));
    expect(r.counts).toEqual({ needs_review: 1 });
    expect(sql(`SELECT count(*) FROM book_property_keys WHERE property_key='${k}'`)).toBe("0");
  });

  it("every other enqueue path skips held homes, including with the feature off", () => {
    // Same statements the legacy "Enrich" button and Discovery use.
    sql(`INSERT INTO property_enrichment_queue (portfolio_client_id, portfolio_id, priority) SELECT id, portfolio_id, 10 FROM lender_portfolio_clients WHERE portfolio_id='${BOOK_P}' ON CONFLICT (portfolio_client_id) DO NOTHING`);
    sql(`UPDATE property_enrichment_queue SET status='pending', attempts=0 WHERE portfolio_id='${BOOK_P}' AND status IN ('failed','needs_review')`);
    expect(sql(`SELECT count(*) FROM property_enrichment_queue q JOIN enrichment_intake_holds h ON h.client_id=q.portfolio_client_id AND h.released_at IS NULL`)).toBe("0");
    // Ordinary inserts outside the importer still enqueue as before.
    sql(`INSERT INTO lender_portfolio_clients (portfolio_id, address_line1, zip) VALUES ('${BOOK_P}','1 Legacy Path','30060')`);
    expect(sql(`SELECT count(*) FROM property_enrichment_queue q JOIN lender_portfolio_clients c ON c.id=q.portfolio_client_id WHERE c.address_line1='1 Legacy Path'`)).toBe("1");
  });

  it("QA test accounts still never queue lookups (production rule kept)", () => {
    sql(`UPDATE lender_orgs SET is_test_account = true WHERE id='${ORG_P}'`);
    sql(`INSERT INTO lender_portfolio_clients (portfolio_id, address_line1, zip) VALUES ('${BOOK_P}','2 QA Path','30060')`);
    expect(sql(`SELECT count(*) FROM property_enrichment_queue q JOIN lender_portfolio_clients c ON c.id=q.portfolio_client_id WHERE c.address_line1='2 QA Path'`)).toBe("0");
    sql(`UPDATE lender_orgs SET is_test_account = false WHERE id='${ORG_P}'`);
  });

  it("two simultaneous imports into different books of one org never exceed remaining capacity", async () => {
    const mk = (book: string, actor: string, tag: string) => {
      const rows = Array.from({ length: 5 }, (_, i) => ({ rowNumber: i + 1, full_name: `${tag}${i}`, email: `${tag}${i}@example.test`, address: `${i + 1} ${tag} Ave`, zip: "30060" }));
      // Each officer's app-side estimate sees 6 free; only the DB lock prevents 10.
      const { p, keys } = payloadFor(rows, book, 6);
      return `BEGIN; ${importCall(book, actor, p, keys, 6)}; SELECT pg_sleep(1); COMMIT;`;
    };
    const a = mk(BOOK_A, OFF_A, "alpha"), b = mk(BOOK_B, OFF_B, "beta");
    await Promise.all([run("psql", [...args, "-c", a]), run("psql", [...args, "-c", b])]);
    expect(sql(`SELECT org_active_profile_count('${ORG_C}')`)).toBe("10");
    expect(sql(`SELECT sum((counts->>'new_property')::int) FROM contact_import_batches WHERE book_id IN ('${BOOK_A}','${BOOK_B}')`)).toBe("6");
    expect(sql(`SELECT count(*) FROM contact_import_rows r JOIN contact_import_batches b ON b.id=r.batch_id WHERE b.book_id IN ('${BOOK_A}','${BOOK_B}') AND r.outcome='waiting_for_capacity'`)).toBe("4");
    // Waiting rows keep their raw source for a later import.
    expect(sql(`SELECT count(*) FROM contact_import_rows WHERE outcome='waiting_for_capacity' AND raw ? 'address'`)).toBe("4");
  });

  it("an officer cannot import into another officer's book", () => {
    const err = sqlFails(importCall(BOOK_A, OFF_B, [], [], 5));
    expect(err).toContain("Uploads belong to your own personal book");
    expect(sqlFails(importCall(BOOK_A, MGR, [], [], 5))).toContain("Uploads belong to your own personal book");
  });

  it("an officer cannot read another officer's held homes, contacts or links", () => {
    expect(as(OFF_B, `SELECT count(*) FROM book_contacts WHERE book_id='${BOOK_A}'`)).toBe("0");
    expect(as(OFF_B, `SELECT count(*) FROM client_contact_links WHERE book_id='${BOOK_A}'`)).toBe("0");
    expect(as(OFF_B, `SELECT count(*) FROM enrichment_intake_holds h JOIN contact_import_batches b ON b.id=h.batch_id WHERE b.book_id='${BOOK_A}'`)).toBe("0");
    expect(Number(as(OFF_A, `SELECT count(*) FROM enrichment_intake_holds`))).toBeGreaterThan(0);
    expect(Number(as(MGR, `SELECT count(*) FROM book_contacts WHERE book_id='${BOOK_A}'`))).toBeGreaterThan(0);
  });

  it("nobody can link contacts or call the importer directly as a signed-in user", () => {
    expect(sqlFails(`SET ROLE authenticated; INSERT INTO client_contact_links (book_id, contact_id, client_id, role) SELECT book_id, contact_id, client_id, 'primary' FROM client_contact_links LIMIT 1`)).toContain("permission denied");
    expect(sqlFails(`SET ROLE authenticated; ${importCall(BOOK_A, OFF_A, [], [], 1)}`)).toContain("permission denied");
    expect(sqlFails(`SET ROLE authenticated; SELECT release_intake_hold('${firstBatch}','${LO_P}')`)).toContain("permission denied");
  });

  it("release is explicit, scoped by book visibility, and queues only the held homes", () => {
    const batchA = sql(`SELECT id FROM contact_import_batches WHERE book_id='${BOOK_A}' LIMIT 1`);
    expect(sqlFails(`SELECT release_intake_hold('${batchA}','${OFF_B}')`)).toContain("Not allowed to release");
    expect(sqlFails(`SELECT release_intake_hold('${firstBatch}','${MGR}')`)).toContain("Not allowed to release"); // different org
    const held = sql(`SELECT count(*) FROM enrichment_intake_holds WHERE batch_id='${batchA}' AND released_at IS NULL`);
    expect(sql(`SELECT release_intake_hold('${batchA}','${MGR}')`)).toBe(held); // branch manager may release
    expect(sql(`SELECT count(*) FROM property_enrichment_queue q JOIN enrichment_intake_holds h ON h.client_id=q.portfolio_client_id WHERE h.batch_id='${batchA}'`)).toBe(held);
    expect(sql(`SELECT release_intake_hold('${batchA}','${MGR}')`)).toBe("0"); // repeat is a no-op
    expect(sql(`SELECT count(*) FROM enrichment_intake_holds WHERE batch_id='${firstBatch}' AND released_at IS NULL`)).toBe("40");
  });

  it("final preservation check: all 65 client rows, 62 property records and their queue history unchanged", () => {
    expect(snapshot()).toEqual(before);
  });
});
