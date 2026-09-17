/**
 * Free Lender Opportunity Discovery — server side.
 *
 * Discovery is a real production flow, not a demo. It uses exactly the same
 * canonical machinery as the paid product:
 *
 *   • the shared property record and its enrichment queue (one home = one
 *     property, so a second organization never pays for the same address),
 *   • the canonical opportunity engine (`computeForPortfolio`), and
 *   • the canonical lender access gate (`readLenderWorkspace`).
 *
 * Nothing here scores, values, or ranks anything of its own, and no homeowner
 * or property fact is copied into the Discovery tables.
 */

import {
  DISCOVERY_ALLOWANCE,
  planIntake,
  propertyKey,
  rankClients,
  revealSelection,
  summarize,
  type CandidateOpportunity,
  type DiscoverySummary,
  type RankedClient,
} from "./discovery";

function admin() {
  // Imported lazily by callers; see functions module.
  throw new Error("use adminClient()");
}
void admin;

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

const DISCOVERY_BOOK_NAME = "Past clients (Discovery)";

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export interface DiscoveryWorkspace {
  orgId: string;
  orgName: string;
  portfolioId: string;
  discoveryId: string;
}

/**
 * Idempotent: one lender organization, one Discovery book, one Discovery run
 * per organization. Signing in again never creates a second of anything, and
 * never grants access to any homeowner.
 */
export async function ensureDiscoveryWorkspace(
  userId: string,
  opts: { email?: string | null; companyName?: string | null } = {},
): Promise<DiscoveryWorkspace> {
  const db = await adminClient();

  // Existing lender membership wins — never create a duplicate organization.
  const { data: memberships } = await db
    .from("lender_members")
    .select("lender_org_id, lender_orgs(id, name, org_type)")
    .eq("user_id", userId);
  const mine = (memberships ?? []).filter((m: any) => m.lender_orgs?.org_type === "lender");

  let orgId: string | null = mine[0]?.lender_org_id ?? null;
  let orgName: string = mine[0]?.lender_orgs?.name ?? "";

  if (!orgId) {
    const { data: profile } = await db
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();
    const fallback =
      (opts.companyName ?? "").trim() ||
      ((profile as any)?.full_name ?? "").trim() ||
      ((opts.email ?? (profile as any)?.email ?? "").split("@")[0] ?? "").trim() ||
      "My book";
    orgName = fallback;

    const { data: org, error } = await db
      .from("lender_orgs")
      .insert({
        name: orgName,
        org_type: "lender",
        primary_contact_email: opts.email ?? (profile as any)?.email ?? null,
        // The free Discovery allowance. Not a paid plan and not an activation.
        profile_allowance: DISCOVERY_ALLOWANCE,
        discovery_state: "discovery_not_started",
      })
      .select("id, name")
      .single();
    if (error) throw new Error(error.message);
    orgId = (org as any).id as string;
    orgName = (org as any).name as string;

    await db
      .from("lender_members")
      .insert({ lender_org_id: orgId, user_id: userId, role: "owner" });
  }

  await db.from("user_roles").insert({ user_id: userId, role: "lender" }).then(
    () => undefined,
    () => undefined,
  );

  // Discovery book
  const { data: books } = await db
    .from("lender_portfolios")
    .select("id, name")
    .eq("lender_org_id", orgId)
    .order("created_at", { ascending: true });
  let portfolioId: string | null =
    (books ?? []).find((b: any) => b.name === DISCOVERY_BOOK_NAME)?.id ??
    (books ?? [])[0]?.id ??
    null;
  if (!portfolioId) {
    const { data: book, error } = await db
      .from("lender_portfolios")
      .insert({
        lender_org_id: orgId,
        name: DISCOVERY_BOOK_NAME,
        assigned_user_id: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    portfolioId = (book as any).id as string;
  }

  // Discovery run (one per org — enforced by a unique index too)
  const { data: existing } = await db
    .from("lender_discoveries")
    .select("id")
    .eq("org_id", orgId)
    .maybeSingle();
  let discoveryId = (existing as any)?.id as string | undefined;
  if (!discoveryId) {
    const { data: run, error } = await db
      .from("lender_discoveries")
      .insert({
        org_id: orgId,
        portfolio_id: portfolioId,
        created_by: userId,
        status: "awaiting_upload",
        allowance: DISCOVERY_ALLOWANCE,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    discoveryId = (run as any).id as string;
  }

  return { orgId: orgId!, orgName, portfolioId: portfolioId!, discoveryId: discoveryId! };
}

// ---------------------------------------------------------------------------
// Abuse signals — never a block on email domain alone
// ---------------------------------------------------------------------------

/**
 * A privacy-safe fingerprint of the uploaded property set. Addresses are
 * hashed, never stored here, so two Discovery runs can be compared for reuse
 * without keeping a second copy of anybody's address.
 */
export async function propertySetHash(keys: string[]): Promise<string> {
  const { createHash } = await import("crypto");
  const sorted = [...new Set(keys)].sort();
  return createHash("sha256").update(sorted.join("\n")).digest("hex");
}

export interface RiskFlags {
  /** An identical property set was already given a free Discovery. */
  duplicate_property_set?: boolean;
  /** Same signed-in person already ran a Discovery for another organization. */
  repeat_user?: boolean;
  /** Other organizations share this email domain. A signal only — never a block. */
  shared_email_domain?: boolean;
  shared_domain_orgs?: number;
}

/**
 * Risk signals for review. Corporate domains are shared by many loan officers,
 * so a domain match is recorded as context and never used to block or limit
 * anyone on its own.
 */
export async function assessRisk(input: {
  orgId: string;
  userId: string;
  email?: string | null;
  hash: string;
}): Promise<RiskFlags> {
  const db = await adminClient();
  const flags: RiskFlags = {};

  const { data: sameSet } = await db
    .from("lender_discoveries")
    .select("id, org_id")
    .eq("property_set_hash", input.hash)
    .neq("org_id", input.orgId)
    .limit(1);
  if ((sameSet ?? []).length) flags.duplicate_property_set = true;

  const { data: byUser } = await db
    .from("lender_discoveries")
    .select("id, org_id")
    .eq("created_by", input.userId)
    .neq("org_id", input.orgId)
    .limit(1);
  if ((byUser ?? []).length) flags.repeat_user = true;

  const domain = (input.email ?? "").split("@")[1]?.toLowerCase() ?? "";
  if (domain) {
    const { data: sameDomain } = await db
      .from("lender_orgs")
      .select("id")
      .ilike("primary_contact_email", `%@${domain}`)
      .neq("id", input.orgId)
      .limit(50);
    const n = (sameDomain ?? []).length;
    if (n > 0) {
      flags.shared_email_domain = true;
      flags.shared_domain_orgs = n;
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Intake
// ---------------------------------------------------------------------------

export interface IntakeOutcome {
  discoveryId: string;
  accepted: number;
  excluded: { invalid: number; duplicate: number; overAllowance: number };
  submitted: number;
}

/**
 * Take a lender's export, spend the allowance on valid unique properties, and
 * hand the accepted addresses to the shared enrichment queue.
 */
export async function intakeDiscoveryCsv(input: {
  userId: string;
  discoveryId: string;
  portfolioId: string;
  orgId: string;
  email?: string | null;
  csv: string;
}): Promise<IntakeOutcome> {
  const db = await adminClient();
  const { parseClientCsv } = await import("./lender.server");
  const rows = parseClientCsv(input.csv);

  const { data: existingClients } = await db
    .from("lender_portfolio_clients")
    .select("address_line1, city, state, zip")
    .eq("portfolio_id", input.portfolioId);
  const existingKeys = (existingClients ?? []).map((c: any) =>
    propertyKey({
      full_name: "x",
      address: c.address_line1 ?? "",
      city: c.city,
      state: c.state,
      zip: c.zip,
    }),
  );

  const { accepted, accounting } = planIntake(rows as any[], {
    allowance: DISCOVERY_ALLOWANCE,
    existingKeys,
  });

  if (accepted.length) {
    const payload = accepted.map((r: any) => ({
      portfolio_id: input.portfolioId,
      client_name: r.full_name,
      client_email: r.email ?? null,
      client_phone: r.phone ?? null,
      address_line1: r.address,
      city: r.city ?? null,
      state: r.state ?? null,
      zip: r.zip ?? null,
      loan_amount_at_close_cents: r.loan_balance_cents ?? null,
      rate_at_close:
        r.interest_rate_bps != null ? Number((r.interest_rate_bps / 100).toFixed(3)) : null,
      close_date: r.close_date ?? null,
      notes: r.note ?? null,
    }));
    const { error } = await db.from("lender_portfolio_clients").insert(payload);
    if (error) throw new Error(error.message);
  }

  const hash = await propertySetHash(accepted.map((r: any) => propertyKey(r)));
  const risk = await assessRisk({
    orgId: input.orgId,
    userId: input.userId,
    email: input.email,
    hash,
  });

  await db
    .from("lender_discoveries")
    .update({
      status: accepted.length ? "processing" : "awaiting_upload",
      submitted_rows: accounting.submitted,
      invalid_rows: accounting.invalid,
      duplicate_rows: accounting.duplicate,
      over_allowance_rows: accounting.overAllowance,
      unique_properties: accepted.length,
      property_set_hash: hash,
      risk_flags: risk,
      started_at: new Date().toISOString(),
    })
    .eq("id", input.discoveryId);

  if (accepted.length) {
    await db
      .from("lender_orgs")
      .update({ discovery_state: "discovery_processing" })
      .eq("id", input.orgId);
  }

  return {
    discoveryId: input.discoveryId,
    accepted: accepted.length,
    submitted: accounting.submitted,
    excluded: {
      invalid: accounting.invalid,
      duplicate: accounting.duplicate,
      overAllowance: accounting.overAllowance,
    },
  };
}

// ---------------------------------------------------------------------------
// Processing and finalization
// ---------------------------------------------------------------------------

/** Internal-only cost assumption, in ten-thousandths of a dollar. */
export async function costPerPropertyTenThousandths(): Promise<number> {
  const db = await adminClient();
  const { data } = await db
    .from("platform_config")
    .select("value_int")
    .eq("key", "discovery_enrichment_cost_per_property")
    .maybeSingle();
  return (data as any)?.value_int ?? 155;
}

/**
 * Compute the canonical opportunities for the Discovery book, then record the
 * snapshot: which client, which primary reason, what rank, and whether it was
 * unlocked. References only — the canonical rows stay the source of truth.
 */
export async function finalizeDiscovery(input: {
  discoveryId: string;
  portfolioId: string;
  orgId: string;
}): Promise<{ summary: DiscoverySummary; ranked: RankedClient[] }> {
  const db = await adminClient();
  const { persistPortfolioOpportunities, listPortfolioOpportunityRows } = await import(
    "./opportunities.server"
  );

  await persistPortfolioOpportunities(db, input.portfolioId, input.orgId);
  const { opportunities } = await listPortfolioOpportunityRows(db, input.portfolioId);

  const candidates: CandidateOpportunity[] = (opportunities ?? []).map((o: any) => ({
    id: o.id,
    portfolioClientId: o.portfolio_client_id ?? o.client_id ?? o.clientId,
    category: o.category,
    strength: o.strength,
    score: o.score ?? 0,
    valueCents: o.signals?.value_cents ?? null,
    valueConfidence: o.value_confidence ?? o.signals?.value_confidence ?? null,
  }));

  const ranked = rankClients(candidates.filter((c) => c.portfolioClientId));
  const revealed = new Set(revealSelection(ranked).map((r) => r.portfolioClientId));

  const { count: analyzed } = await db
    .from("lender_portfolio_clients")
    .select("id", { count: "exact", head: true })
    .eq("portfolio_id", input.portfolioId)
    .is("archived_at", null);

  const summary = summarize(analyzed ?? 0, ranked);

  await db.from("lender_discovery_results").delete().eq("discovery_id", input.discoveryId);
  if (ranked.length) {
    await db.from("lender_discovery_results").insert(
      ranked.map((r) => ({
        discovery_id: input.discoveryId,
        portfolio_client_id: r.portfolioClientId,
        opportunity_id: r.opportunityId,
        primary_category: r.primaryCategory,
        primary_group: r.primaryGroup,
        score: r.score,
        rank: r.rank,
        revealed: revealed.has(r.portfolioClientId),
      })),
    );
  }

  // Internal-only cost tracking.
  const perProperty = await costPerPropertyTenThousandths();
  const { count: calls } = await db
    .from("batchdata_call_log")
    .select("id", { count: "exact", head: true })
    .eq("cache_hit", false)
    .gte("created_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString());

  await db
    .from("lender_discoveries")
    .update({
      status: "complete",
      properties_matched: summary.clientsWithOpportunities,
      properties_unresolved: Math.max(0, (analyzed ?? 0) - ranked.length),
      opportunity_clients: ranked.length,
      revealed_count: revealed.size,
      provider_calls: calls ?? 0,
      provider_cost_ten_thousandths: (analyzed ?? 0) * perProperty,
      completed_at: new Date().toISOString(),
    })
    .eq("id", input.discoveryId);

  await db
    .from("lender_orgs")
    .update({ discovery_state: "discovery_complete" })
    .eq("id", input.orgId);

  return { summary, ranked };
}
