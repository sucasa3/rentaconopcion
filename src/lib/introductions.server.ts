/**
 * Server-side authority for lender -> agent -> homeowner introductions.
 *
 * Every data-access decision here derives from the introduction's STATE and the
 * homeowner's per-channel grants, not from hiding fields in the UI:
 *
 *   - Lender-facing reads project aggregate or minimized shapes only.
 *   - Before `homeowner_accepted`, no function in this file can return a
 *     homeowner name, email, phone, address, property or financial detail to a
 *     lender caller. There is no code path that does it.
 *   - After acceptance, only the contact values for channels the homeowner
 *     affirmatively authorized are returned. Nothing else about the Home
 *     Profile is unlocked: mortgage, equity, valuation, documents and
 *     maintenance continue to flow solely through the existing consent gate.
 *   - No function here reads or writes credits, entitlements, capacity, plans,
 *     prices, rankings or placements. Introduction activity is economically
 *     inert for both the agent and the lender, by construction.
 */

import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  ANONYMITY_THRESHOLD,
  DISCLOSURE_VERSION,
  LENDER_CATEGORIES,
  aggregateOpportunities,
  agentMayRespond,
  authorizedChannels,
  canRevealHomeowner,
  consentDisclosure,
  internalCategoryLabel,
  lenderCategoryFor,
  stateAfterRevocation,
  type AggregateOpportunity,
  type ChannelGrant,
  type IntroductionChannel,
  type IntroductionState,
  type LenderCategory,
} from "./introductions";
import { assertConnection, assertMember } from "./network.server";
import { signTypedInviteToken, verifyTypedInviteToken } from "./invite-token.server";

const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Stage 1 — aggregate opportunities (computed; never a stored request state)
// ---------------------------------------------------------------------------

/**
 * The only opportunity shape a lender may receive for a connected agent's book:
 * broad category plus a count, with counts below the anonymity threshold
 * withheld entirely. No rows, ids, geography, bands, scores or timestamps are
 * read here, so there is nothing to difference across queries.
 */
export async function aggregateOpportunitiesForLender(
  supabase: any,
  lenderOrgId: string,
  agentOrgId: string,
): Promise<{ categories: AggregateOpportunity[]; threshold: number }> {
  await assertConnection(supabase, lenderOrgId, agentOrgId);

  const { data, error } = await supabaseAdmin
    .from("homeowner_opportunities")
    .select("category")
    .eq("org_id", agentOrgId)
    .eq("state", "open");
  if (error) throw new Error(error.message);

  return {
    categories: aggregateOpportunities(data ?? []),
    threshold: ANONYMITY_THRESHOLD,
  };
}

// ---------------------------------------------------------------------------
// Stage 2 — the lender asks about a category
// ---------------------------------------------------------------------------

/**
 * A lender says "I am available if one of these homeowners would like a
 * financing conversation". The record it creates contains no client identifier.
 */
export async function requestIntroductionForCategory(
  supabase: any,
  lenderOrgId: string,
  agentOrgId: string,
  category: LenderCategory,
  message: string | null,
  requestedBy: string,
) {
  const connectionId = await assertConnection(supabase, lenderOrgId, agentOrgId);
  if (!(category in LENDER_CATEGORIES)) throw new Error("Unknown opportunity category");

  // One open ask per agent + category keeps this from becoming a drip of
  // requests the agent has to triage.
  const { data: existing } = await supabaseAdmin
    .from("introductions")
    .select("id")
    .eq("lender_org_id", lenderOrgId)
    .eq("agent_org_id", agentOrgId)
    .eq("category", category)
    .eq("state", "lender_requested")
    .maybeSingle();
  if (existing) return { id: existing.id, state: "lender_requested" as IntroductionState };

  const { data, error } = await supabaseAdmin
    .from("introductions")
    .insert({
      connection_id: connectionId,
      lender_org_id: lenderOrgId,
      agent_org_id: agentOrgId,
      category,
      message,
      state: "lender_requested",
      requested_by: requestedBy,
      portfolio_client_id: null,
    })
    .select("id, state")
    .single();
  if (error) throw new Error(error.message);

  await recordConsentEvent(data.id, "lender_requested", {
    lender_org_id: lenderOrgId,
    agent_org_id: agentOrgId,
  });
  return data;
}

// ---------------------------------------------------------------------------
// Listing, per side
// ---------------------------------------------------------------------------

export interface LenderIntroductionRow {
  id: string;
  agent_org_name: string;
  category: LenderCategory;
  category_label: string;
  state: IntroductionState;
  requested_at: string;
  /** Present only once the homeowner has accepted. */
  accepted_at: string | null;
  authorized_channels: IntroductionChannel[];
}

/** Lender view. Deliberately free of any homeowner identifier or property fact. */
export async function listIntroductionsForLender(
  supabase: any,
  lenderOrgId: string,
): Promise<LenderIntroductionRow[]> {
  await assertMember(supabase, await callerId(supabase), lenderOrgId);
  const { data, error } = await supabaseAdmin
    .from("introductions")
    .select("id, agent_org_id, category, state, lender_requested_at, homeowner_responded_at")
    .eq("lender_org_id", lenderOrgId)
    .order("lender_requested_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (!rows.length) return [];

  const { data: orgs } = await supabaseAdmin
    .from("lender_orgs")
    .select("id, name")
    .in("id", [...new Set(rows.map((r: any) => r.agent_org_id))]);
  const orgNames = new Map<string, string>((orgs ?? []).map((o: any) => [o.id, o.name]));

  const grants = await grantsByIntroduction(rows.map((r: any) => r.id));

  return rows.map((r: any) => ({
    id: r.id,
    agent_org_name: orgNames.get(r.agent_org_id) ?? "Agent",
    category: r.category,
    category_label:
      (LENDER_CATEGORIES as Record<string, { label: string }>)[r.category]?.label ?? "Opportunity",
    state: r.state,
    requested_at: r.lender_requested_at,
    accepted_at: canRevealHomeowner(r.state, grants.get(r.id) ?? [])
      ? r.homeowner_responded_at
      : null,
    authorized_channels: canRevealHomeowner(r.state, grants.get(r.id) ?? [])
      ? authorizedChannels(grants.get(r.id) ?? [])
      : [],
  }));
}

/** Agent view: their own requests, with their own client name where selected. */
export async function listIntroductionsForAgent(supabase: any, agentOrgId: string) {
  const { data, error } = await supabaseAdmin
    .from("introductions")
    .select(
      "id, lender_org_id, category, state, message, portfolio_client_id, lender_requested_at, agent_responded_at, homeowner_responded_at, homeowner_decision, invited_email, legacy_migration_reason",
    )
    .eq("agent_org_id", agentOrgId)
    .order("lender_requested_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (!rows.length) return [];

  const { data: orgs } = await supabaseAdmin
    .from("lender_orgs")
    .select("id, name, contact_name")
    .in("id", [...new Set(rows.map((r: any) => r.lender_org_id))]);
  const orgById = new Map<string, any>((orgs ?? []).map((o: any) => [o.id, o]));

  const clientIds = rows.map((r: any) => r.portfolio_client_id).filter(Boolean);
  let clientNames = new Map<string, string | null>();
  if (clientIds.length) {
    const { data: clients } = await supabaseAdmin
      .from("lender_portfolio_clients")
      .select("id, client_name")
      .in("id", clientIds);
    clientNames = new Map((clients ?? []).map((c: any) => [c.id, c.client_name]));
  }

  const grants = await grantsByIntroduction(rows.map((r: any) => r.id));

  return rows.map((r: any) => ({
    id: r.id,
    lender_org_name: orgById.get(r.lender_org_id)?.name ?? "Lender",
    lender_contact_name: orgById.get(r.lender_org_id)?.contact_name ?? null,
    category: r.category,
    category_label:
      (LENDER_CATEGORIES as Record<string, { label: string }>)[r.category]?.label ?? "Opportunity",
    state: r.state as IntroductionState,
    message: r.message,
    client_name: r.portfolio_client_id ? (clientNames.get(r.portfolio_client_id) ?? null) : null,
    requested_at: r.lender_requested_at,
    responded_at: r.agent_responded_at,
    homeowner_responded_at: r.homeowner_responded_at,
    homeowner_decision: r.homeowner_decision,
    invited_email: r.invited_email,
    legacy: Boolean(r.legacy_migration_reason),
    authorized_channels: authorizedChannels(grants.get(r.id) ?? []),
    can_respond: agentMayRespond(r.state as IntroductionState),
  }));
}

// ---------------------------------------------------------------------------
// Stage 3 — the agent privately decides
// ---------------------------------------------------------------------------

/** The agent's own clients that match the requested category. Agent-side only. */
export async function candidatesForIntroduction(
  supabase: any,
  userId: string,
  introductionId: string,
) {
  const intro = await loadIntroduction(introductionId);
  await assertMember(supabase, userId, intro.agent_org_id);

  const internal = (LENDER_CATEGORIES[intro.category as LenderCategory]?.internal ??
    []) as readonly string[];
  const { data: opps } = await supabaseAdmin
    .from("homeowner_opportunities")
    .select("portfolio_client_id, category, score, reasons")
    .eq("org_id", intro.agent_org_id)
    .eq("state", "open")
    .in("category", internal as string[])
    .order("score", { ascending: false })
    .limit(50);
  const rows = opps ?? [];
  if (!rows.length) return [];

  const { data: clients } = await supabaseAdmin
    .from("lender_portfolio_clients")
    .select("id, client_name, client_email, client_phone, city, state")
    .in("id", [...new Set(rows.map((o: any) => o.portfolio_client_id))]);
  const byId = new Map((clients ?? []).map((c: any) => [c.id, c]));

  const seen = new Set<string>();
  const out: any[] = [];
  for (const o of rows) {
    if (seen.has(o.portfolio_client_id)) continue;
    seen.add(o.portfolio_client_id);
    const c = byId.get(o.portfolio_client_id);
    if (!c) continue;
    out.push({
      portfolio_client_id: c.id,
      client_name: c.client_name,
      has_email: Boolean(c.client_email),
      has_phone: Boolean(c.client_phone),
      city: c.city,
      state: c.state,
      reason: internalCategoryLabel(o.category),
      reasons: (o.reasons ?? []).slice(0, 2),
    });
  }
  return out;
}

/**
 * Agent decision. `offer` is permission to ASK the homeowner — never permission
 * to disclose the homeowner to the lender. Declining costs the agent nothing,
 * and offering earns the agent nothing: no credit, capacity, entitlement, plan,
 * price, ranking or benefit is read or written on any branch below.
 */
export async function respondToIntroductionAsAgent(
  supabase: any,
  userId: string,
  introductionId: string,
  action: "offer" | "not_now" | "decline",
  portfolioClientId: string | null,
  note: string | null,
) {
  const intro = await loadIntroduction(introductionId);
  await assertMember(supabase, userId, intro.agent_org_id);
  if (!agentMayRespond(intro.state)) {
    throw new Error("This introduction has already moved past your review");
  }

  if (action === "not_now") {
    // Nothing changes and nothing is disclosed. The request simply waits.
    await recordConsentEvent(intro.id, "agent_not_now", {
      agent_actor_id: userId,
      agent_org_id: intro.agent_org_id,
      lender_org_id: intro.lender_org_id,
    });
    return { id: intro.id, state: intro.state };
  }

  if (action === "decline") {
    await supabaseAdmin
      .from("introductions")
      .update({
        state: "agent_declined",
        agent_responded_by: userId,
        agent_responded_at: new Date().toISOString(),
        agent_note: note,
      })
      .eq("id", intro.id);
    await recordConsentEvent(intro.id, "agent_declined", {
      agent_actor_id: userId,
      agent_org_id: intro.agent_org_id,
      lender_org_id: intro.lender_org_id,
    });
    return { id: intro.id, state: "agent_declined" as IntroductionState };
  }

  if (!portfolioClientId) throw new Error("Choose which client to offer the introduction to");

  // The client must belong to this agent's own book.
  const { data: client } = await supabaseAdmin
    .from("lender_portfolio_clients")
    .select("id, portfolio_id, client_name, client_email, homeowner_id")
    .eq("id", portfolioClientId)
    .maybeSingle();
  if (!client) throw new Error("Client not found");
  const { data: portfolio } = await supabaseAdmin
    .from("lender_portfolios")
    .select("id, lender_org_id")
    .eq("id", client.portfolio_id)
    .maybeSingle();
  if (!portfolio || portfolio.lender_org_id !== intro.agent_org_id) {
    throw new Error("That client is not in your book");
  }
  if (!client.client_email && !client.homeowner_id) {
    throw new Error("This client has no email on file, so they cannot be asked");
  }

  const nonce = randomUUID();
  const now = new Date();
  const email = (client.client_email ?? "").toLowerCase();
  await supabaseAdmin
    .from("introductions")
    .update({
      state: "agent_offered",
      portfolio_client_id: client.id,
      agent_responded_by: userId,
      agent_responded_at: now.toISOString(),
      agent_note: note,
      homeowner_invited_at: now.toISOString(),
      invited_email: email || null,
      invite_nonce: nonce,
      invite_expires_at: new Date(now.getTime() + INVITE_TTL_MS).toISOString(),
      invite_viewed_at: null,
      invite_used_at: null,
    })
    .eq("id", intro.id);

  const lender = await lenderIdentity(intro.lender_org_id);
  const agent = await orgName(intro.agent_org_id);
  const token = email
    ? signTypedInviteToken(
        {
          invitationId: intro.id,
          context: "homeowner_introduction",
          email,
          nonce,
          ttlMs: INVITE_TTL_MS,
        },
        now.getTime(),
      )
    : null;

  await recordConsentEvent(intro.id, "agent_offered", {
    agent_actor_id: userId,
    agent_org_id: intro.agent_org_id,
    lender_org_id: intro.lender_org_id,
    portfolio_client_id: client.id,
    homeowner_id: client.homeowner_id ?? null,
    delivered_to_email: email || null,
    lender_org_name_shown: lender.name,
    lender_contact_name_shown: lender.contactName,
  });

  let emailed = false;
  if (token && email) {
    try {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      const siteUrl = process.env["SITE_URL"] ?? "https://sucasa.com";
      const res = await sendTemplateEmail("introduction-invite", email, {
        fromName: "SuCasa",
        idempotencyKey: `introduction-${intro.id}`,
        templateData: {
          homeownerName: client.client_name ?? null,
          agentOrgName: agent,
          lenderOrgName: lender.name,
          lenderContactName: lender.contactName,
          categoryLabel:
            (LENDER_CATEGORIES as Record<string, { label: string }>)[intro.category]?.label ??
            "financing options",
          acceptUrl: `${siteUrl}/introduction?t=${encodeURIComponent(token)}`,
        },
      });
      emailed = res.sent;
    } catch {
      emailed = false;
    }
  }

  return { id: intro.id, state: "agent_offered" as IntroductionState, emailed };
}

// ---------------------------------------------------------------------------
// Stage 4 — the homeowner decides (no SuCasa account required)
// ---------------------------------------------------------------------------

export interface IntroductionInviteView {
  ok: true;
  introductionId: string;
  agentOrgName: string;
  lenderOrgName: string;
  lenderContactName: string | null;
  categoryLabel: string;
  homeownerName: string | null;
  phone: string | null;
  email: string | null;
  disclosureVersion: string;
  alreadyAnswered: "accepted" | "declined" | null;
}

export type IntroductionInviteResult =
  | IntroductionInviteView
  | { ok: false; reason: "invalid" | "expired" | "used" | "withdrawn" };

/** Server-mediated read of an emailed introduction link. */
export async function readIntroductionInvite(
  token: string,
  opts: { markViewed?: boolean } = {},
): Promise<IntroductionInviteResult> {
  const verified = verifyTypedInviteToken(token);
  if (!verified.ok) {
    return { ok: false, reason: verified.reason === "expired" ? "expired" : "invalid" };
  }
  if (verified.claims.context !== "homeowner_introduction") return { ok: false, reason: "invalid" };

  const { data: intro } = await supabaseAdmin
    .from("introductions")
    .select(
      "id, state, category, agent_org_id, lender_org_id, portfolio_client_id, invited_email, invite_nonce, invite_expires_at, invite_used_at, homeowner_decision",
    )
    .eq("id", verified.claims.invitationId)
    .maybeSingle();
  if (!intro) return { ok: false, reason: "invalid" };
  if (!intro.invite_nonce || intro.invite_nonce !== verified.claims.nonce) {
    return { ok: false, reason: "invalid" };
  }
  if ((intro.invited_email ?? "").toLowerCase() !== verified.claims.email) {
    return { ok: false, reason: "invalid" };
  }
  if (intro.invite_expires_at && new Date(intro.invite_expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (intro.state === "agent_declined") return { ok: false, reason: "withdrawn" };
  if (intro.invite_used_at && intro.state !== "agent_offered") {
    // Already answered: show the outcome rather than a second consent form.
    const answered = intro.homeowner_decision as "accepted" | "declined" | null;
    if (!answered) return { ok: false, reason: "used" };
  }

  const [lender, agent, client] = await Promise.all([
    lenderIdentity(intro.lender_org_id),
    orgName(intro.agent_org_id),
    clientContact(intro.portfolio_client_id),
  ]);

  if (opts.markViewed && !intro.invite_used_at) {
    await supabaseAdmin
      .from("introductions")
      .update({ invite_viewed_at: new Date().toISOString() })
      .eq("id", intro.id)
      .is("invite_viewed_at", null);
    await recordConsentEvent(intro.id, "homeowner_viewed", {
      agent_org_id: intro.agent_org_id,
      lender_org_id: intro.lender_org_id,
      portfolio_client_id: intro.portfolio_client_id,
      delivered_to_email: intro.invited_email,
    });
  }

  return {
    ok: true,
    introductionId: intro.id,
    agentOrgName: agent,
    lenderOrgName: lender.name,
    lenderContactName: lender.contactName,
    categoryLabel:
      (LENDER_CATEGORIES as Record<string, { label: string }>)[intro.category]?.label ??
      "financing options",
    homeownerName: client?.client_name ?? null,
    phone: client?.client_phone ?? null,
    email: client?.client_email ?? null,
    disclosureVersion: DISCLOSURE_VERSION,
    alreadyAnswered: (intro.homeowner_decision as "accepted" | "declined" | null) ?? null,
  };
}

/**
 * The homeowner answers. Declining, ignoring, an expired link or a reused link
 * all reveal exactly nothing to the lender.
 */
export async function answerIntroduction(
  token: string,
  input: {
    decision: "accepted" | "declined";
    channels: IntroductionChannel[];
    language: "en" | "es";
    ip?: string | null;
    userAgent?: string | null;
  },
): Promise<{ ok: true; decision: "accepted" | "declined"; channels: IntroductionChannel[] } | { ok: false; reason: string }> {
  const view = await readIntroductionInvite(token);
  if (!view.ok) return { ok: false, reason: view.reason };
  if (view.alreadyAnswered) return { ok: false, reason: "used" };

  const { data: intro } = await supabaseAdmin
    .from("introductions")
    .select("id, state, agent_org_id, lender_org_id, portfolio_client_id, invited_email")
    .eq("id", view.introductionId)
    .maybeSingle();
  if (!intro || intro.state !== "agent_offered") return { ok: false, reason: "used" };

  const now = new Date().toISOString();
  const client = await clientContact(intro.portfolio_client_id);

  if (input.decision === "declined") {
    await supabaseAdmin
      .from("introductions")
      .update({
        state: "homeowner_declined",
        homeowner_decision: "declined",
        homeowner_responded_at: now,
        invite_used_at: now,
      })
      .eq("id", intro.id);
    await recordConsentEvent(intro.id, "homeowner_declined", {
      agent_org_id: intro.agent_org_id,
      lender_org_id: intro.lender_org_id,
      portfolio_client_id: intro.portfolio_client_id,
      homeowner_id: client?.homeowner_id ?? null,
      delivered_to_email: intro.invited_email,
      lender_org_name_shown: view.lenderOrgName,
      lender_contact_name_shown: view.lenderContactName,
      decision: "declined",
      language: input.language,
      ip_address: input.ip ?? null,
      user_agent: input.userAgent ?? null,
    });
    return { ok: true, decision: "declined", channels: [] };
  }

  const channels = [...new Set(input.channels)].filter((c) =>
    c === "email" ? Boolean(client?.client_email) : Boolean(client?.client_phone),
  );
  if (!channels.length) {
    return { ok: false, reason: "no_channel" };
  }

  const disclosure = consentDisclosure({
    lenderOrgName: view.lenderOrgName,
    lenderContactName: view.lenderContactName,
    phone: client?.client_phone ?? null,
    email: client?.client_email ?? null,
    channels,
    language: input.language,
  });

  await supabaseAdmin
    .from("introductions")
    .update({
      state: "connection_active",
      homeowner_decision: "accepted",
      homeowner_responded_at: now,
      invite_used_at: now,
    })
    .eq("id", intro.id);

  await supabaseAdmin.from("introduction_channel_grants").upsert(
    channels.map((channel) => ({
      introduction_id: intro.id,
      channel,
      status: "granted",
      authorized_value: channel === "email" ? client?.client_email : client?.client_phone,
      disclosure_version: DISCLOSURE_VERSION,
      language: input.language,
      granted_at: now,
      revoked_at: null,
    })),
    { onConflict: "introduction_id,channel" },
  );

  // Canonical consent record: scoped to this lender, for this purpose only.
  if (client?.homeowner_id) {
    await supabaseAdmin.from("consent_records").insert({
      homeowner_id: client.homeowner_id,
      recipient_org_id: intro.lender_org_id,
      recipient_kind: "lender",
      consent_type: "connection_request",
      scope: channels,
      status: "granted",
      source: "homeowner_introduction",
      disclosure_version: DISCLOSURE_VERSION,
      context: {
        introduction_id: intro.id,
        purpose: "introduction",
        lender_org_name: view.lenderOrgName,
        language: input.language,
      },
      granted_at: now,
    });
  }

  await recordConsentEvent(intro.id, "homeowner_accepted", {
    agent_org_id: intro.agent_org_id,
    lender_org_id: intro.lender_org_id,
    portfolio_client_id: intro.portfolio_client_id,
    homeowner_id: client?.homeowner_id ?? null,
    delivered_to_email: intro.invited_email,
    lender_org_name_shown: view.lenderOrgName,
    lender_contact_name_shown: view.lenderContactName,
    channels,
    authorized_phone: channels.some((c) => c !== "email") ? (client?.client_phone ?? null) : null,
    authorized_email: channels.includes("email") ? (client?.client_email ?? null) : null,
    disclosure_version: DISCLOSURE_VERSION,
    disclosure_text: disclosure,
    language: input.language,
    decision: "accepted",
    ip_address: input.ip ?? null,
    user_agent: input.userAgent ?? null,
  });

  return { ok: true, decision: "accepted", channels };
}

// ---------------------------------------------------------------------------
// Stage 5 — minimized lender reveal
// ---------------------------------------------------------------------------

export interface AcceptedIntroductionDetail {
  introduction_id: string;
  homeowner_name: string | null;
  accepted_at: string | null;
  category_label: string;
  authorized_channels: IntroductionChannel[];
  /** Only the values for channels the homeowner authorized. */
  phone: string | null;
  email: string | null;
  note: string;
}

/**
 * The lender-facing consent confirmation. Minimum necessary and nothing else:
 * no address, property, valuation, equity, mortgage, document or Home Profile
 * data is read here, whatever the introduction's state.
 */
export async function acceptedIntroductionForLender(
  supabase: any,
  userId: string,
  introductionId: string,
): Promise<AcceptedIntroductionDetail> {
  const intro = await loadIntroduction(introductionId);
  await assertMember(supabase, userId, intro.lender_org_id);

  const grants = (await grantsByIntroduction([intro.id])).get(intro.id) ?? [];
  if (!canRevealHomeowner(intro.state, grants)) {
    throw new Error("This homeowner has not accepted an introduction");
  }
  const channels = authorizedChannels(grants);

  const client = await clientContact(intro.portfolio_client_id);

  await recordConsentEvent(intro.id, "lender_viewed_contact", {
    lender_org_id: intro.lender_org_id,
    agent_org_id: intro.agent_org_id,
    portfolio_client_id: intro.portfolio_client_id,
    channels,
  });

  return {
    introduction_id: intro.id,
    homeowner_name: client?.client_name ?? null,
    accepted_at: intro.homeowner_responded_at,
    category_label:
      (LENDER_CATEGORIES as Record<string, { label: string }>)[intro.category]?.label ??
      "financing options",
    authorized_channels: channels,
    phone: channels.some((c) => c !== "email") ? (client?.client_phone ?? null) : null,
    email: channels.includes("email") ? (client?.client_email ?? null) : null,
    note: "The homeowner asked for this conversation. This is not Home Profile access.",
  };
}

// ---------------------------------------------------------------------------
// Revocation — channel-specific, lender-scoped by default
// ---------------------------------------------------------------------------

/**
 * Withdraw permission for one or more channels.
 *
 * Scope is { homeowner, lender org, purpose: introduction, channel }. A
 * lender-specific withdrawal (including an SMS STOP) never becomes a global
 * SuCasa or agent suppression: that only happens when the consumer expressly
 * asks for it via `scope: "all_communication"`.
 */
export async function revokeIntroductionChannels(
  introductionId: string,
  channels: IntroductionChannel[],
  opts: { scope?: "this_lender" | "all_communication"; reason?: string | null } = {},
) {
  const intro = await loadIntroduction(introductionId);
  const now = new Date().toISOString();

  const target = channels.length ? channels : (["call", "text", "email"] as IntroductionChannel[]);
  await supabaseAdmin
    .from("introduction_channel_grants")
    .update({ status: "revoked", revoked_at: now })
    .eq("introduction_id", intro.id)
    .in("channel", target);

  const grants = (await grantsByIntroduction([intro.id])).get(intro.id) ?? [];
  const nextState = stateAfterRevocation(grants);
  await supabaseAdmin
    .from("introductions")
    .update({
      state: nextState,
      revoked_at: nextState === "permission_revoked" ? now : null,
    })
    .eq("id", intro.id);

  const client = await clientContact(intro.portfolio_client_id);
  if (client?.homeowner_id && nextState === "permission_revoked") {
    await supabaseAdmin
      .from("consent_records")
      .update({ status: "revoked", revoked_at: now })
      .eq("homeowner_id", client.homeowner_id)
      .eq("recipient_org_id", intro.lender_org_id)
      .eq("consent_type", "connection_request")
      .eq("status", "granted");
  }

  // Only an express global opt-out touches the client-wide suppression record.
  if (opts.scope === "all_communication" && intro.portfolio_client_id) {
    await supabaseAdmin
      .from("outreach_channel_permissions")
      .upsert(
        {
          portfolio_client_id: intro.portfolio_client_id,
          do_not_call: target.includes("call"),
          do_not_text: target.includes("text"),
          do_not_email: target.includes("email"),
          phone_allowed: false,
          sms_allowed: false,
          email_allowed: false,
          consent_source: "homeowner_request",
          consent_basis: "global_opt_out",
          notes: opts.reason ?? "Homeowner asked to stop all SuCasa communication",
        },
        { onConflict: "portfolio_client_id" },
      );
  }

  await recordConsentEvent(intro.id, "permission_revoked", {
    lender_org_id: intro.lender_org_id,
    agent_org_id: intro.agent_org_id,
    portfolio_client_id: intro.portfolio_client_id,
    homeowner_id: client?.homeowner_id ?? null,
    channels: target,
    decision: opts.scope === "all_communication" ? "all_communication" : "this_lender",
  });

  return { state: nextState, authorized_channels: authorizedChannels(grants) };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function callerId(supabase: any): Promise<string> {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? "";
}

async function loadIntroduction(id: string) {
  const { data, error } = await supabaseAdmin
    .from("introductions")
    .select(
      "id, state, category, lender_org_id, agent_org_id, portfolio_client_id, homeowner_responded_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Introduction not found");
  return data as {
    id: string;
    state: IntroductionState;
    category: string;
    lender_org_id: string;
    agent_org_id: string;
    portfolio_client_id: string | null;
    homeowner_responded_at: string | null;
  };
}

async function grantsByIntroduction(ids: string[]): Promise<Map<string, ChannelGrant[]>> {
  const out = new Map<string, ChannelGrant[]>();
  if (!ids.length) return out;
  const { data } = await supabaseAdmin
    .from("introduction_channel_grants")
    .select("introduction_id, channel, status")
    .in("introduction_id", ids);
  for (const row of data ?? []) {
    const list = out.get((row as any).introduction_id) ?? [];
    list.push({ channel: (row as any).channel, status: (row as any).status });
    out.set((row as any).introduction_id, list);
  }
  return out;
}

async function lenderIdentity(orgId: string) {
  const { data } = await supabaseAdmin
    .from("lender_orgs")
    .select("name, contact_name")
    .eq("id", orgId)
    .maybeSingle();
  return { name: data?.name ?? "Lender", contactName: data?.contact_name ?? null };
}

async function orgName(orgId: string) {
  const { data } = await supabaseAdmin
    .from("lender_orgs")
    .select("name")
    .eq("id", orgId)
    .maybeSingle();
  return data?.name ?? "Your agent";
}

async function clientContact(clientId: string | null) {
  if (!clientId) return null;
  const { data } = await supabaseAdmin
    .from("lender_portfolio_clients")
    .select("id, client_name, client_email, client_phone, homeowner_id")
    .eq("id", clientId)
    .maybeSingle();
  return data as
    | {
        id: string;
        client_name: string | null;
        client_email: string | null;
        client_phone: string | null;
        homeowner_id: string | null;
      }
    | null;
}

/** Append-only internal compliance ledger. Never exposed to lenders or agents. */
async function recordConsentEvent(
  introductionId: string,
  event: string,
  fields: Record<string, unknown>,
) {
  try {
    await supabaseAdmin.from("introduction_consent_events").insert({
      introduction_id: introductionId,
      event,
      ...fields,
    });
  } catch {
    // Audit writes must never break the workflow they describe.
  }
}

export { lenderCategoryFor };
