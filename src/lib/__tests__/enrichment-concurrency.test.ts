import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

// Explicit loopback-only PostgreSQL fixture; never uses project connection env.
const args = ['-h', '/tmp/worker-local-pg/socket', '-p', '55439', '-U', 'local_worker', '-d', 'postgres', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1'];
function sql(query: string) { return execFileSync('psql', [...args, '-c', query], { encoding: 'utf8' }).trim(); }
function asyncSql(query: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('psql', [...args, '-c', query]); let out = ''; let err = '';
    child.stdout.on('data', chunk => { out += chunk; }); child.stderr.on('data', chunk => { err += chunk; });
    child.on('error', reject); child.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error(err)));
  });
}
const client = '00000000-0000-4000-8000-000000000001';
const book = '00000000-0000-4000-8000-000000000002';
let id: string;
function seed() {
  sql('TRUNCATE property_enrichment_queue; TRUNCATE property_intel;');
  id = sql(`INSERT INTO property_enrichment_queue (portfolio_client_id,portfolio_id,attempts,last_result) VALUES ('${client}','${book}',3,'historical') RETURNING id`).split('\n')[0];
}
function claim() { return JSON.parse(sql('SELECT row_to_json(q) FROM claim_enrichment_jobs(1) q')); }
function write(token: string, patch = { status: 'done' }, clientPatch = {}) {
  return sql(`SELECT count(*) FROM write_enrichment_claim('${id}','${token}','${JSON.stringify(patch)}','${JSON.stringify(clientPatch)}')`);
}
beforeAll(() => {
  sql(`DROP TABLE IF EXISTS property_enrichment_queue, lender_portfolio_clients, lender_portfolios, property_intel, property_intel_misses CASCADE;
    DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$;
    CREATE TABLE lender_portfolio_clients (id uuid PRIMARY KEY, address_line1 text, city text, state text, zip text,
      portfolio_id uuid,
      archived_at timestamptz, homeowner_id uuid, last_intel_refreshed_at timestamptz,
      loan_amount_at_close_cents bigint, close_date date, term_months integer);
    CREATE TABLE lender_portfolios (id uuid PRIMARY KEY);
    INSERT INTO lender_portfolio_clients(id,address_line1,zip,portfolio_id) VALUES ('${client}','1 Synthetic St','30075','${book}');
    INSERT INTO lender_portfolios VALUES ('${book}');
    CREATE TABLE property_intel (id uuid DEFAULT gen_random_uuid(),address_normalized text UNIQUE,detail jsonb,source text);
    CREATE TABLE property_intel_misses(address_normalized text,endpoint text,reason text,UNIQUE(address_normalized,endpoint));`);
  const base = readFileSync('supabase/migrations/20260814035436_4128b985-20ca-4817-88ab-bdfa8785b652.sql','utf8');
  sql(base.slice(0, base.indexOf('GRANT SELECT')) + 'ALTER TABLE property_enrichment_queue ADD COLUMN address_normalized text, ADD COLUMN address_verified_at timestamptz;');
  const addr = readFileSync('supabase/migrations/20260814230943_b650b175-5d8a-40d9-a8b8-7cb813bf07d6.sql','utf8');
  sql(addr.slice(addr.indexOf('CREATE OR REPLACE FUNCTION public.tg_requeue'), addr.indexOf('-- 5.')));
  sql(readFileSync('docs/release-candidates/worker-concurrency-migration.sql','utf8'));
});
describe('actual review migration on disposable local PostgreSQL', () => {
  it('two overlapping transactions cannot claim the same job', async () => {
    seed();
    const first = asyncSql('BEGIN; SELECT row_to_json(q) FROM claim_enrichment_jobs(1) q; SELECT pg_sleep(0.6); COMMIT;');
    // Barrier: wait for the first transaction to hold the queue row, not a guessed sleep.
    for (let i=0; i<100; i++) {
      if (sql("SELECT count(*) FROM pg_stat_activity WHERE query LIKE 'BEGIN; SELECT row_to_json%' AND wait_event = 'PgSleep'") === '1') break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    expect(sql("SELECT count(*) FROM pg_stat_activity WHERE query LIKE 'BEGIN; SELECT row_to_json%' AND wait_event = 'PgSleep'")).toBe('1');
    expect(sql('SELECT count(*) FROM claim_enrichment_jobs(1)')).toBe('0');
    expect(await first).toContain(id);
    expect(sql('SELECT count(*) FROM claim_enrichment_jobs(1)')).toBe('0');
  });
  it('recovery rotates ownership without changing attempts/history and old completion cannot overwrite', () => {
    seed(); const old = claim();
    sql(`UPDATE property_enrichment_queue SET lease_expires_at=now()-interval '1 second' WHERE id='${id}'`);
    const fresh = claim(); expect(fresh.claim_token).not.toBe(old.claim_token);
    expect(fresh.attempts).toBe(3); expect(fresh.last_result).toBe('historical');
    expect(write(old.claim_token)).toBe('0'); expect(write(fresh.claim_token)).toBe('1');
    expect(sql(`SELECT status FROM property_enrichment_queue WHERE id='${id}'`)).toBe('done');
  });
  it('expired token cannot renew itself or write even before recovery', () => {
    seed(); const old = claim(); sql(`UPDATE property_enrichment_queue SET lease_expires_at=now()-interval '1 second'`);
    expect(sql(`SELECT renew_enrichment_claim('${id}','${old.claim_token}')`)).toBe('f'); expect(write(old.claim_token)).toBe('0');
  });
  it('external address requeue invalidates old ownership', () => {
    seed(); const old=claim(); sql(`UPDATE lender_portfolio_clients SET address_line1='2 Synthetic St' WHERE id='${client}'`);
    expect(write(old.claim_token)).toBe('0');
    expect(sql('SELECT status || \'|\' || (claim_token IS NULL)::text FROM property_enrichment_queue')).toBe('pending|true');
  });
  it('worker verified-address update preserves its claim and history atomically', () => {
    seed(); const current=claim(); expect(write(current.claim_token, {} as any, {address_line1:'3 Synthetic St'})).toBe('1');
    expect(sql('SELECT attempts || \'|\' || last_result FROM property_enrichment_queue')).toBe('3|historical');
    expect(write(current.claim_token)).toBe('1');
  });
  it('lost token cannot mutate coupled client data', () => {
    seed(); const old=claim(); sql(`UPDATE property_enrichment_queue SET lease_expires_at=now()-interval '1 second'`); claim();
    const before=sql(`SELECT address_line1 FROM lender_portfolio_clients WHERE id='${client}'`);
    expect(write(old.claim_token, {status:'done'}, {address_line1:'stale overwrite'})).toBe('0');
    expect(sql(`SELECT address_line1 FROM lender_portfolio_clients WHERE id='${client}'`)).toBe(before);
  });
  it('invalid terminal mutation rolls back its coupled client change', () => {
    seed(); const current=claim(); const before=sql(`SELECT address_line1 FROM lender_portfolio_clients WHERE id='${client}'`);
    expect(() => write(current.claim_token, {status:'invalid-status'}, {address_line1:'rollback'})).toThrow();
    expect(sql(`SELECT address_line1 FROM lender_portfolio_clients WHERE id='${client}'`)).toBe(before);
    expect(sql('SELECT status FROM property_enrichment_queue')).toBe('running');
  });
  it('stale provider result cannot overwrite shared cache after reclaim', () => {
    seed(); const old=claim(); write(old.claim_token,{address_normalized:'synthetic-key'} as any);
    sql(`UPDATE property_enrichment_queue SET lease_expires_at=now()-interval '1 second'`); const current=claim();
    const cache=(token:string,detail:string)=>sql(`SELECT persist_enrichment_cache('${id}','${token}','property_intel','{"address_normalized":"synthetic-key","detail":{"value":"${detail}"}}')`);
    expect(cache(current.claim_token,'new')).toBe('t'); expect(cache(old.claim_token,'old')).toBe('f');
    expect(sql("SELECT detail->>'value' FROM property_intel")).toBe('new');
  });
  it('lease expiry during in-flight provider call permits overlap but fences old durable result', async () => {
    seed(); const old=claim(); let calls=0; let release: (()=>void)|undefined;
    const inFlight=new Promise<void>(resolve=>{calls++;release=resolve;});
    sql(`UPDATE property_enrichment_queue SET lease_expires_at=now()-interval '1 second'`); const current=claim();
    calls++; expect(calls).toBe(2); // Reproduces, rather than conceals, duplicate-call limitation.
    release?.(); await inFlight;
    expect(write(old.claim_token)).toBe('0'); expect(write(current.claim_token)).toBe('1');
  });
  it('RPC execution is denied to browser roles', () => {
    expect(sql("SELECT has_function_privilege('authenticated','public.claim_enrichment_jobs(integer)','EXECUTE')")).toBe('f');
    expect(sql("SELECT has_function_privilege('anon','public.write_enrichment_claim(uuid,uuid,jsonb,jsonb)','EXECUTE')")).toBe('f');
    expect(sql("SELECT has_function_privilege('service_role','public.claim_enrichment_jobs(integer)','EXECUTE')")).toBe('t');
  });
  it('cancel/reset invalidates the token and preserves historical attempts', () => {
    seed(); const current=claim(); sql("UPDATE property_enrichment_queue SET status='skipped'");
    expect(write(current.claim_token)).toBe('0');
    expect(sql("SELECT attempts || '|' || (claim_token IS NULL)::text || '|' || (lease_expires_at IS NULL)::text FROM property_enrichment_queue")).toBe('3|true|true');
  });
  it('legacy abandoned running row is recovered with a fresh token', () => {
    seed(); sql("UPDATE property_enrichment_queue SET status='running', started_at=now()-interval '16 minutes'");
    const current=claim(); expect(current.claim_token).toBeTruthy(); expect(current.attempts).toBe(3);
  });
  it('valid renewal prevents recovery and expiry during lock wait rejects writes', async () => {
    seed(); const current=claim();
    expect(sql(`SELECT renew_enrichment_claim('${id}','${current.claim_token}')`)).toBe('t');
    expect(sql('SELECT count(*) FROM claim_enrichment_jobs(1)')).toBe('0');
    // Lease check is evaluated after the lock, not at invocation start.
    sql("UPDATE property_enrichment_queue SET lease_expires_at=clock_timestamp()+interval '300 milliseconds'");
    const holder=asyncSql(`BEGIN; SELECT id FROM property_enrichment_queue WHERE id='${id}' FOR UPDATE; SELECT pg_sleep(0.6); COMMIT;`);
    for(let i=0;i<100;i++) {
      if(sql("SELECT count(*) FROM pg_stat_activity WHERE query LIKE 'BEGIN; SELECT id FROM property_enrichment_queue%' AND wait_event='PgSleep'")==='1') break;
      await new Promise(resolve=>setTimeout(resolve,5));
    }
    expect(await asyncSql(`SELECT count(*) FROM write_enrichment_claim('${id}','${current.claim_token}','{"status":"done"}')`)).toBe('0');
    await holder;
  });
});
