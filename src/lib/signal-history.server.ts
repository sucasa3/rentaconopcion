/**
 * Signal history builder — READ ONLY.
 *
 * Every evidence type is gated by `permittedKinds` for the exact relationship,
 * and every row read is scoped to that relationship's organization and
 * homeowner client:
 *   - property records: matched to this client's own address;
 *   - value snapshots: this client's linked homeowner AND this client's address;
 *   - listing status: this client row only;
 *   - outcomes / conversations: this org AND this client row only;
 *   - connection requests: this homeowner AND this org as recipient, not revoked.
 * Homeowner activity, email opens/clicks, text replies, documents, inspection
 * findings and service requests are never read here.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeAddress } from "@/lib/attom.server";
import { factsFromRecord } from "@/lib/client-facts.server";
import { readLenderWorkspace } from "@/lib/lender-workspace.server";
import {
  compareSnapshots,
  engagementSummaryAllowed,
  fingerprints,
  groupSignals,
  isSuppressed,
  isValuationStale,
  permittedKinds,
  recordSource,
  strengthFor,
  type EvidenceFact,
  type EvidenceKind,
  type FeedbackRecord,
  type RelationshipContext,
  type Signal,
  type SignalType,
} from "@/lib/signal-evidence";

export type Audience = "agent" | "lender";

export interface ClientContext {
  clientId: string;
  orgId: string;
  homeownerId: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  closeDate: string | null;
  rctx: RelationshipContext;
  engagementLine: string | null;
}

const admin = () => supabaseAdmin as any;

function fullKey(c: { addressLine1: string | null; city: string | null; state: string | null; zip: string | null }) {
  const tail = [c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return normalizeAddress([c.addressLine1, tail].filter(Boolean).join(", "));
}

// ---------------------------------------------------------------------------
// Access — resolved server-side for every call, never trusted from the client
// ---------------------------------------------------------------------------

export async function resolveContexts(
  supabase: any,
  userId: string,
  audience: Audience,
  clientIds: string[],
): Promise<Map<string, ClientContext>> {
  const out = new Map<string, ClientContext>();
  if (!clientIds.length) return out;

  if (audience === "lender") {
    const ws = await readLenderWorkspace(supabase, userId);
    if (!ws) return out;
    const wanted = new Set(clientIds);
    const rows = ws.book.filter((c) => wanted.has(c.id) && c.access.named);
    if (!rows.length) return out;
    const { data: raw } = await admin()
      .from("lender_portfolio_clients")
      .select("id, address_line1, city, state, zip, close_date, homeowner_id, archived_at, lender_portfolios(lender_org_id)")
      .in("id", rows.map((r) => r.id));
    const byId = new Map(((raw ?? []) as any[]).map((r) => [r.id, r]));
    for (const r of rows) {
      const c = byId.get(r.id);
      if (!c || c.archived_at) continue;
      if (c.lender_portfolios?.lender_org_id !== ws.org.id) continue; // workspace isolation
      const rctx: RelationshipContext = { role: "lender", access: r.access };
      out.set(r.id, {
        clientId: r.id,
        orgId: ws.org.id,
        homeownerId: c.homeowner_id ?? null,
        addressLine1: c.address_line1,
        city: c.city,
        state: c.state,
        zip: c.zip,
        closeDate: c.close_date,
        rctx,
        engagementLine: engagementSummaryAllowed(rctx) ? r.engagementLine : null,
      });
    }
    return out;
  }

  // Agent: member of the agent organization that owns the client's book.
  const { data: members } = await supabase
    .from("lender_members")
    .select("lender_org_id, lender_orgs(org_type)")
    .eq("user_id", userId);
  const agentOrgs = new Set(
    ((members ?? []) as any[])
      .filter((m) => m.lender_orgs?.org_type === "agent")
      .map((m) => m.lender_org_id as string),
  );
  if (!agentOrgs.size) return out;
  const { data: raw } = await admin()
    .from("lender_portfolio_clients")
    .select("id, address_line1, city, state, zip, close_date, homeowner_id, archived_at, lender_portfolios(lender_org_id, assigned_user_id)")
    .in("id", clientIds);
  for (const c of (raw ?? []) as any[]) {
    const orgId = c.lender_portfolios?.lender_org_id;
    if (!orgId || !agentOrgs.has(orgId) || c.archived_at) continue;
    out.set(c.id, {
      clientId: c.id,
      orgId,
      homeownerId: c.homeowner_id ?? null,
      addressLine1: c.address_line1,
      city: c.city,
      state: c.state,
      zip: c.zip,
      closeDate: c.close_date,
      rctx: { role: "agent", ownRelationship: true },
      engagementLine: null, // homeowner activity is excluded for agents
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

const INTEL_COLS =
  "id, address_normalized, address_line1, avm, detail, tax, sales, mortgage, permits, owner, source, batchdata_enriched_at, avm_fetched_at, tax_fetched_at, sales_fetched_at, mortgage_fetched_at, permits_fetched_at";

const TEAM_LISTING_SOURCES = new Set(["manual", "agent", "agent_manual", "agent_entered"]);

export async function buildEvidence(
  ctxs: ClientContext[],
  now = new Date(),
): Promise<Map<string, EvidenceFact[]>> {
  const out = new Map<string, EvidenceFact[]>();
  if (!ctxs.length) return out;
  const ids = ctxs.map((c) => c.clientId);
  const orgIds = [...new Set(ctxs.map((c) => c.orgId))];
  const homeownerIds = [...new Set(ctxs.map((c) => c.homeownerId).filter(Boolean))] as string[];

  const { readPropertyIntelByNormalized, readPropertyIntelByLine1 } = await import(
    "@/lib/property-access.server"
  );
  const keys = [...new Set(ctxs.map(fullKey))].filter(Boolean);
  const lines = [...new Set(ctxs.map((c) => (c.addressLine1 ?? "").trim()))].filter(Boolean);
  const [byFullRows, byLineRows, listings, outcomes, convs, snaps, requests] = await Promise.all([
    readPropertyIntelByNormalized(INTEL_COLS, keys),
    readPropertyIntelByLine1(INTEL_COLS, lines),
    admin().from("property_listing_status").select("id, portfolio_client_id, status, list_date, source, updated_at").in("portfolio_client_id", ids),
    admin().from("opportunity_outcomes").select("id, org_id, portfolio_client_id, stage, next_step, next_step_due_at, occurred_at").in("portfolio_client_id", ids).in("org_id", orgIds).order("occurred_at", { ascending: false }).limit(200),
    admin().from("professional_conversations").select("id, org_id, portfolio_client_id, summary, next_step, follow_up_date, follow_up_timeframe_text, created_at").in("portfolio_client_id", ids).in("org_id", orgIds).order("created_at", { ascending: false }).limit(100),
    homeownerIds.length
      ? admin().from("home_value_snapshots").select("id, user_id, address_normalized, value_cents, source, captured_on").in("user_id", homeownerIds)
      : Promise.resolve({ data: [] }),
    homeownerIds.length
      ? admin().from("consent_records").select("id, homeowner_id, recipient_org_id, granted_at, revoked_at, status").eq("consent_type", "connection_request").eq("status", "granted").in("homeowner_id", homeownerIds).in("recipient_org_id", orgIds)
      : Promise.resolve({ data: [] }),
  ]);
  const byFull = new Map<string, any>();
  for (const r of byFullRows) byFull.set(r.address_normalized, r);
  const byLine = new Map<string, any>();
  for (const r of byLineRows) {
    const k = normalizeAddress(r.address_line1 ?? "");
    if (k && !byLine.has(k)) byLine.set(k, r);
  }

  for (const c of ctxs) {
    const allowed = permittedKinds(c.rctx);
    const facts: EvidenceFact[] = [];
    const push = (f: EvidenceFact) => {
      if (allowed.has(f.kind)) facts.push(f);
    };
    const key = fullKey(c);
    const row = byFull.get(key) ?? byLine.get(normalizeAddress(c.addressLine1 ?? "")) ?? null;

    if (row) {
      const src = recordSource(row);
      const f = factsFromRecord(
        { id: c.clientId, address_line1: c.addressLine1, city: c.city, state: c.state, zip: c.zip, close_date: c.closeDate },
        row,
      );
      const valObserved = src === "batchdata" ? row.batchdata_enriched_at : row.avm_fetched_at;
      if (f.value != null) {
        const stale = isValuationStale(valObserved, now);
        push({
          id: `valuation:${row.id}`,
          kind: "valuation",
          source: src,
          observedAt: valObserved ?? null,
          fp: String(Math.round(f.value)),
          estimated: true,
          stale,
          strength: strengthFor("valuation", { source: src, stale, observedAt: valObserved }),
          values: { value: Math.round(f.value) },
        });
      }
      if (f.equityDollars != null) {
        const obs = row.mortgage_fetched_at ?? valObserved ?? null;
        const stale = isValuationStale(valObserved, now); // equity rides on the valuation
        push({
          id: `equity:${row.id}`,
          kind: "equity",
          source: src,
          observedAt: obs,
          fp: String(Math.round(f.equityDollars)),
          estimated: true,
          stale,
          noActiveLoan: Boolean(f.equityInferredNoLien),
          strength: strengthFor("equity", { source: src, stale, observedAt: obs }),
          values: { equity: Math.round(f.equityDollars) },
        });
      }
      if (f.lastPermitDate) {
        push({
          id: `permit:${row.id}:${f.lastPermitDate}`,
          kind: "permit",
          source: src,
          observedAt: f.lastPermitDate,
          fp: `${f.permitCount}:${f.permitTotalValue ?? ""}`,
          estimated: false,
          stale: false,
          strength: strengthFor("permit", { source: src, observedAt: f.lastPermitDate }),
          values: { count: f.permitCount, date: f.lastPermitDate },
        });
      }
      if (f.lastSalePrice != null && f.lastSaleDate) {
        push({
          id: `sale:${row.id}:${f.lastSaleDate}`,
          kind: "sale",
          source: src,
          observedAt: f.lastSaleDate,
          fp: String(f.lastSalePrice),
          estimated: false,
          stale: false,
          strength: strengthFor("sale", { source: src, observedAt: f.lastSaleDate }),
          values: { price: f.lastSalePrice, date: f.lastSaleDate },
        });
      }
      if (f.taxChangePct != null && f.taxChangePct !== 0) {
        const obs = row.tax_fetched_at ?? null;
        push({
          id: `tax:${row.id}`,
          kind: "tax_change",
          source: src,
          observedAt: obs,
          fp: String(f.taxChangePct),
          estimated: false,
          stale: false,
          strength: strengthFor("tax_change", { source: src, observedAt: obs }),
          values: { pct: f.taxChangePct },
        });
      }
    }

    // Value snapshots: this client's homeowner AND this client's address only.
    if (c.homeownerId && key) {
      const mine = ((snaps.data ?? []) as any[])
        .filter((s) => s.user_id === c.homeownerId && s.address_normalized === key && s.value_cents)
        .map((s) => ({ id: s.id, address: s.address_normalized, source: s.source, valueCents: Number(s.value_cents), capturedOn: s.captured_on }));
      const cmp = compareSnapshots(mine);
      if (cmp) {
        push({
          id: `value_change:${cmp.from.id}:${cmp.to.id}`,
          kind: "value_change",
          source: "sucasa_snapshot",
          observedAt: cmp.to.capturedOn,
          fp: `${cmp.from.valueCents}>${cmp.to.valueCents}`,
          estimated: true,
          stale: isValuationStale(cmp.to.capturedOn, now),
          strength: isValuationStale(cmp.to.capturedOn, now) ? "weak" : cmp.strength,
          values: { pct: cmp.pct, days: cmp.days, from: cmp.from.capturedOn },
        });
      }
    }

    for (const l of ((listings.data ?? []) as any[]).filter((x) => x.portfolio_client_id === c.clientId)) {
      if (!l.status || l.status === "off_market") continue;
      const src = TEAM_LISTING_SOURCES.has(l.source) ? "your_team" : "historical_unknown";
      const obs = l.list_date ?? l.updated_at ?? null;
      push({
        id: `listing:${l.id}`,
        kind: "listing",
        source: src,
        observedAt: obs,
        fp: String(l.status),
        estimated: false,
        stale: false,
        strength: strengthFor("listing", { source: src, observedAt: obs }),
        values: { status: l.status },
      });
    }

    for (const o of ((outcomes.data ?? []) as any[]).filter((x) => x.portfolio_client_id === c.clientId && x.org_id === c.orgId).slice(0, 5)) {
      if (o.stage === "attempted" && !o.next_step) continue; // a tap is not an outcome
      push({
        id: `outcome:${o.id}`,
        kind: "call_outcome",
        source: "your_team",
        observedAt: o.occurred_at,
        fp: `${o.stage}:${o.next_step ?? ""}`,
        estimated: false,
        stale: false,
        strength: "strong",
        values: { stage: o.stage, nextStep: o.next_step ?? null, due: o.next_step_due_at ?? null },
      });
    }
    for (const cv of ((convs.data ?? []) as any[]).filter((x) => x.portfolio_client_id === c.clientId && x.org_id === c.orgId).slice(0, 3)) {
      push({
        id: `conversation:${cv.id}`,
        kind: "conversation",
        source: "your_team",
        observedAt: cv.created_at,
        fp: hashLite(cv.summary ?? ""),
        estimated: false,
        stale: false,
        strength: "strong",
        values: {
          summary: (cv.summary ?? "").slice(0, 240) || null,
          nextStep: cv.next_step ?? null,
          followUp: cv.follow_up_date ?? cv.follow_up_timeframe_text ?? null,
        },
      });
    }
    for (const r of ((requests.data ?? []) as any[])) {
      if (r.homeowner_id !== c.homeownerId || r.recipient_org_id !== c.orgId || r.revoked_at) continue;
      push({
        id: `request:${r.id}`,
        kind: "connection_request",
        source: "homeowner",
        observedAt: r.granted_at,
        fp: "granted",
        estimated: false,
        stale: false,
        strength: "strong",
        values: {},
      });
    }

    out.set(c.clientId, facts);
  }
  return out;
}

function hashLite(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
}

export async function readFeedback(
  supabase: any,
  ctxs: ClientContext[],
): Promise<Map<string, Map<SignalType, FeedbackRecord[]>>> {
  const out = new Map<string, Map<SignalType, FeedbackRecord[]>>();
  if (!ctxs.length) return out;
  const { data } = await supabase
    .from("signal_feedback")
    .select("org_id, portfolio_client_id, signal_type, action, evidence_version, disputed_facts")
    .in("portfolio_client_id", ctxs.map((c) => c.clientId))
    .in("org_id", [...new Set(ctxs.map((c) => c.orgId))]);
  const orgOf = new Map(ctxs.map((c) => [c.clientId, c.orgId]));
  for (const r of (data ?? []) as any[]) {
    if (orgOf.get(r.portfolio_client_id) !== r.org_id) continue;
    const m = out.get(r.portfolio_client_id) ?? new Map();
    const list = m.get(r.signal_type) ?? [];
    list.push({ action: r.action, evidenceVersion: r.evidence_version, facts: r.disputed_facts ?? [] });
    m.set(r.signal_type, list);
    out.set(r.portfolio_client_id, m);
  }
  return out;
}

export interface SignalHistoryResult {
  allowed: boolean;
  signals: Signal[];
  hiddenCount: number;
  engagementSummary: string | null;
}

export async function signalHistoryFor(
  supabase: any,
  userId: string,
  audience: Audience,
  clientIds: string[],
): Promise<Map<string, SignalHistoryResult>> {
  const ctxMap = await resolveContexts(supabase, userId, audience, clientIds);
  const ctxs = [...ctxMap.values()];
  const [evidence, feedback] = await Promise.all([buildEvidence(ctxs), readFeedback(supabase, ctxs)]);
  const out = new Map<string, SignalHistoryResult>();
  for (const id of clientIds) {
    const ctx = ctxMap.get(id);
    if (!ctx) {
      out.set(id, { allowed: false, signals: [], hiddenCount: 0, engagementSummary: null });
      continue;
    }
    const all = groupSignals(evidence.get(id) ?? []);
    const fb = feedback.get(id);
    const shown = all.filter((s) => !isSuppressed(s, fb?.get(s.type) ?? []));
    out.set(id, {
      allowed: true,
      signals: shown,
      hiddenCount: all.length - shown.length,
      engagementSummary: ctx.engagementLine,
    });
  }
  return out;
}

export { fingerprints };
export type { EvidenceKind };
