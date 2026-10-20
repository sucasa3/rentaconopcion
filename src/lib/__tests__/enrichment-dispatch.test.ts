import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as claims from '../enrichment-claims.server';

// Explicit disposable local PG only; no project connection environment.
const args = ['-h','/tmp/worker-local-pg/socket','-p','55439','-U','local_worker','-d','postgres','-X','-A','-t','-v','ON_ERROR_STOP=1'];
const sql = (q: string) => execFileSync('psql',[...args,'-c',q],{encoding:'utf8'}).trim();
const client='00000000-0000-4000-8000-000000000001';
const book='00000000-0000-4000-8000-000000000002';
let job: string;
const literal=(v:unknown)=>v == null ? 'NULL' : `'${JSON.stringify(v).replaceAll("'","''")}'::jsonb`;
const admin={async rpc(name:string,a:Record<string,any>) {
  try {
    let q: string;
    if(name==='begin_enrichment_dispatch') q=`SELECT begin_enrichment_dispatch('${a.p_id}','${a.p_token}')`;
    else if(name==='record_enrichment_response') q=`SELECT record_enrichment_response('${a.p_dispatch}','${a.p_token}',${literal(a.p_response)})`;
    else throw new Error('Unexpected RPC');
    const out=sql(q); return {data:out==='t'?true:out==='f'?false:out?JSON.parse(out):null,error:null};
  } catch {return {data:null,error:{message:'sanitized local IO failure'}};}
}};
const claim=()=>JSON.parse(sql('SELECT row_to_json(q) FROM claim_enrichment_jobs(1) q'));
const expire=()=>sql(`UPDATE property_enrichment_queue SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id='${job}'`);
const reconcile=(id:string,action:string,evidence='synthetic operator evidence')=>sql(`SELECT reconcile_enrichment_dispatch('${id}','${action}','local-test','${evidence}')`);
const evidence=()=>JSON.parse(sql('SELECT row_to_json(d) FROM enrichment_dispatches d ORDER BY dispatched_at DESC LIMIT 1'));
beforeAll(()=>{
  sql(`DROP TABLE IF EXISTS enrichment_dispatches,property_enrichment_queue,lender_portfolio_clients,lender_portfolios,property_intel,property_intel_misses CASCADE;
    DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$;
    CREATE TABLE lender_portfolio_clients(id uuid PRIMARY KEY,address_line1 text,city text,state text,zip text,portfolio_id uuid,
      archived_at timestamptz,homeowner_id uuid,last_intel_refreshed_at timestamptz,loan_amount_at_close_cents bigint,close_date date,term_months integer);
    CREATE TABLE lender_portfolios(id uuid PRIMARY KEY);
    INSERT INTO lender_portfolios VALUES('${book}');
    INSERT INTO lender_portfolio_clients(id,portfolio_id) VALUES('${client}','${book}');
    CREATE TABLE property_intel(id uuid,address_normalized text UNIQUE,detail jsonb);
    CREATE TABLE property_intel_misses(address_normalized text,endpoint text,reason text,UNIQUE(address_normalized,endpoint));`);
  const base=readFileSync('supabase/migrations/20260814035436_4128b985-20ca-4817-88ab-bdfa8785b652.sql','utf8');
  sql(base.slice(0,base.indexOf('GRANT SELECT'))+'ALTER TABLE property_enrichment_queue ADD COLUMN address_normalized text, ADD COLUMN address_verified_at timestamptz;');
  sql(readFileSync('docs/release-candidates/worker-concurrency-migration.sql','utf8'));
});
beforeEach(()=>{
  sql('TRUNCATE enrichment_dispatches,property_enrichment_queue;');
  job=sql(`INSERT INTO property_enrichment_queue(portfolio_client_id,portfolio_id,attempts,last_result,address_normalized)
    VALUES('${client}','${book}',3,'history','synthetic-address') RETURNING id`).split('\n')[0];
});
describe('durable dispatch gap only, actual review SQL and local stub IO',()=>{
  it('dispatch is committed before IO; lease expiry blocks worker B and preserves history',async()=>{
    const a=claim(); let calls=0; let release:((v:any)=>void)|undefined;
    const flight=claims.guardedProviderRequest(admin,a,()=>{
      calls++; expect(evidence().state).toBe('dispatched');
      return new Promise(resolve=>{release=resolve;});
    });
    // Wait for durable begin, not time-based scheduling assumptions.
    await Promise.resolve(); await Promise.resolve();
    expire(); expect(sql('SELECT count(*) FROM claim_enrichment_jobs(1)')).toBe('0');
    expect(evidence().state).toBe('uncertain');
    release?.({ok:true,data:{synthetic:true}});
    await expect(flight).rejects.toThrow('Enrichment queue write failed');
    expect(calls).toBe(1); expect(evidence().response.data.synthetic).toBe(true);
    expect(sql(`SELECT attempts || '|' || last_result FROM property_enrichment_queue`)).toBe('3|history');
    expect(sql(`SELECT count(*) FROM write_enrichment_claim('${job}','${a.claim_token}','{"status":"done"}')`)).toBe('0');
    expect(sql('SELECT count(*) FROM claim_enrichment_jobs(1)')).toBe('0');
  });
  it('crash after commit before sending is uncertain, not automatically retryable',async()=>{
    const a=claim(); await admin.rpc('begin_enrichment_dispatch',{p_id:job,p_token:a.claim_token});
    expire(); expect(sql('SELECT count(*) FROM claim_enrichment_jobs(1)')).toBe('0');
    expect(evidence().state).toBe('uncertain');
    expect(()=>reconcile(evidence().id,'confirmed_not_sent','')).toThrow();
  });
  it('positive not-sent reconciliation releases once; ambiguous retries do not',async()=>{
    const a=claim(); await admin.rpc('begin_enrichment_dispatch',{p_id:job,p_token:a.claim_token});
    expire(); sql('SELECT count(*) FROM claim_enrichment_jobs(1)');
    const d=evidence(); expect(()=>reconcile(d.id,'retry_unknown')).toThrow();
    expect(reconcile(d.id,'confirmed_not_sent')).toBe('t');
    expect(reconcile(d.id,'confirmed_not_sent')).toBe('f');
    const b=claim(); let calls=0;
    await claims.guardedProviderRequest(admin,b,async()=>{calls++;return {ok:true,data:{}};});
    expect(calls).toBe(1); expect(sql("SELECT jsonb_array_length(reconciliation) FROM enrichment_dispatches WHERE state='confirmed_not_sent'")).toBe('1');
    // Retired attempt cannot overwrite evidence of a later attempt.
    expect((await admin.rpc('record_enrichment_response',{p_dispatch:d.id,p_token:a.claim_token,p_response:{ok:true}})).data).toBe(false);
  });
  it('crash after response commit replays saved response without sending again',async()=>{
    const a=claim(); let calls=0;
    await claims.guardedProviderRequest(admin,a,async()=>{calls++;return {ok:true,data:{value:7}};});
    expire(); const b=claim(); expect(b.claim_token).not.toBe(a.claim_token);
    const out=await claims.guardedProviderRequest(admin,b,async()=>{calls++;return {ok:true,data:{value:9}};});
    expect(out.data.value).toBe(7); expect(calls).toBe(1);
    expect(sql(`SELECT count(*) FROM write_enrichment_claim('${job}','${b.claim_token}','{"status":"done"}')`)).toBe('1');
    expect(evidence().state).toBe('resolved');
  });
  it('late response needs explicit acceptance and replays with a new owner',async()=>{
    const a=claim(); const d=(await admin.rpc('begin_enrichment_dispatch',{p_id:job,p_token:a.claim_token})).data;
    expire(); sql('SELECT count(*) FROM claim_enrichment_jobs(1)');
    expect((await admin.rpc('record_enrichment_response',{p_dispatch:d.id,p_token:a.claim_token,p_response:{ok:true,data:{late:1}}})).data).toBe(false);
    expect(reconcile(d.id,'confirmed_not_sent')).toBe('f');
    expect(reconcile(d.id,'accept_response')).toBe('t');
    let calls=0; const b=claim(); const out=await claims.guardedProviderRequest(admin,b,async()=>{calls++;return {ok:true,data:{late:2}};});
    expect(out.data.late).toBe(1); expect(calls).toBe(0);
  });
  it('timeout/exception and returned provider error stay uncertain',async()=>{
    for(const mode of ['throw','error']) {
      sql('TRUNCATE enrichment_dispatches; UPDATE property_enrichment_queue SET status=\'pending\';');
      const a=claim(); let calls=0;
      await expect(claims.guardedProviderRequest(admin,a,async()=>{calls++;if(mode==='throw')throw new Error('private');return {ok:false,status:0};})).rejects.toThrow('Enrichment queue write failed');
      expire(); expect(sql('SELECT count(*) FROM claim_enrichment_jobs(1)')).toBe('0');
      expect(evidence().state).toBe('uncertain'); expect(calls).toBe(1);
    }
  });
  it('lost begin acknowledgement never sends; lost response acknowledgement never resends',async()=>{
    const a=claim(); let calls=0;
    const lossy={async rpc(n:string,p:Record<string,any>){await admin.rpc(n,p);return {data:null,error:{message:'lost acknowledgement'}};}};
    await expect(claims.guardedProviderRequest(lossy,a,async()=>{calls++;return {ok:true};})).rejects.toThrow();
    expect(calls).toBe(0); expire(); expect(sql('SELECT count(*) FROM claim_enrichment_jobs(1)')).toBe('0');
    expect(evidence().state).toBe('uncertain');
    expect(reconcile(evidence().id,'confirmed_not_sent')).toBe('t');
    const b=claim(); const loseResponse={async rpc(n:string,p:Record<string,any>){const out=await admin.rpc(n,p);return n==='record_enrichment_response'?{data:null,error:{message:'lost'}}:out;}};
    await expect(claims.guardedProviderRequest(loseResponse,b,async()=>{calls++;return {ok:true,data:{}};})).rejects.toThrow();
    expire(); const c=claim(); await claims.guardedProviderRequest(admin,c,async()=>{calls++;return {ok:true};});
    expect(calls).toBe(1);
  });
  it('reset/address changes do not erase or bypass uncertain evidence',async()=>{
    const a=claim(); await admin.rpc('begin_enrichment_dispatch',{p_id:job,p_token:a.claim_token});
    sql("UPDATE property_enrichment_queue SET status='pending',address_normalized='new-address'");
    expect(sql('SELECT count(*) FROM claim_enrichment_jobs(1)')).toBe('0');
    const d=evidence(); await admin.rpc('record_enrichment_response',{p_dispatch:d.id,p_token:a.claim_token,p_response:{ok:true,data:{}}});
    expect(reconcile(d.id,'accept_response')).toBe('f');
    expect(sql('SELECT count(*) FROM claim_enrichment_jobs(1)')).toBe('0');
  });
  it('browser roles cannot read request evidence or reconcile it',()=>{
    expect(sql("SELECT has_table_privilege('authenticated','enrichment_dispatches','SELECT')")).toBe('f');
    expect(sql("SELECT has_function_privilege('anon','reconcile_enrichment_dispatch(uuid,text,text,text)','EXECUTE')")).toBe('f');
    expect(sql("SELECT has_function_privilege('service_role','begin_enrichment_dispatch(uuid,uuid)','EXECUTE')")).toBe('t');
  });
  for(const path of ['src/lib/provider-primary.server.ts','src/lib/valuation.server.ts']) {
    it(`actual ${path} uses durable guard before its stub provider`,async()=>{
      const a=claim(); let calls=0;
      const builder:any={select(){return this;},eq(){return this;},gt(){return this;},maybeSingle(){return this;},insert(){return this;},then(resolve:any){return Promise.resolve({data:null}).then(resolve);}};
      const fake={...admin,from(){return builder;}};
      const blocked=async()=>{calls++; expect(evidence().state).toBe('dispatched');expire();sql('SELECT count(*) FROM claim_enrichment_jobs(1)');return {ok:true,data:{}};};
      const modules:Record<string,any>={
        './enrichment-claims.server':claims,
        '@/integrations/supabase/client.server':{supabaseAdmin:fake},
        './attom.server':{ATTOM_TTL_DAYS:{detail:30},normalizeAddress:()=> 'synthetic-address'},
        './batchdata.server':{batchdataCostCents:()=>10},
        './batchdata-live.server':{batchdataLookup:blocked},
        './batchdata-normalize':{normalizeBatchdataProperty:()=>null,isMatched:()=>false,parseTestAddress:()=>({}),firstBatchdataProperty:()=>({})},
        './batchdata-summaries':{batchdataToSummaries:()=>({})},
        './home-team':{},'@/lib/value-engine':{},'@/lib/equity':{},
      };
      const exports:Record<string,any>={};
      runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
        {exports,require:(n:string)=>{if(!(n in modules))throw new Error('Unexpected module '+n);return modules[n];},Date,process:{env:{}},Error});
      const work=path.includes('primary')?exports.enrichViaBatchdata(fake,'synthetic-address',a):exports.getPropertyIntel('synthetic-address',{enrichmentClaim:a,classes:['detail'],revenueSource:'local-test'});
      await expect(work).rejects.toThrow('Enrichment queue write failed');
      expect(calls).toBe(1);expect(sql('SELECT count(*) FROM claim_enrichment_jobs(1)')).toBe('0');
    });
  }
});