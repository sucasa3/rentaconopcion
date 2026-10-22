import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as claims from '../enrichment-claims.server';

// Explicit disposable local PG only; no project connection environment.
const args = ['-h','/tmp/worker-local-pg/socket','-p','55439','-U','local_worker','-d','postgres','-X','-A','-t','-v','ON_ERROR_STOP=1'];
const sql = (q: string) => execFileSync('psql',[...args,'-c',q],{encoding:'utf8'}).trim();
const bookA='00000000-0000-4000-8000-0000000000a1';
const bookB='00000000-0000-4000-8000-0000000000b1';
const admin={async rpc(name:string,a:Record<string,any>) {
  try {
    let q: string;
    if(name==='begin_enrichment_dispatch') q=`SELECT begin_enrichment_dispatch('${a.p_id}','${a.p_token}')`;
    else if(name==='record_enrichment_response') q=`SELECT record_enrichment_response('${a.p_dispatch}','${a.p_token}',${a.p_response==null?'NULL':`'${JSON.stringify(a.p_response)}'::jsonb`})`;
    else throw new Error('Unexpected RPC');
    const out=sql(q); return {data:out==='t'?true:out==='f'?false:out?JSON.parse(out):null,error:null};
  } catch {return {data:null,error:{message:'sanitized'}};}
}};
const addJob=(book:string,addr:string)=>{
  const c=sql(`INSERT INTO lender_portfolio_clients(id,portfolio_id) VALUES(gen_random_uuid(),'${book}') RETURNING id`).split('\n')[0];
  return sql(`INSERT INTO property_enrichment_queue(portfolio_client_id,portfolio_id,address_normalized)
    VALUES('${c}','${book}','${addr}') RETURNING id`).split('\n')[0];
};
const grant=(book:string,jobs:string[],max:number,extra='')=>sql(`INSERT INTO enrichment_release_grants
  (portfolio_id,job_ids,max_dispatches,approved_by,approval_note,expires_at${extra?',revoked_at':''})
  VALUES('${book}',ARRAY[${jobs.map(j=>`'${j}'`).join(',')}]::uuid[],${max},'local-test','synthetic',clock_timestamp()+interval '1 day'${extra?`,${extra}`:''}) RETURNING id`).split('\n')[0];
const claimAll=()=>{const out=sql('SELECT coalesce(json_agg(q),\'[]\') FROM claim_enrichment_jobs(25) q');return JSON.parse(out) as any[];};

beforeAll(()=>{
  sql(`DROP TABLE IF EXISTS enrichment_release_grants,enrichment_dispatches,property_enrichment_queue,lender_portfolio_clients,lender_portfolios,property_intel,property_intel_misses CASCADE;
    DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$;
    CREATE TABLE lender_portfolio_clients(id uuid PRIMARY KEY,address_line1 text,city text,state text,zip text,portfolio_id uuid,
      archived_at timestamptz,homeowner_id uuid,last_intel_refreshed_at timestamptz,loan_amount_at_close_cents bigint,close_date date,term_months integer);
    CREATE TABLE lender_portfolios(id uuid PRIMARY KEY);
    INSERT INTO lender_portfolios VALUES('${bookA}'),('${bookB}');
    CREATE TABLE property_intel(id uuid,address_normalized text UNIQUE,detail jsonb);
    CREATE TABLE property_intel_misses(address_normalized text,endpoint text,reason text,UNIQUE(address_normalized,endpoint));`);
  const base=readFileSync('supabase/migrations/20260814035436_4128b985-20ca-4817-88ab-bdfa8785b652.sql','utf8');
  sql(base.slice(0,base.indexOf('GRANT SELECT'))+'ALTER TABLE property_enrichment_queue ADD COLUMN address_normalized text, ADD COLUMN address_verified_at timestamptz;');
  sql(readFileSync('docs/release-candidates/worker-concurrency-migration.sql','utf8'));
  sql(readFileSync('docs/release-candidates/worker-release-grants.sql','utf8'));
});
beforeEach(()=>{ sql('TRUNCATE enrichment_release_grants,enrichment_dispatches,property_enrichment_queue,lender_portfolio_clients;'); });

describe('release grants: installing the repair releases nothing by default',()=>{
  it('with no grant, pending jobs from every customer stay pending',()=>{
    addJob(bookA,'a1'); addJob(bookB,'b1');
    expect(claimAll()).toHaveLength(0);
    expect(sql("SELECT count(*) FROM property_enrichment_queue WHERE status='pending'")).toBe('2');
  });
  it('a grant releases only its listed jobs; another book stays untouched',()=>{
    const a1=addJob(bookA,'a1'); addJob(bookA,'a2'); const b1=addJob(bookB,'b1');
    grant(bookA,[a1],1);
    expect(claimAll().map(r=>r.id)).toEqual([a1]);
    expect(sql(`SELECT status FROM property_enrichment_queue WHERE id='${b1}'`)).toBe('pending');
  });
  it('a grant cannot release a job that belongs to a different book',()=>{
    const b1=addJob(bookB,'b1');
    grant(bookA,[b1],1);
    expect(claimAll()).toHaveLength(0);
  });
  it('revoked grants release nothing',()=>{
    const a1=addJob(bookA,'a1');
    grant(bookA,[a1],1,'clock_timestamp()');
    expect(claimAll()).toHaveLength(0);
  });
  it('billable cap stops provider calls past the approved count',async()=>{
    const a1=addJob(bookA,'a1'); const a2=addJob(bookA,'a2');
    grant(bookA,[a1,a2],1);
    const rows=claimAll(); expect(rows).toHaveLength(2);
    let calls=0; const req=async()=>{calls++;return {ok:true};};
    const results=await Promise.allSettled(rows.map(r=>claims.guardedProviderRequest(admin,r,req)));
    expect(calls).toBe(1);
    expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
    expect(sql('SELECT count(*) FROM enrichment_dispatches')).toBe('1');
  });
  it('the same address is never dispatched twice under one grant',async()=>{
    const a1=addJob(bookA,'same'); const a2=addJob(bookA,'same');
    grant(bookA,[a1,a2],5);
    const rows=claimAll(); let calls=0; const req=async()=>{calls++;return {ok:true};};
    for (const r of rows) { await claims.guardedProviderRequest(admin,r,req).catch(()=>null); }
    expect(calls).toBe(1);
  });
  it('a zero-cost grant allows claiming (cache reuse) but no provider call',async()=>{
    const a1=addJob(bookA,'a1'); grant(bookA,[a1],0);
    const rows=claimAll(); expect(rows).toHaveLength(1);
    let calls=0;
    await expect(claims.guardedProviderRequest(admin,rows[0],async()=>{calls++;return {ok:true};})).rejects.toThrow();
    expect(calls).toBe(0);
  });
});
