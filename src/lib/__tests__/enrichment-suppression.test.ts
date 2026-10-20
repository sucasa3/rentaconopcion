import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Local-only: transpile the actual patched worker; every IO module is stubbed.
function actualWorker() {
 return ts.transpileModule(readFileSync('src/lib/enrichment.server.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
 }).outputText;
}
async function tick(suppressionError=false, skippedWriteError=false) {
 const job={id:'synthetic-job',portfolio_client_id:'synthetic-client',portfolio_id:'synthetic-book',attempts:3,priority:50,requested_classes:['detail'],created_at:'2026-01-01',next_attempt_at:'2026-01-01',last_result:'old-result',status:'pending'};
 let providerCalls=0;
 const calls:Array<{table:string;payload:Record<string,unknown>;filters:unknown[]}>=[];
 const fake={from(table:string){let payload:Record<string,unknown>|undefined;const filters:unknown[]=[];const builder:any={select(){return builder;},update(p:Record<string,unknown>){payload=p;return builder;},eq(...a:unknown[]){filters.push(a);return builder;},in(...a:unknown[]){filters.push(a);return builder;},is(){return builder;},lt(){return builder;},lte(){return builder;},gt(){return builder;},gte(){return builder;},like(){return builder;},order(){return builder;},limit(){return builder;},maybeSingle(){return builder;},then(resolve:any,reject:any){try{let data:unknown=null;let count=0;if(payload){calls.push({table,payload,filters});if(table==='property_enrichment_queue'&&payload.status==='skipped'&&!skippedWriteError)Object.assign(job,payload);if(table==='property_enrichment_queue'&&payload.status==='running'&&filters.some(f=>Array.isArray(f)&&f[0]==='id'))Object.assign(job,payload);}else if(table==='attom_monthly_budget')data={tier_calls_included:1000,calls_used:0};else if(table==='property_enrichment_queue')data=[{...job}];else if(table==='lender_portfolio_clients')data=[{id:job.portfolio_client_id,portfolio_id:job.portfolio_id,client_email:'synthetic@example.invalid',client_phone:null,address_line1:'1 Synthetic St',zip:'30075'}];else data=[];return Promise.resolve({data,count,error:skippedWriteError&&payload?.status==='skipped'?{message:'synthetic skipped write failure'}:null}).then(resolve,reject);}catch(e){return Promise.reject(e).then(resolve,reject);}}};return builder;}};
 const blocked=()=>{providerCalls++;throw new Error('Provider path reached');};
 const modules:Record<string,unknown>={
  './attom.server':{ATTOM_TTL_DAYS:{detail:30},normalizeAddress:(s:string)=>s},
  './provider-primary.server':{batchdataPrimaryEnabled:blocked,enrichViaBatchdata:blocked},
  './opportunities.server':{persistPortfolioOpportunities:blocked},
  './home-team-candidates.server':{persistHomeTeamCandidates:blocked},
  './geocode.server':{verifyAddress:blocked},
  '@/integrations/supabase/client.server':{supabaseAdmin:fake},
  './suppression.server':{isSuppressed:async()=>{if(suppressionError)throw new Error('synthetic suppression failure');return true;}},
  './valuation.server':{getPropertyIntel:blocked,extractMortgage:blocked,extractSales:blocked},
 };
 const exports:Record<string,any>={};
 runInNewContext(actualWorker(),{exports,require:(name:string)=>{if(!(name in modules))throw new Error('Unmocked module '+name);return modules[name];},Date,Map,Set,Math,fetch:blocked});
 if(suppressionError)await expect(exports.runEnrichmentTick()).rejects.toThrow('synthetic suppression failure');
 else {const result=await exports.runEnrichmentTick();expect(result.needsReview).toBe(0);expect(result.spentCalls).toBe(0);expect(result.processed).toBe(1);}
 expect(providerCalls).toBe(0);
 return {job,calls};
}
describe('Step A actual worker suppression flow (local mocks only)',()=>{
 it('keeps skipped terminal through the whole tick with no paid path or retry/history changes',async()=>{const {job,calls}=await tick();expect(job.status).toBe('skipped');expect(job.attempts).toBe(3);expect(job.priority).toBe(50);expect(job.created_at).toBe('2026-01-01');expect(job.next_attempt_at).toBe('2026-01-01');expect(job.last_result).toBe('old-result');const writes=calls.filter(c=>c.table==='property_enrichment_queue'&&c.payload.status==='skipped');expect(writes).toHaveLength(1);expect(writes[0].payload.last_error).toBe('suppressed: the person asked not to be contacted');expect(writes[0].payload.completed_at).toBeTruthy();expect(calls.some(c=>c.payload.status==='needs_review')).toBe(false);});
 it('known dependency: a returned skipped-write error is ignored (not release acceptance)',async()=>{const {job,calls}=await tick(false,true);expect(job.status).toBe('running');expect(calls.some(c=>c.payload.status==='needs_review')).toBe(false);});
 it('suppression lookup failure exits without providers, leaving existing stuck-running recovery unchanged',async()=>{const {calls}=await tick(true);expect(calls.some(c=>c.payload.status==='skipped'||c.payload.status==='done')).toBe(false);expect(calls.some(c=>c.payload.status==='running')).toBe(true);});
});
// Diagnostic reproduction, not a successful fail-closed acceptance check.
describe('Step A suppression dependency (real helper, local mocks only)', () => {
 it('known blocker: the real lookup treats a returned database error as no suppression', async () => {
  const code = ts.transpileModule(readFileSync('src/lib/suppression.server.ts', 'utf8'), {
   compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const lookup = { select() { return this; }, or() { return this; }, limit: async () => ({ data: null, error: { message: 'synthetic lookup failure' } }) };
  const exports: Record<string, any> = {};
  const modules: Record<string, unknown> = {
   crypto: { createHmac: () => ({ update: () => ({ digest: () => 'synthetic-hmac' }) }) },
   './account-deletion': { suppressionMatches: (rows: unknown[]) => rows.length > 0 },
  };
  runInNewContext(code, { exports, process: { env: {} }, require: (name: string) => {
   if (!(name in modules)) throw new Error('Unmocked module ' + name);
   return modules[name];
  } });
  await expect(exports.isSuppressed({ from: () => lookup }, { email: 'synthetic@example.invalid' })).resolves.toBe(false);
 });
});
