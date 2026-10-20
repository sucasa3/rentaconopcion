import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as claims from '../enrichment-claims.server';
import { candidateFor, isSuppressed } from '../suppression.server';

// Actual worker + actual shared suppression helper; all database/network IO is local.
type Options = {
  suppressionError?: boolean;
  suppressed?: boolean;
  fault?: 'claim' | 'skipped' | 'recovery' | 'address' | 'done';
  failure?: 'error' | 'zero' | 'wrong-id' | 'partial' | 'rejected';
  stale?: boolean;
  secondJob?: boolean;
  paid?: boolean;
};
async function tick(opts: Options = {}) {
  const job: Record<string, any> = {
    id: 'synthetic-job', portfolio_client_id: 'synthetic-client', portfolio_id: 'synthetic-book',
    attempts: 3, priority: 50, requested_classes: ['detail'], created_at: '2026-01-01',
    next_attempt_at: '2026-01-01', last_result: 'old-result', status: opts.stale ? 'running' : 'pending',
    started_at: opts.stale ? '2026-01-01' : null,
  };
  const jobs = [job];
  if (opts.secondJob) jobs.push({ ...job, id: 'synthetic-job-2' });
  let providerCalls = 0;
  const writes: Array<{ payload: Record<string, any>; ids: string[] }> = [];
  const client = { id: job.portfolio_client_id, portfolio_id: job.portfolio_id,
    client_email: 'synthetic@example.invalid', client_phone: null,
    address_line1: '1 Synthetic St', zip: '30075', archived_at: null };
  const candidate = candidateFor({ email: client.client_email });
  const fake = {
    async rpc(name: string, args: Record<string, any>) {
      if (name === 'renew_enrichment_claim') return { data: true, error: null };
      const isClaim = name === 'claim_enrichment_jobs';
      const patch = args.p_patch ?? {};
      const kind = isClaim ? (opts.stale ? 'recovery' : 'claim') :
        patch.status === 'skipped' ? 'skipped' : 'address_normalized' in patch ? 'address' : patch.status;
      if (opts.stale && isClaim) writes.push({ payload: { status: 'pending', started_at: null }, ids: jobs.map(j => j.id) });
      const rows = isClaim ? jobs : jobs.filter(j => j.id === args.p_id && j.claim_token === args.p_token);
      writes.push({ payload: isClaim ? { status: 'running' } : patch, ids: rows.map(j => j.id) });
      if (opts.fault === kind) {
        if (opts.failure === 'rejected') throw new Error('private rejection detail');
        if (opts.failure === 'zero') return { data: isClaim ? null : [], error: null };
        if (opts.failure === 'wrong-id') return { data: [{ id: 'not-requested' }], error: null };
        if (opts.failure === 'partial') return { data: isClaim ? [{ ...jobs[0], status: 'pending' }] : [], error: null };
        return { data: null, error: { message: 'private detail' } };
      }
      if (isClaim) {
        for (const j of rows) Object.assign(j, { status: 'running', claim_token: 'local-token', lease_expires_at: new Date(Date.now()+900000).toISOString() });
        return { data: rows.map(j => ({ ...j })), error: null };
      }
      for (const j of rows) Object.assign(j, patch);
      return { data: rows.map(j => ({ id: j.id })), error: null };
    },
    from(table: string) {
    let payload: Record<string, any> | undefined;
    const filters: Array<(row: Record<string, any>) => boolean> = [];
    const builder: any = {
      select() { return builder; },
      update(p: Record<string, any>) { payload = p; return builder; },
      eq(k: string, v: unknown) { filters.push(r => r[k] === v); return builder; },
      in(k: string, v: unknown[]) { filters.push(r => v.includes(r[k])); return builder; },
      is(k: string, v: unknown) { filters.push(r => (r[k] ?? null) === v); return builder; },
      lt(k: string, v: string) { filters.push(r => r[k] != null && r[k] < v); return builder; },
      lte(k: string, v: string) { filters.push(r => r[k] <= v); return builder; },
      gt() { return builder; }, gte() { return builder; }, like() { return builder; },
      or() { return builder; }, order() { return builder; }, limit() { return builder; },
      maybeSingle() { return builder; },
      then(resolve: any, reject: any) {
        let data: any = []; let error = null;
        if (table === 'property_enrichment_queue') {
          const rows = jobs.filter(r => filters.every(f => f(r)));
          if (payload) {
            const kind = payload.status === 'running' ? 'claim' : payload.status === 'skipped' ? 'skipped'
              : payload.status === 'pending' && 'started_at' in payload ? 'recovery'
              : 'address_normalized' in payload ? 'address' : payload.status;
            writes.push({ payload: { ...payload }, ids: rows.map(r => r.id) });
            if (opts.fault === kind) {
              if (opts.failure === 'rejected') return Promise.reject(new Error('private rejection detail')).then(resolve, reject);
              else if (opts.failure === 'zero') data = [];
              else if (opts.failure === 'wrong-id') data = [{ id: 'not-requested' }];
              else if (opts.failure === 'partial') {
                const first = rows[0];
                if (first) { Object.assign(first, payload); data = [{ id: first.id }]; }
              } else error = { message: 'private database detail must not escape' };
            } else { for (const row of rows) Object.assign(row, payload); data = rows.map(r => ({ id: r.id })); }
          } else data = rows.map(r => ({ ...r }));
        } else if (table === 'deletion_suppressions') {
          if (opts.suppressionError) error = { message: 'private database detail must not escape' };
          else data = opts.suppressed === false ? [] : [{ email_hmac: candidate.emailHmac }];
        } else if (table === 'attom_monthly_budget') data = { tier_calls_included: 1000, calls_used: 0 };
        else if (table === 'attom_endpoint_health') data = [{ endpoint: 'detail', enabled: true }];
        else if (table === 'lender_portfolio_clients') data = payload ? [] : [client];
        else if (table === 'property_intel') data = opts.paid ? null : { source: 'batchdata', batchdata_enriched_at: new Date().toISOString() };
        return Promise.resolve({ data, count: 0, error }).then(resolve, reject);
      },
    };
    return builder;
  } };
  const blocked = () => { providerCalls++; throw new Error('Unexpected external call'); };
  const modules: Record<string, unknown> = {
    './enrichment-claims.server': claims,
    './attom.server': { ATTOM_TTL_DAYS: { detail: 30 }, normalizeAddress: (s: string) => s },
    './provider-primary.server': { batchdataPrimaryEnabled: () => false, enrichViaBatchdata: blocked },
    './opportunities.server': { persistPortfolioOpportunities: async () => undefined },
    './home-team-candidates.server': { persistHomeTeamCandidates: async () => undefined },
    './geocode.server': { verifyAddress: blocked },
    '@/integrations/supabase/client.server': { supabaseAdmin: fake },
    './suppression.server': { isSuppressed },
    './valuation.server': { getPropertyIntel: async () => {
      providerCalls++; return { classes: { detail: { data: {} } }, errors: {} };
    }, extractMortgage: () => null, extractSales: () => null },
  };
  const exports: Record<string, any> = {};
  const code = ts.transpileModule(readFileSync('src/lib/enrichment.server.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, { exports, require: (name: string) => {
    if (!(name in modules)) throw new Error('Unmocked module ' + name);
    return modules[name];
  }, Date, Map, Set, Math, Error, Array, fetch: blocked });
  let result: any; let error: unknown;
  try { result = await exports.runEnrichmentTick(); } catch (e) { error = e; }
  return { job, jobs, writes, providerCalls, result, error };
}
function expectFailure(out: Awaited<ReturnType<typeof tick>>, message = 'Enrichment queue write failed') {
  expect(out.error).toBeInstanceOf(Error);
  expect((out.error as Error).message).toBe(message);
  expect(out.result).toBeUndefined();
}
function expectHistory(job: Record<string, any>) {
  expect(job.attempts).toBe(3); expect(job.priority).toBe(50);
  expect(job.created_at).toBe('2026-01-01'); expect(job.next_attempt_at).toBe('2026-01-01');
  expect(job.last_result).toBe('old-result');
}
describe('actual worker + real suppression helper (local IO only)', () => {
  it('persists suppression as skipped without providers, review or history changes', async () => {
    const out = await tick();
    expect(out.error).toBeUndefined(); expect(out.job.status).toBe('skipped'); expectHistory(out.job);
    expect(out.providerCalls).toBe(0); expect(out.result.needsReview).toBe(0); expect(out.result.spentCalls).toBe(0);
    expect(out.result.processed).toBe(1);
    expect(out.writes.filter(w => w.payload.status === 'skipped')).toHaveLength(1);
    expect(out.job.completed_at).toBeTruthy();
    expect(out.writes.some(w => w.payload.status === 'needs_review')).toBe(false);
  });
  it('returned suppression database error fails closed through the real worker', async () => {
    const out = await tick({ suppressionError: true });
    expectFailure(out, 'Suppression lookup failed'); expect(out.providerCalls).toBe(0);
    expect(out.job.status).toBe('running'); expectHistory(out.job);
    expect(out.writes.some(w => ['skipped', 'done', 'needs_review'].includes(w.payload.status))).toBe(false);
  });
  for (const fault of ['claim', 'skipped'] as const) {
    for (const failure of ['error', 'zero', 'wrong-id', 'partial', 'rejected'] as const) {
      it(`rejects ${fault} ${failure} without providers or false persisted success`, async () => {
        const out = await tick({ fault, failure, secondJob: failure === 'partial' });
        expectFailure(out); expect(out.providerCalls).toBe(0);
        for (const job of out.jobs) expectHistory(job);
        expect(out.writes.some(w => w.payload.status === 'needs_review')).toBe(false);
        if (fault === 'claim') expect(out.writes.some(w => w.payload.status === 'skipped')).toBe(false);
        if (failure !== 'partial') expect(out.job.status).toBe(fault === 'claim' ? 'pending' : 'running');
      });
    }
  }
  it('recovers a stale running job after 15 minutes without resetting attempts/history', async () => {
    const out = await tick({ stale: true });
    expect(out.error).toBeUndefined(); expect(out.job.status).toBe('skipped'); expectHistory(out.job);
    expect(out.providerCalls).toBe(0);
    expect(out.writes[0].payload).toEqual({ status: 'pending', started_at: null });
  });
  it('failed recovery stops before claims or providers', async () => {
    const out = await tick({ stale: true, fault: 'recovery' });
    expectFailure(out); expect(out.job.status).toBe('running'); expectHistory(out.job);
    expect(out.providerCalls).toBe(0); expect(out.writes).toHaveLength(2);
  });
  it('zero recovered rows is valid when nothing is stale', async () => {
    const out = await tick(); expect(out.error).toBeUndefined(); expect(out.job.status).toBe('skipped');
  });
  it('failed pre-provider address queue write stops before providers', async () => {
    const out = await tick({ suppressed: false, fault: 'address' });
    expectFailure(out); expect(out.providerCalls).toBe(0); expectHistory(out.job);
  });
  it('failed cached terminal write rejects instead of reporting completion', async () => {
    const out = await tick({ suppressed: false, fault: 'done', failure: 'zero' });
    expectFailure(out); expect(out.providerCalls).toBe(0); expectHistory(out.job);
  });
  it('ATTOM terminal write failure is not caught as a new provider attempt or retry', async () => {
    const out = await tick({ suppressed: false, paid: true, fault: 'done' });
    expectFailure(out); expect(out.providerCalls).toBe(1); expectHistory(out.job);
    expect(out.writes.some(w => ['failed', 'needs_review'].includes(w.payload.status))).toBe(false);
  });
  it('rejected terminal queue IO is sanitized and never rewritten as a provider retry', async () => {
    const out = await tick({ suppressed: false, paid: true, fault: 'done', failure: 'rejected' });
    expectFailure(out); expect(out.providerCalls).toBe(1); expectHistory(out.job);
    expect(out.writes.some(w => ['failed', 'needs_review'].includes(w.payload.status))).toBe(false);
  });
});
