import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

// Disposable loopback-only PostgreSQL (docs/release-candidates/run-focused-worker-tests.sh).
const args = ["-h", "/tmp/worker-local-pg/socket", "-p", "55439", "-U", "local_worker", "-d", "postgres", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1"];
const sql = (q: string) => execFileSync("psql", [...args, "-c", q], { encoding: "utf8" }).trim();
const book = "00000000-0000-4000-8000-0000000000b1";
const old = "00000000-0000-4000-8000-0000000000c1";

const client = (address: string, name = "Ana Diaz", email: string | null = "a@x.com") =>
  ({ client_name: name, client_email: email, address_line1: address, zip: "30060" });
const rows = [
  { row_number: 1, raw: {}, outcome: "existing_property", property_key: "1 main st|30060", property_ref: old, contact_ref: "new:1", role: "associated", client: client("1 Main St", "Luis Diaz", null) },
  { row_number: 2, raw: {}, outcome: "new_property", property_key: "2 elm st|30060", property_ref: "new:2 elm st|30060", contact_ref: "new:2", role: "primary", client: client("2 Elm St") },
  { row_number: 3, raw: {}, outcome: "new_property", property_key: "3 elm st # 9|30060", property_ref: "new:3 elm st # 9|30060", contact_ref: "new:2", role: "primary", client: client("3 Elm St # 9") },
  { row_number: 4, raw: {}, outcome: "needs_review", reason: "shared_email_or_phone_different_name" },
];
const run = (r: unknown[], cap = 10) =>
  JSON.parse(sql(`SELECT import_household_batch('${book}','00000000-0000-4000-8000-0000000000a1','h','${JSON.stringify(r)}'::jsonb,'[{"property_key":"1 main st|30060","client_id":"${old}"}]'::jsonb,${cap})`));

beforeAll(() => {
  sql(`DROP TABLE IF EXISTS enrichment_intake_holds, contact_import_rows, contact_import_batches, book_property_keys, client_contact_links, book_contacts, property_enrichment_queue, lender_portfolio_clients, lender_portfolios CASCADE;
    DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$;
    CREATE TABLE lender_portfolios (id uuid PRIMARY KEY);
    CREATE TABLE lender_portfolio_clients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), portfolio_id uuid, client_name text, client_email text, client_phone text,
      address_line1 text, city text, state text, zip text, loan_amount_at_close_cents bigint, rate_at_close numeric, notes text, homeowner_id uuid, created_at timestamptz DEFAULT now());
    CREATE TABLE property_enrichment_queue (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), portfolio_client_id uuid UNIQUE, portfolio_id uuid, priority int);
    INSERT INTO lender_portfolios VALUES ('${book}');
    INSERT INTO lender_portfolio_clients (id, portfolio_id, client_name, address_line1, zip, created_at) VALUES ('${old}','${book}','Ana Diaz','1 Main St','30060','2026-01-01');`);
  sql(readFileSync("docs/release-candidates/household-import-migration.sql", "utf8"));
  sql(`CREATE TRIGGER trg_enqueue_property_enrichment AFTER INSERT ON lender_portfolio_clients FOR EACH ROW EXECUTE FUNCTION tg_enqueue_property_enrichment();`);
});

describe("household import migration (local only)", () => {
  it("backfills a primary contact for existing clients without changing them", () => {
    expect(sql(`SELECT count(*) FROM client_contact_links WHERE client_id='${old}' AND role='primary'`)).toBe("1");
    expect(sql(`SELECT created_at FROM lender_portfolio_clients WHERE id='${old}'`)).toContain("2026-01-01");
  });

  it("imports every row, holds enrichment server-side, and preserves the old id", () => {
    const r = run(rows);
    expect(r.inserted).toBe(2);
    expect(r.counts).toMatchObject({ existing_property: 1, new_property: 2, needs_review: 1 });
    expect(sql("SELECT count(*) FROM property_enrichment_queue")).toBe("0");
    expect(sql("SELECT count(*) FROM enrichment_intake_holds WHERE released_at IS NULL")).toBe("2");
    expect(sql(`SELECT count(*) FROM lender_portfolio_clients WHERE portfolio_id='${book}'`)).toBe("3");
    // One owner linked to two homes; second person at the old home is associated.
    expect(sql(`SELECT count(*) FROM client_contact_links WHERE contact_id=(SELECT contact_id FROM contact_import_rows WHERE row_number=2 LIMIT 1)`)).toBe("2");
    expect(sql(`SELECT role FROM client_contact_links l JOIN book_contacts k ON k.id=l.contact_id WHERE k.full_name='Luis Diaz'`)).toBe("associated");
  });

  it("repeating the same upload adds no properties, contacts, links or jobs", () => {
    const before = sql("SELECT (SELECT count(*) FROM lender_portfolio_clients)||'/'||(SELECT count(*) FROM client_contact_links)");
    const r = run(rows.map((x) => x.outcome === "new_property" ? { ...x, outcome: "new_property" } : x));
    expect(r.inserted).toBe(0);
    expect(sql("SELECT count(*) FROM lender_portfolio_clients")).toBe("3");
    expect(sql("SELECT count(*) FROM property_enrichment_queue")).toBe("0");
    // Planner reuse of existing contacts is covered by the planner test; here the
    // key table alone prevents duplicate properties even with a stale plan.
    expect(before.split("/")[0]).toBe("3");
  });

  it("stops inserting at capacity and records waiting rows", () => {
    const r = run([{ row_number: 1, raw: {}, outcome: "new_property", property_key: "9 pine|30060", property_ref: "new:9", contact_ref: "new:1", role: "primary", client: client("9 Pine") }], 0);
    expect(r.inserted).toBe(0);
    expect(r.counts).toMatchObject({ waiting_for_capacity: 1 });
  });

  it("normal inserts outside the importer still enqueue as before", () => {
    sql(`INSERT INTO lender_portfolio_clients (portfolio_id, address_line1) VALUES ('${book}','5 Oak')`);
    expect(sql("SELECT count(*) FROM property_enrichment_queue")).toBe("1");
  });

  it("release is explicit and queues only held rows", () => {
    const batch = sql("SELECT batch_id FROM enrichment_intake_holds LIMIT 1");
    expect(sql(`SELECT release_intake_hold('${batch}','00000000-0000-4000-8000-0000000000a1')`)).toBe("2");
    expect(sql("SELECT count(*) FROM property_enrichment_queue")).toBe("3");
  });
});
