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
  propertyKey,
  rankClients,
  reviewGroupOf,
  revealSelection,
  summarize,
  type CandidateOpportunity,
  type DiscoverySummary,
  type RankedClient,
} from "./discovery";

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

  // If this officer already owns an assigned book, that book's organization is
  // the canonical one — concurrent sign-in events then converge on one org.
  const { data: ownedBook } = await db
    .from("lender_portfolios")
    .select("lender_org_id")
    .eq("assigned_user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const preferred =
    mine.find((m: any) => m.lender_org_id === (ownedBook as any)?.lender_org_id) ?? mine[0];

  let orgId: string | null = preferred?.lender_org_id ?? null;
  let orgName: string = (preferred as any)?.lender_orgs?.name ?? "";


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

  // Discovery book. A loan officer may hold at most one assigned portfolio
  // (partial unique index uniq_lender_portfolio_per_officer), so an already
  // assigned book is always reused instead of inserting a second one.
  const { data: books } = await db
    .from("lender_portfolios")
    .select("id, name")
    .eq("lender_org_id", orgId)
    .eq("assigned_user_id", userId)
    .order("created_at", { ascending: true });
  let portfolioId: string | null =
    (books ?? []).find((b: any) => b.name === DISCOVERY_BOOK_NAME)?.id ??
    (books ?? [])[0]?.id ??
    null;
  if (!portfolioId) {
    const { data: assigned } = await db
      .from("lender_portfolios")
      .select("id")
      .eq("assigned_user_id", userId)
      .eq("lender_org_id", orgId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    portfolioId = (assigned as any)?.id ?? null;
  }
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
    if (error) {
      // Concurrent sign-in events can race here; fall back to the book the
      // other request just created rather than surfacing a constraint error.
      const { data: raced } = await db
        .from("lender_portfolios")
        .select("id")
        .eq("assigned_user_id", userId)
        .eq("lender_org_id", orgId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      portfolioId = (raced as any)?.id ?? null;
      if (!portfolioId) throw new Error(error.message);
    } else {
      portfolioId = (book as any).id as string;
    }
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
  contactsSaved: number;
  excluded: { invalid: number; duplicate: number; overAllowance: number; suppressed: number; failed: number };
  submitted: number;
  rows: import("./discovery-rows").DiscoveryRowResult[];
}

/**
 * Save one Discovery upload into the caller's own book. Every file row gets an
 * outcome. Addressed rows become homes (existing enrichment path, free
 * allowance); phone/email-only rows are kept as contacts through the shared
 * stage_mixed_upload RPC (own-book check, no capacity, no lookup). Retries
 * dedupe against the book, so nothing is saved or looked up twice.
 */
export async function saveDiscoveryRows(
  db: any,
  input: { userId: string; portfolioId: string; csv: string; allowance?: number },
) {
  const { parseUploadCsv, addressKey } = await import("./upload-intake");
  const { classifyDiscoveryRows, splitCombinedAddress, contactKey } = await import("./discovery-rows");
  const { rows: rawRows } = parseUploadCsv(input.csv);
  const rows = rawRows.map(splitCombinedAddress);

  const pageAll = async (table: string, cols: string, build: (q: any) => any) => {
    const out: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await build(db.from(table).select(cols)).range(from, from + 999);
      if (error) throw new Error(error.message);
      out.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return out;
  };
  const [clients, staged] = await Promise.all([
    pageAll("lender_portfolio_clients", "address_line1, city, state, zip, client_email, client_phone",
      (q) => q.eq("portfolio_id", input.portfolioId).is("archived_at", null)),
    pageAll("upload_staged_rows", "identity_key",
      (q) => q.eq("book_id", input.portfolioId).in("outcome", ["contact_only", "waiting_capacity"]).is("promoted_at", null)),
  ]);
  const existingPropertyKeys: string[] = [];
  const existingContactKeys: string[] = [];
  for (const c of clients) {
    existingPropertyKeys.push(propertyKey({ full_name: "x", address: c.address_line1 ?? "", city: c.city, state: c.state, zip: c.zip }));
    const ck = contactKey({ rowNumber: 0, name: "", address: "", city: null, state: null, zip: null,
      email: c.client_email, phone: c.client_phone, loanBalanceCents: null, interestRateBps: null });
    if (ck) existingContactKeys.push(ck);
  }
  for (const s of staged) if (s.identity_key) existingContactKeys.push(s.identity_key);

  const { partitionSuppressed } = await import("./suppression.server");
  const { suppressed } = await partitionSuppressed(db, rows, (r: any) => ({
    email: r.email ?? null, phone: r.phone ?? null, street: r.address || null, zip: r.zip ?? null,
  }));
  const results = classifyDiscoveryRows({
    rows, existingPropertyKeys, existingContactKeys,
    suppressedRows: new Set(suppressed.map((r: any) => r.rowNumber)),
    allowance: input.allowance ?? DISCOVERY_ALLOWANCE,
  });
  const byNum = new Map(rows.map((r) => [r.rowNumber, r]));
  const homes = results.filter((r) => r.outcome === "property_saved");
  const contacts = results.filter((r) => r.outcome === "contact_saved");
  const fail = (list: typeof results, why: string) => {
    for (const r of list) { r.outcome = "failed"; r.reason = why; }
  };

  if (homes.length) {
    const payload = homes.map((h) => {
      const r = byNum.get(h.row)!;
      return {
        portfolio_id: input.portfolioId,
        client_name: r.name,
        client_email: r.email ?? null,
        client_phone: r.phone ?? null,
        address_line1: r.address,
        city: r.city ?? null,
        state: r.state ?? null,
        zip: r.zip ?? null,
        loan_amount_at_close_cents: r.loanBalanceCents ?? null,
        rate_at_close: r.interestRateBps != null ? Number((r.interestRateBps / 100).toFixed(3)) : null,
      };
    });
    const { error } = await db.from("lender_portfolio_clients").insert(payload);
    if (error) fail(homes, `Not saved: ${error.message}`);
  }

  if (contacts.length) {
    const p_rows = contacts.map((c, i) => {
      const r = byNum.get(c.row)!;
      return {
        row_number: i + 1,
        outcome: "contact_only",
        identity_key: contactKey(r),
        cached: false,
        payload: { name: r.name || null, address: null, city: r.city, state: r.state, zip: r.zip,
          email: r.email, phone: r.phone, source_row: c.row, source: "lender_discovery",
          address_key: addressKey(r) },
      };
    });
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`discovery-contacts\n${input.csv}`));
    const sha = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const { data, error } = await db.rpc("stage_mixed_upload", {
      p_book: input.portfolioId, p_actor: input.userId, p_file_sha256: sha, p_flow: "lender", p_rows,
    });
    if (error) fail(contacts, `Not saved: ${error.message}`);
    else if ((data as any)?.counts?.already_uploaded) {
      // The database found some already kept; never report them as new.
      const { data: kept } = await db.from("upload_staged_rows").select("row_number, outcome")
        .eq("batch_id", (data as any).batch_id);
      const dupRows = new Set(((kept ?? []) as any[]).filter((k) => k.outcome === "already_uploaded").map((k) => k.row_number));
      contacts.forEach((c, i) => {
        if (dupRows.has(i + 1)) { c.outcome = "duplicate"; c.reason = "This contact is already in your book."; }
      });
    }
  }

  return { results, homeRows: homes.filter((h) => h.outcome === "property_saved").map((h) => byNum.get(h.row)!) };
}

export async function intakeDiscoveryCsv(input: {
  userId: string;
  discoveryId: string;
  portfolioId: string;
  orgId: string;
  email?: string | null;
  csv: string;
}): Promise<IntakeOutcome> {
  const db = await adminClient();
  const { countOutcomes } = await import("./discovery-rows");
  const { results, homeRows } = await saveDiscoveryRows(db, {
    userId: input.userId, portfolioId: input.portfolioId, csv: input.csv,
  });
  const n = countOutcomes(results);
  const keys = homeRows.map((r) => propertyKey({ full_name: r.name, address: r.address, city: r.city, state: r.state, zip: r.zip }));

  const hash = await propertySetHash(keys);
  const risk = await assessRisk({ orgId: input.orgId, userId: input.userId, email: input.email, hash });

  await db
    .from("lender_discoveries")
    .update({
      // A contact-only follow-up upload must not reset finished results.
      ...(homeRows.length ? { status: "processing" } : {}),
      submitted_rows: results.length,
      invalid_rows: n.unusable,
      duplicate_rows: n.duplicate,
      over_allowance_rows: n.over_allowance,
      unique_properties: homeRows.length,
      property_set_hash: hash,
      risk_flags: { ...risk, last_upload: { contacts_saved: n.contact_saved, suppressed: n.suppressed, failed: n.failed } },
      started_at: new Date().toISOString(),
    })
    .eq("id", input.discoveryId);

  if (homeRows.length) {
    await db.from("lender_orgs").update({ discovery_state: "discovery_processing" }).eq("id", input.orgId);
  }

  return {
    discoveryId: input.discoveryId,
    accepted: homeRows.length,
    contactsSaved: n.contact_saved,
    submitted: results.length,
    excluded: { invalid: n.unusable, duplicate: n.duplicate, overAllowance: n.over_allowance, suppressed: n.suppressed, failed: n.failed },
    rows: results,
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
  /**
   * Reads each client's top lender review (type) AFTER opportunities are
   * persisted — the same classification the lender cards and Today use.
   */
  readTopReviews?: () => Promise<Map<string, string>>;
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

  let ranked = rankClients(candidates.filter((c) => c.portfolioClientId));
  if (input.readTopReviews) {
    // One classification source: the client's top lender review. A client with
    // a canonical opportunity but no review a lender may see is not counted —
    // it would render as an unexplained card.
    const top = await input.readTopReviews();
    ranked = ranked
      .filter((r) => top.has(r.portfolioClientId))
      .map((r, i) => {
        const type = top.get(r.portfolioClientId)!;
        return { ...r, primaryCategory: type, primaryGroup: reviewGroupOf(type), rank: i + 1 };
      });
  }
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
