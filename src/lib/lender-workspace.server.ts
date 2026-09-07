/**
 * Lender workspace reads — server only.
 *
 * Everything a lender sees by name passes through `classifyLenderAccess` here,
 * so no route, component or legacy caller can widen access on its own. The gate
 * runs once, produces an access map, and every downstream list is filtered by
 * that map before it leaves the server.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  classifyLenderAccess,
  channelDecision,
  allowedChannels,
  hasScope,
  
  REVIEW_TYPES,
  supportsReview,
  type ChannelPermissionRecord,
  type LenderAccess,
  type PermittedRankingInput,
  type ReviewType,
} from "@/lib/lender-access";
import { monthsBetween, remainingBalanceCents, estimatedValueCents } from "@/lib/opportunities";
import {
  centsFromCents,
  centsFromDollars,
  formatMoney,
  subtractCents,
  type Cents,
} from "@/lib/money";
import {
  compareDaily,
  nextStepFor,
  objectiveFor,
  openerFor,
  SUPPRESSED_STAGES,
  urgencyFor,
  rankScore as dailyRankScore,
  type OutcomeStage,
  type Temperature,
} from "@/lib/lender-daily";

const admin = () => supabaseAdmin as any;
const DAY = 864e5;

/** Legacy opportunity categories → lender review vocabulary. */
const CATEGORY_TO_REVIEW: Record<string, ReviewType> = {
  equity: "equity_review",
  heloc: "home_equity_conversation",
  refinance_review: "refinance_review",
  mortgage_review: "mortgage_checkup",
  mortgage_age: "mortgage_checkup",
  move_up: "move_planning",
  market_timing: "move_planning",
  home_condition: "improvement_planning",
  permit_activity: "property_change",
  free_and_clear: "home_equity_conversation",
  recent_purchase: "ownership_anniversary",
  investment: "move_planning",
  distress: "property_change",
};

export interface LenderClientRow {
  id: string;
  portfolioId: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  homeownerId: string | null;
  access: LenderAccess;
  permissions: ChannelPermissionRecord | null;
  channels: { call: boolean; text: boolean; email: boolean };
  channelReasons: Record<string, string>;
  /** Canonical cents. Normalized at the source adapter — never re-scaled downstream. */
  estimatedValueCents: Cents | null;
  /** Where the value came from: a cached property record, or a loan-derived estimate. */
  valueSource: "property_record" | "loan_estimate";
  /** Plain-language reason when the numbers can't be shown for this record. */
  dataGap: string | null;

  estimatedBalanceCents: Cents | null;
  estimatedEquityCents: Cents | null;
  estimatedLtvPct: number | null;
  loanAgeYears: number | null;
  tenureYears: number | null;
  lastContactAt: string | null;
  engagedRecently: boolean;
  engagementLine: string | null;
  askedToConnect: boolean;
  annualReviewDue: boolean;
  reviews: ReviewCard[];
  priority: number;
  band: Temperature;

  // --- Daily workflow -------------------------------------------------------
  /** Urgency label. Explains the recommendation; never reorders the list. */
  temperature: Temperature;
  urgencyReason: string;
  /** Where the existing priority engine places them, after contactability. */
  rank: number;
  contactable: boolean;
  /** One line: why this person, why today. */
  whyToday: string;
  /** What this outreach is for. */
  objective: string;
  /** What SuCasa recommends doing. */
  recommendedAction: string;
  /** What to say first. */
  opener: string;
  /** Administrative step SuCasa scheduled after the last recorded outcome. */
  openNextStep: { label: string; dueAt: string | null; overdueDays: number | null } | null;
  lastOutcome: { stage: string; occurredAt: string } | null;
  cadence: "active" | "in_process" | "post_close" | "paused";
}

export interface ReviewCard {
  id: string;
  type: ReviewType;
  label: string;
  blurb: string;
  action: string;
  reasonCodes: string[];
  sourceFields: PermittedRankingInput[];
  why: string[];
  priority: number;
}

/** Resolve the lender org(s) and books this user may work in. */
export async function lenderScope(supabase: any, userId: string, orgId?: string | null) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  let orgIds: string[] = [];
  let isManager = Boolean(isAdmin);

  const { data: members } = await supabase
    .from("lender_members")
    .select("lender_org_id, role, lender_orgs(id, org_type, name)")
    .eq("user_id", userId);
  const mine = (members ?? []).filter((m: any) => m.lender_orgs?.org_type === "lender");
  if (mine.length) {
    orgIds = mine.map((m: any) => m.lender_org_id);
    isManager = isManager || mine.some((m: any) => ["owner", "admin", "manager"].includes(m.role));
  } else if (isAdmin) {
    const { data } = await supabase.from("lender_orgs").select("id").eq("org_type", "lender").limit(1);
    orgIds = (data ?? []).map((o: any) => o.id);
  }
  if (orgId) orgIds = orgIds.filter((o) => o === orgId);
  if (!orgIds.length) return null;

  const { data: books } = await admin()
    .from("lender_portfolios")
    .select("id, name, lender_org_id, assigned_user_id")
    .in("lender_org_id", orgIds);
  const visible = (books ?? []).filter(
    (b: any) => isManager || !b.assigned_user_id || b.assigned_user_id === userId,
  );
  const { data: org } = await admin()
    .from("lender_orgs")
    .select("id, name")
    .eq("id", orgIds[0])
    .maybeSingle();

  return {
    orgIds,
    orgId: orgIds[0] as string,
    orgName: org?.name ?? "Your team",
    books: visible.map((b: any) => ({ id: b.id, name: b.name })),
    bookIds: visible.map((b: any) => b.id) as string[],
    isManager,
  };
}

/**
 * The single gated read. Returns every homeowner the lender may see by name,
 * plus aggregate-only counts for those it may not.
 */
export async function readLenderWorkspace(
  supabase: any,
  userId: string,
  opts: { orgId?: string | null } = {},
) {
  const scope = await lenderScope(supabase, userId, opts.orgId ?? null);
  if (!scope) return null;

  const [{ data: clients }, { data: consents }, { data: sponsorships }, { data: agentLinks }] =
    await Promise.all([
      scope.bookIds.length
        ? admin()
            .from("lender_portfolio_clients")
            .select(
              "id, portfolio_id, client_name, client_email, client_phone, address_line1, city, state, zip, homeowner_id, archived_at, relationship_basis, contact_marketing_permission, intelligence_access_scope, loan_amount_at_close_cents, rate_at_close, term_months, close_date, created_at",
            )
            .in("portfolio_id", scope.bookIds)
        : Promise.resolve({ data: [] }),
      admin()
        .from("consent_records")
        .select("id, homeowner_id, consent_type, scope, status, granted_at, context")
        .eq("recipient_org_id", scope.orgId)
        .eq("status", "granted")
        .limit(1000),
      admin()
        .from("premium_sponsorships")
        .select("id, homeowner_id, portfolio_client_id, status")
        .eq("lender_org_id", scope.orgId)
        .limit(1000),
      admin()
        .from("agent_lender_connections")
        .select("id, agent_org_id, status")
        .eq("lender_org_id", scope.orgId)
        .limit(500),
    ]);

  const rows = ((clients ?? []) as any[]).filter((c) => !c.archived_at);
  const archivedCount = ((clients ?? []) as any[]).length - rows.length;
  const clientIds = rows.map((c) => c.id);

  // Consent, sponsorship and agent-relationship lookups.
  const requestByHomeowner = new Map<string, any>();
  const intelByHomeowner = new Map<string, any>();
  for (const c of (consents ?? []) as any[]) {
    if (c.consent_type === "connection_request" && !requestByHomeowner.has(c.homeowner_id))
      requestByHomeowner.set(c.homeowner_id, c);
    if (c.consent_type === "intelligence_access" && !intelByHomeowner.has(c.homeowner_id))
      intelByHomeowner.set(c.homeowner_id, c);
  }
  const sponsoredClientIds = new Set(
    ((sponsorships ?? []) as any[]).filter((s) => s.status === "active").map((s) => s.portfolio_client_id),
  );
  const sponsoredHomeownerIds = new Set(
    ((sponsorships ?? []) as any[]).filter((s) => s.status === "active").map((s) => s.homeowner_id),
  );
  const agentConnected = ((agentLinks ?? []) as any[]).some((a) => a.status === "active");

  const [{ data: perms }, { data: opps }, { data: events }, { data: messages }, { data: outcomes }, { data: delivery }] =
    await Promise.all([
      clientIds.length
        ? admin().from("outreach_channel_permissions").select("*").in("portfolio_client_id", clientIds)
        : Promise.resolve({ data: [] }),
      clientIds.length
        ? admin()
            .from("homeowner_opportunities")
            .select("id, portfolio_client_id, category, strength, score, reasons, reason_codes, source_fields, state")
            .in("portfolio_client_id", clientIds)
            .eq("state", "open")
            .order("score", { ascending: false })
            .limit(1000)
        : Promise.resolve({ data: [] }),
      clientIds.length
        ? admin()
            .from("outreach_events")
            .select("portfolio_client_id, event, occurred_at")
            .in("portfolio_client_id", clientIds)
            .gte("occurred_at", new Date(Date.now() - 30 * DAY).toISOString())
        : Promise.resolve({ data: [] }),
      clientIds.length
        ? admin()
            .from("outreach_messages")
            .select("portfolio_client_id, sent_at, created_at")
            .in("portfolio_client_id", clientIds)
            .order("created_at", { ascending: false })
            .limit(1000)
        : Promise.resolve({ data: [] }),
      clientIds.length
        ? admin()
            .from("opportunity_outcomes")
            .select("portfolio_client_id, stage, occurred_at, next_step, next_step_due_at")
            .in("portfolio_client_id", clientIds)
            .order("occurred_at", { ascending: false })
            .limit(1000)
        : Promise.resolve({ data: [] }),
      admin()
        .from("service_delivery_events")
        .select("event_type, quantity, created_at")
        .eq("org_id", scope.orgId)
        .gte("created_at", new Date(Date.now() - 30 * DAY).toISOString())
        .limit(3000),
    ]);

  const permByClient = new Map(((perms ?? []) as any[]).map((p) => [p.portfolio_client_id, p]));
  const oppsByClient = new Map<string, any[]>();
  for (const o of (opps ?? []) as any[]) {
    const list = oppsByClient.get(o.portfolio_client_id) ?? [];
    list.push(o);
    oppsByClient.set(o.portfolio_client_id, list);
  }
  const engagement = new Map<string, string>();
  for (const e of (events ?? []) as any[]) {
    if (!["open", "click", "reply", "app_activity"].includes(e.event)) continue;
    if (Date.now() - new Date(e.occurred_at).getTime() > 14 * DAY) continue;
    if (!engagement.has(e.portfolio_client_id)) {
      engagement.set(
        e.portfolio_client_id,
        e.event === "reply"
          ? "Replied to your last message"
          : e.event === "click"
            ? "Opened and clicked their last update"
            : e.event === "open"
              ? "Opened their monthly Home Intelligence report"
              : "Active in their Home Profile",
      );
    }
  }
  const lastContact = new Map<string, string>();
  for (const m of (messages ?? []) as any[]) {
    const at = m.sent_at ?? m.created_at;
    if (at && !lastContact.has(m.portfolio_client_id)) lastContact.set(m.portfolio_client_id, at);
  }
  const workedClients = new Set(((outcomes ?? []) as any[]).map((o) => o.portfolio_client_id));
  const closedOrDeclined = new Set(
    ((outcomes ?? []) as any[])
      .filter((o) => o.stage === "closed" || o.stage === "not_interested")
      .map((o) => o.portfolio_client_id),
  );
  // Latest recorded outcome per homeowner drives cadence, prospecting
  // suppression and the open administrative follow-up.
  const lastOutcomeByClient = new Map<string, any>();
  for (const o of (outcomes ?? []) as any[]) {
    if (!lastOutcomeByClient.has(o.portfolio_client_id))
      lastOutcomeByClient.set(o.portfolio_client_id, o);
  }

  // --- Cached property records ----------------------------------------------
  // The same cache the agent side reads. No provider call is made here, so this
  // costs nothing extra; it just lets the lender see real value/mortgage facts
  // instead of a loan-derived estimate.
  const { normalizeAddress } = await import("@/lib/attom.server");
  const { extractAvm, extractTax, extractMortgage, estimateLoanBalance } = await import(
    "@/lib/valuation.server"
  );
  const addrKey = (c: any) =>
    normalizeAddress(
      [c.address_line1, c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    );
  const intelByAddress: Record<string, any> = {};
  const addrKeys = [...new Set(rows.map(addrKey).filter(Boolean))];
  for (let i = 0; i < addrKeys.length; i += 200) {
    const { data: hits } = await admin()
      .from("property_intel")
      .select("address_normalized, avm, tax, mortgage")
      .in("address_normalized", addrKeys.slice(i, i + 200));
    for (const h of (hits ?? []) as any[]) intelByAddress[h.address_normalized] = h;
  }

  // --- Per-homeowner classification + facts ---------------------------------
  const now = new Date();
  const visible: LenderClientRow[] = [];
  const aggregate = { sponsoredOnly: 0, agentConnectedOnly: 0, noBasis: 0 };

  for (const c of rows) {
    const request = c.homeowner_id ? requestByHomeowner.get(c.homeowner_id) : null;
    const intel = c.homeowner_id ? intelByHomeowner.get(c.homeowner_id) : null;
    const access = classifyLenderAccess({
      relationshipBasis: c.relationship_basis,
      intelligenceAccessScope: c.intelligence_access_scope,
      hasConnectionRequest: Boolean(request),
      connectionRequestScope: request?.scope ?? null,
      hasIntelligenceConsent: Boolean(intel),
      intelligenceConsentScope: intel?.scope ?? null,
      isSponsored:
        sponsoredClientIds.has(c.id) ||
        (c.homeowner_id ? sponsoredHomeownerIds.has(c.homeowner_id) : false),
      isAgentConnected: agentConnected,
    });

    if (!access.named) {
      if (access.category === "sponsored_only") aggregate.sponsoredOnly++;
      else if (access.category === "agent_connected_only") aggregate.agentConnectedOnly++;
      else aggregate.noBasis++;
      continue;
    }

    const months = monthsBetween(c.close_date, now);
    const term = c.term_months ?? 360;

    // --- Money normalization, at the source adapter --------------------------
    // Saved property records are whole dollars. Uploaded loan columns and the
    // opportunity helpers are already cents. Each is converted once, here, and
    // everything downstream works in canonical `Cents`.
    const record = intelByAddress[addrKey(c)] ?? null;
    const recAvm = record?.avm ? extractAvm(record.avm) : null;
    const recTax = record?.tax ? extractTax(record.tax) : null;
    const recMortgage = record?.mortgage ? extractMortgage(record.mortgage) : null;
    const recordValue = centsFromDollars(
      recAvm?.estimate ?? recTax?.marketTotal ?? recTax?.assessedTotal ?? null,
    );
    const recordBalance = centsFromDollars(
      recMortgage ? estimateLoanBalance(recMortgage) : null,
    );
    const valueSource = recordValue != null ? "property_record" : "loan_estimate";

    const balance = hasScope(access, "mortgage")
      ? (recordBalance ??
        centsFromCents(
          remainingBalanceCents(c.loan_amount_at_close_cents, c.rate_at_close, term, months),
        ))
      : null;
    const value = hasScope(access, "valuation")
      ? (recordValue ?? centsFromCents(estimatedValueCents(c.loan_amount_at_close_cents, months)))
      : null;
    const equity = hasScope(access, "equity") ? subtractCents(value, balance) : null;
    const ltv = value && balance ? Math.round((balance / value) * 1000) / 10 : null;
    const loanAgeYears = c.close_date ? Math.round((months / 12) * 10) / 10 : null;
    const tenureYears = loanAgeYears;
    const dataGap =
      value == null
        ? c.address_line1
          ? "No property record on file for this address yet."
          : "No address on this record yet."
        : null;


    const perm = (permByClient.get(c.id) ?? null) as ChannelPermissionRecord | null;
    const engagementLine = hasScope(access, "engagement") ? (engagement.get(c.id) ?? null) : null;
    const lastAt = lastContact.get(c.id) ?? null;

    const facts: Partial<Record<PermittedRankingInput, unknown>> = {
      estimated_value: value,
      estimated_mortgage_balance: balance,
      estimated_equity: equity,
      estimated_ltv: ltv,
      loan_age: loanAgeYears,
      tenure_years: tenureYears,
      homeowner_engagement: engagementLine,
      days_since_contact: lastAt ? Math.floor((Date.now() - new Date(lastAt).getTime()) / DAY) : null,
    };

    const reviews = buildReviews({
      clientId: c.id,
      legacy: oppsByClient.get(c.id) ?? [],
      facts,
      value,
      equity,
      ltv,
      loanAgeYears,
      tenureYears,
      engagementLine,
      askedToConnect: access.category === "asked_to_connect",
      worked: workedClients.has(c.id),
      daysSinceContact: facts.days_since_contact as number | null,
    });

    const priority = reviews[0]?.priority ?? (access.category === "asked_to_connect" ? 95 : 20);
    const contactDetail = {
      hasPhone: Boolean((c.client_phone ?? "").trim()),
      hasEmail: Boolean((c.client_email ?? "").trim()),
    };
    const channels = allowedChannels(perm, access, contactDetail);
    const channelReasons: Record<string, string> = {};
    for (const ch of ["call", "text", "email"] as const) {
      channelReasons[ch] = channelDecision(ch, perm, access, contactDetail).reason;
    }


    // --- Daily workflow ------------------------------------------------------
    const askedToConnect = access.category === "asked_to_connect";
    const contactable = channels.length > 0;
    const annualReviewDue = lastAt
      ? Date.now() - new Date(lastAt).getTime() > 365 * DAY
      : Boolean(c.close_date);

    const last = lastOutcomeByClient.get(c.id) ?? null;
    const lastStage = (last?.stage ?? null) as OutcomeStage | null;
    const plan = lastStage ? nextStepFor(lastStage) : null;
    const dueAt: string | null = last?.next_step_due_at ?? null;
    const overdueDays =
      dueAt && Date.now() > new Date(dueAt).getTime()
        ? Math.floor((Date.now() - new Date(dueAt).getTime()) / DAY)
        : null;
    const openNextStep =
      last && (last.next_step || plan)
        ? { label: last.next_step ?? plan!.nextStep, dueAt, overdueDays }
        : null;

    const { temperature, urgencyReason } = urgencyFor({
      askedToConnect,
      priority,
      daysSinceContact: facts.days_since_contact as number | null,
      followUpOverdueDays: overdueDays,
      annualReviewDue,
      engagedRecently: Boolean(engagementLine),
      hasReview: reviews.length > 0,
    });

    const topReview = reviews[0] ?? null;
    const whyToday = askedToConnect
      ? "They asked to connect through SuCasa."
      : (topReview?.why?.[0] ?? urgencyReason);

    visible.push({
      id: c.id,
      portfolioId: c.portfolio_id,
      name: c.client_name ?? "Homeowner",
      email: hasScope(access, "contact") ? (c.client_email ?? null) : null,
      phone: hasScope(access, "contact") ? (c.client_phone ?? null) : null,
      address: hasScope(access, "property_snapshot")
        ? [c.address_line1, c.city, c.state].filter(Boolean).join(", ") || null
        : null,
      homeownerId: c.homeowner_id ?? null,
      access,
      permissions: perm,
      channels: {
        call: channels.includes("call"),
        text: channels.includes("text"),
        email: channels.includes("email"),
      },
      channelReasons,
      estimatedValueCents: value,
      valueSource,
      dataGap,

      estimatedBalanceCents: balance,
      estimatedEquityCents: equity,
      estimatedLtvPct: ltv,
      loanAgeYears,
      tenureYears,
      lastContactAt: lastAt,
      engagedRecently: Boolean(engagementLine),
      engagementLine,
      askedToConnect,
      annualReviewDue,
      reviews,
      priority,
      band: temperature,

      temperature,
      urgencyReason,
      rank: dailyRankScore({ askedToConnect, contactable, priority }),
      contactable,
      whyToday,
      objective: objectiveFor(topReview?.type),
      recommendedAction: openNextStep?.label ?? topReview?.action ?? "Send their home update",
      opener: openerFor({
        firstName: (c.client_name ?? "").split(" ")[0] ?? "",
        askedToConnect,
        reviewType: topReview?.type ?? null,
      }),
      openNextStep,
      lastOutcome: last ? { stage: last.stage, occurredAt: last.occurred_at } : null,
      cadence: plan?.cadence ?? "active",
    });
  }

  visible.sort(compareDaily);

  const askedToConnect = visible
    .filter((v) => v.askedToConnect)
    .map((v) => {
      const req = v.homeownerId ? requestByHomeowner.get(v.homeownerId) : null;
      return {
        clientId: v.id,
        portfolioId: v.portfolioId,
        name: v.name,
        askedAbout: (req?.context as any)?.topic ?? "Asked to connect",
        note: (req?.context as any)?.note ?? null,
        requestedAt: req?.granted_at ?? null,
        authorized: (req?.scope ?? []) as string[],
        channels: v.channels,
        why: v.reviews[0]?.why ?? [],
      };
    });

  const deliveryCounts: Record<string, number> = {};
  for (const e of (delivery ?? []) as any[]) {
    deliveryCounts[e.event_type] = (deliveryCounts[e.event_type] ?? 0) + (e.quantity ?? 1);
  }

  // Prospecting is suppressed once a relationship is in a live workflow, but a
  // scheduled administrative step still surfaces — that is real work, not a pitch.
  const dueNow = (v: LenderClientRow) =>
    Boolean(v.openNextStep?.dueAt && new Date(v.openNextStep.dueAt).getTime() <= Date.now());
  const prospectingSuppressed = (v: LenderClientRow) =>
    Boolean(v.lastOutcome && SUPPRESSED_STAGES.includes(v.lastOutcome.stage as OutcomeStage));

  const queue = visible.filter(
    (v) =>
      v.access.inQueue &&
      !closedOrDeclined.has(v.id) &&
      (v.reviews.length > 0 || v.openNextStep) &&
      (!prospectingSuppressed(v) || dueNow(v)),
  );
  const daily = queue.slice(0, 10);
  const followUpsDue = visible.filter(dueNow).length;

  return {
    org: { id: scope.orgId, name: scope.orgName, isManager: scope.isManager },
    books: scope.books,
    metrics: {
      homeownersMonitored: rows.length,
      changesDetected: visible.reduce((n, v) => n + v.reviews.length, 0),
      reviewOpportunities: queue.length,
      askedToConnect: askedToConnect.length,
      engagedThisMonth: visible.filter((v) => v.engagedRecently).length,
      followUpsDue,
      needsAttentionToday: daily.length,
      archived: archivedCount,
    },
    counts: {
      hot: queue.filter((v) => v.band === "hot").length,
      warm: queue.filter((v) => v.band === "warm").length,
      nurture: queue.filter((v) => v.band === "nurture").length,
    },
    take: buildTake(daily, askedToConnect.length, queue.length),
    aggregateOnly: aggregate,
    serviceDelivery: deliveryCounts,
    askedToConnectList: askedToConnect,
    daily,
    dailyTotal: queue.length,
    queue,
    book: visible,
  };
}

/**
 * SuCasa's Take — a short read of today's list, assembled only from facts
 * already permitted for this lender. No claim is added that isn't on a card.
 */
function buildTake(daily: LenderClientRow[], requests: number, total: number): string {
  if (!daily.length)
    return "Your book is quiet today. Nothing needs a call — SuCasa keeps watching for changes.";
  const parts: string[] = [];
  if (requests > 0)
    parts.push(
      `${requests} homeowner${requests === 1 ? "" : "s"} asked to hear from you — start there.`,
    );
  const names = daily.slice(0, 3).map((d) => d.name.split(" ")[0]).filter(Boolean);
  parts.push(
    `I reviewed your book and put ${Math.min(daily.length, 10)} of ${total} homeowners in front of you today, starting with ${names.join(", ")}.`,
  );
  const lead = daily[0];
  if (lead) parts.push(`${lead.name.split(" ")[0]}: ${lead.whyToday}`);
  return parts.join(" ");
}

/**
 * Build lender review opportunities. A review only exists when the specific
 * facts behind it are present — generic property data never creates a mortgage
 * product review on its own.
 */
function buildReviews(input: {
  clientId: string;
  legacy: any[];
  facts: Partial<Record<PermittedRankingInput, unknown>>;
  value: number | null;
  equity: number | null;
  ltv: number | null;
  loanAgeYears: number | null;
  tenureYears: number | null;
  engagementLine: string | null;
  askedToConnect: boolean;
  worked: boolean;
  daysSinceContact: number | null;
}): ReviewCard[] {
  const out: ReviewCard[] = [];
  const push = (
    type: ReviewType,
    reasonCodes: string[],
    sourceFields: PermittedRankingInput[],
    why: string[],
    base: number,
  ) => {
    if (!supportsReview(type, input.facts)) return;
    if (out.some((r) => r.type === type)) return;
    const meta = REVIEW_TYPES[type];
    out.push({
      id: `${input.clientId}:${type}`,
      type,
      label: meta.label,
      blurb: meta.blurb,
      action: meta.action,
      reasonCodes,
      sourceFields,
      why,
      priority: contactPriority(base, input),
    });
  };

  const equityPct = input.value && input.equity != null ? input.equity / input.value : null;

  if (input.equity != null && input.equity > 5_000_000) {
    push(
      "equity_review",
      ["equity_threshold_crossed"],
      ["estimated_equity", "estimated_value"],
      [`Estimated equity of ${dollars(input.equity)} on an estimated value of ${dollars(input.value)}.`],
      62,
    );
  }
  if (equityPct != null && equityPct >= 0.4) {
    push(
      "equity_milestone",
      ["equity_share_milestone"],
      ["estimated_equity", "estimated_ltv"],
      [`Estimated equity crossed ${Math.round(equityPct * 100)}% of estimated value.`],
      58,
    );
  }
  if (input.ltv != null && input.ltv <= 70 && input.equity != null) {
    push(
      "home_equity_conversation",
      ["low_estimated_ltv"],
      ["estimated_equity", "estimated_ltv"],
      [`Estimated loan-to-value of ${input.ltv}% may support a conversation about options.`],
      52,
    );
  }
  if (input.loanAgeYears != null && input.loanAgeYears >= 3) {
    push(
      "mortgage_checkup",
      ["loan_seasoning"],
      ["loan_age"],
      [`Mortgage is roughly ${input.loanAgeYears} years old.`],
      48,
    );
  }
  if (input.loanAgeYears != null && input.loanAgeYears >= 5 && input.facts.estimated_mortgage_balance != null) {
    push(
      "refinance_review",
      ["loan_seasoning", "recorded_mortgage_present"],
      ["estimated_mortgage_balance", "loan_age"],
      [`Recorded mortgage information is available and the loan is about ${input.loanAgeYears} years old.`],
      50,
    );
  }
  if (input.tenureYears != null && input.tenureYears >= 7 && input.equity != null) {
    push(
      "move_planning",
      ["long_tenure", "estimated_equity_present"],
      ["tenure_years", "estimated_equity"],
      [`${Math.round(input.tenureYears)} years in the home with estimated equity of ${dollars(input.equity)}.`],
      46,
    );
  }
  if (input.tenureYears != null && Math.abs(input.tenureYears - Math.round(input.tenureYears)) < 0.09) {
    push(
      "ownership_anniversary",
      ["ownership_anniversary"],
      ["tenure_years"],
      [`${Math.round(input.tenureYears)} year homeownership anniversary.`],
      40,
    );
  }
  if (input.value != null && input.value >= 50_000_000) {
    push(
      "value_milestone",
      ["value_threshold_crossed"],
      ["estimated_value", "value_change"],
      [`Estimated value is around ${dollars(input.value)}.`],
      42,
    );
  }

  // Preserve detections the existing engine already made, in lender wording.
  for (const o of input.legacy) {
    const type = CATEGORY_TO_REVIEW[o.category];
    if (!type) continue;
    push(
      type,
      (o.reason_codes ?? []).length ? o.reason_codes : [`signal_${o.category}`],
      (o.source_fields ?? []) as PermittedRankingInput[],
      (o.reasons ?? []).slice(0, 2),
      Math.min(70, Math.max(30, o.score ?? 40)),
    );
  }

  if (input.engagementLine) {
    for (const r of out) r.why = [input.engagementLine, ...r.why];
  }

  return out.sort((a, b) => b.priority - a.priority).slice(0, 4);
}

/**
 * Contact priority: how timely a relationship touch is. Never a credit,
 * approval or qualification score, and never influenced by sponsorship, agent
 * connections or any protected characteristic or proxy.
 */
function contactPriority(
  base: number,
  i: { engagementLine: string | null; askedToConnect: boolean; worked: boolean; daysSinceContact: number | null },
) {
  let n = base;
  if (i.askedToConnect) n += 35;
  if (i.engagementLine) n += 22;
  if (i.daysSinceContact == null) n += 5;
  else if (i.daysSinceContact < 7) n -= 25;
  else if (i.daysSinceContact > 60) n += 8;
  if (i.worked) n -= 12;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Canonical cents in, one display string out. Shared with every lender card. */
function dollars(cents: number | null) {
  return formatMoney(centsFromCents(cents), "an unknown amount");
}

/** Fetch one homeowner through the gate; returns null when not permitted. */
export async function readLenderHomeowner(supabase: any, userId: string, clientId: string) {
  const ws = await readLenderWorkspace(supabase, userId);
  if (!ws) return null;
  return ws.book.find((c) => c.id === clientId) ?? null;
}

/**
 * Client ids a lender may work individually, used by the shared action queue so
 * no legacy caller can bypass the gate.
 */
export async function permittedLenderClientIds(
  supabase: any,
  userId: string,
): Promise<Set<string>> {
  const ws = await readLenderWorkspace(supabase, userId);
  return new Set((ws?.book ?? []).filter((c) => c.access.inQueue).map((c) => c.id));
}
