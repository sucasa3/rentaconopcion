/**
 * Next Best Action engine — server-only.
 *
 * Turns the opportunities SuCasa already detects into a ranked daily work
 * queue: who to contact, why, on which channel, with a draft ready to send,
 * plus one-tap outcome logging and a funnel rollup.
 */

import {
  recipeFor,
  rankScore,
  temperatureFor,
  whyLine,
  type Audience,
  type Temperature,
  type OutcomeStage,
} from "@/lib/next-best-action";
import { categoryLabel } from "@/lib/opportunities";
import { MODEL_LIGHT } from "@/lib/documents-ai.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

export interface Scope {
  orgIds: string[];
  bookIds: string[];
  orgByBook: Map<string, string>;
  isManager: boolean;
}

export async function resolveScope(
  supabase: any,
  userId: string,
  orgType: Audience,
): Promise<Scope> {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  let orgIds: string[] = [];
  let isManager = Boolean(isAdmin);

  if (isAdmin) {
    const { data } = await supabase.from("lender_orgs").select("id").eq("org_type", orgType);
    orgIds = (data ?? []).map((o: any) => o.id);
  } else {
    const { data: members } = await supabase
      .from("lender_members")
      .select("lender_org_id, role, lender_orgs(id, org_type)")
      .eq("user_id", userId);
    const mine = (members ?? []).filter((m: any) => m.lender_orgs?.org_type === orgType);
    orgIds = mine.map((m: any) => m.lender_org_id);
    isManager = mine.some((m: any) => ["owner", "admin", "manager"].includes(m.role));
  }
  if (!orgIds.length) {
    return { orgIds: [], bookIds: [], orgByBook: new Map(), isManager };
  }

  const { data: portfolios } = await supabase
    .from("lender_portfolios")
    .select("id, lender_org_id, assigned_user_id")
    .in("lender_org_id", orgIds);
  const visible = (portfolios ?? []).filter(
    (p: any) => isManager || !p.assigned_user_id || p.assigned_user_id === userId,
  );
  return {
    orgIds,
    bookIds: visible.map((p: any) => p.id),
    orgByBook: new Map(visible.map((p: any) => [p.id, p.lender_org_id])),
    isManager,
  };
}

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

export interface QueueItem {
  opportunityId: string;
  orgId: string;
  clientId: string;
  portfolioId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  activated: boolean;
  category: string;
  categoryLabel: string;
  score: number;
  strength: string;
  reasons: string[];
  temperature: Temperature;
  rank: number;
  channel: "call" | "text" | "email";
  headline: string;
  ask: string;
  why: string;
  engagedRecently: boolean;
  engagementLine: string | null;
  lastContactAt: string | null;
  lastOutcome: OutcomeStage | null;
  draftSubject: string | null;
  draftBody: string | null;
  shared: boolean;
}

export interface QueueResult {
  items: QueueItem[];
  counts: {
    hot: number;
    warm: number;
    nurture: number;
    engaged: number;
    readyToContact: number;
  };
  yesterday: { sent: number; opened: number; clicked: number; replied: number };
}

const DAY = 24 * 60 * 60 * 1000;

export async function buildActionQueue(
  supabase: any,
  userId: string,
  orgType: Audience,
  limit = 40,
): Promise<QueueResult> {
  const empty: QueueResult = {
    items: [],
    counts: { hot: 0, warm: 0, nurture: 0, engaged: 0, readyToContact: 0 },
    yesterday: { sent: 0, opened: 0, clicked: 0, replied: 0 },
  };

  const scope = await resolveScope(supabase, userId, orgType);
  if (!scope.bookIds.length) return empty;

  const { data: clients } = await supabase
    .from("lender_portfolio_clients")
    .select(
      "id, portfolio_id, client_name, client_email, client_phone, address_line1, city, state, homeowner_id",
    )
    .in("portfolio_id", scope.bookIds);
  const rows = clients ?? [];
  if (!rows.length) return empty;
  const clientById = new Map<string, any>(rows.map((c: any) => [c.id, c]));
  const clientIds = rows.map((c: any) => c.id);

  const { data: opps } = await supabase
    .from("homeowner_opportunities")
    .select("id, portfolio_client_id, org_id, category, strength, score, reasons")
    .in("portfolio_client_id", clientIds)
    .eq("state", "open")
    .order("score", { ascending: false })
    .limit(400);

  const since = new Date(Date.now() - 30 * DAY).toISOString();
  const [{ data: events }, { data: messages }, { data: outcomes }, { data: shared }] =
    await Promise.all([
      supabase
        .from("outreach_events")
        .select("portfolio_client_id, event, occurred_at")
        .in("portfolio_client_id", clientIds)
        .gte("occurred_at", since),
      supabase
        .from("outreach_messages")
        .select("portfolio_client_id, sent_at, created_at")
        .in("portfolio_client_id", clientIds)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("opportunity_outcomes")
        .select("portfolio_client_id, opportunity_id, stage, occurred_at")
        .in("portfolio_client_id", clientIds)
        .order("occurred_at", { ascending: false })
        .limit(500),
      supabase
        .from("shared_opportunities")
        .select("portfolio_client_id, status")
        .in("portfolio_client_id", clientIds),
    ]);

  const engaged = new Map<string, string>();
  for (const e of events ?? []) {
    if (["open", "click", "reply", "app_activity"].includes(e.event)) {
      const age = Date.now() - new Date(e.occurred_at).getTime();
      if (age <= 14 * DAY && !engaged.has(e.portfolio_client_id)) {
        engaged.set(
          e.portfolio_client_id,
          e.event === "reply"
            ? "Replied to your last message"
            : e.event === "click"
              ? "Clicked your last email"
              : e.event === "open"
                ? "Opened your last email"
                : "Active in their Home Profile",
        );
      }
    }
  }

  const lastContact = new Map<string, string>();
  for (const m of messages ?? []) {
    const at = m.sent_at ?? m.created_at;
    if (at && !lastContact.has(m.portfolio_client_id)) lastContact.set(m.portfolio_client_id, at);
  }

  const lastOutcomeByOpp = new Map<string, OutcomeStage>();
  const workedClients = new Set<string>();
  for (const o of outcomes ?? []) {
    workedClients.add(o.portfolio_client_id);
    if (o.opportunity_id && !lastOutcomeByOpp.has(o.opportunity_id))
      lastOutcomeByOpp.set(o.opportunity_id, o.stage as OutcomeStage);
  }

  const sharedClients = new Set((shared ?? []).map((s: any) => s.portfolio_client_id));

  const { data: cachedActions } = await supabase
    .from("opportunity_actions")
    .select("opportunity_id, draft_subject, draft_body")
    .in("org_id", scope.orgIds)
    .eq("audience", orgType)
    .limit(500);
  const draftByOpp = new Map<string, any>(
    (cachedActions ?? []).map((a: any) => [a.opportunity_id, a]),
  );

  const items: QueueItem[] = [];
  for (const o of opps ?? []) {
    const c = clientById.get(o.portfolio_client_id);
    if (!c) continue;
    const lastAt = lastContact.get(c.id) ?? null;
    const daysSinceContact = lastAt
      ? Math.floor((Date.now() - new Date(lastAt).getTime()) / DAY)
      : null;
    const engagementLine = engaged.get(c.id) ?? null;
    const rankInput = {
      score: o.score ?? 0,
      strength: o.strength ?? "emerging",
      engagedRecently: Boolean(engagementLine),
      daysSinceContact,
      worked: workedClients.has(c.id),
    };
    const recipe = recipeFor(o.category, orgType);
    const draft = draftByOpp.get(o.id);
    items.push({
      opportunityId: o.id,
      orgId: o.org_id ?? scope.orgByBook.get(c.portfolio_id) ?? scope.orgIds[0]!,
      clientId: c.id,
      portfolioId: c.portfolio_id ?? null,
      name: c.client_name ?? "Homeowner",
      email: c.client_email ?? null,
      phone: c.client_phone ?? null,
      address: [c.address_line1, c.city, c.state].filter(Boolean).join(", ") || null,
      activated: Boolean(c.homeowner_id),
      category: o.category,
      categoryLabel: categoryLabel(o.category),
      score: o.score ?? 0,
      strength: o.strength ?? "emerging",
      reasons: o.reasons ?? [],
      temperature: temperatureFor(rankInput),
      rank: rankScore(rankInput),
      channel: recipe.channel,
      headline: recipe.headline,
      ask: recipe.ask,
      why: whyLine(o.reasons, recipe.ask),
      engagedRecently: Boolean(engagementLine),
      engagementLine,
      lastContactAt: lastAt,
      lastOutcome: lastOutcomeByOpp.get(o.id) ?? null,
      draftSubject: draft?.draft_subject ?? null,
      draftBody: draft?.draft_body ?? null,
      shared: sharedClients.has(c.id),
    });
  }

  // One action per homeowner: keep their highest-ranked opportunity.
  const bestByClient = new Map<string, QueueItem>();
  for (const it of items) {
    const cur = bestByClient.get(it.clientId);
    if (!cur || it.rank > cur.rank) bestByClient.set(it.clientId, it);
  }
  const deduped = [...bestByClient.values()]
    .filter((i) => i.lastOutcome !== "closed" && i.lastOutcome !== "not_interested")
    .sort((a, b) => b.rank - a.rank);

  const dayStart = new Date(Date.now() - DAY).toISOString();
  const y = { sent: 0, opened: 0, clicked: 0, replied: 0 };
  for (const e of events ?? []) {
    if (e.occurred_at < dayStart) continue;
    if (e.event === "sent") y.sent++;
    else if (e.event === "open") y.opened++;
    else if (e.event === "click") y.clicked++;
    else if (e.event === "reply") y.replied++;
  }

  return {
    items: deduped.slice(0, limit),
    counts: {
      hot: deduped.filter((i) => i.temperature === "hot").length,
      warm: deduped.filter((i) => i.temperature === "warm").length,
      nurture: deduped.filter((i) => i.temperature === "nurture").length,
      engaged: deduped.filter((i) => i.engagedRecently).length,
      readyToContact: deduped.filter((i) => i.temperature === "hot" && !i.lastOutcome).length,
    },
    yesterday: y,
  };
}

// ---------------------------------------------------------------------------
// Draft generation
// ---------------------------------------------------------------------------

const DRAFT_SYSTEM = `You write short, warm outreach messages for a real-estate agent or mortgage loan officer contacting a past client about their home.

Hard rules:
- Never say the homeowner qualifies for, is eligible for, is approved for, or needs anything. Only suggest a conversation.
- Never invent numbers. Use only the facts given.
- No pressure, no hype, no exclamation marks, no emoji.
- 60-110 words for email, under 40 words for text.
- Plain language a fifth grader can read.
- End with a simple question or offer.
Return JSON: { "subject": string, "body": string }. For a text message the subject may be an empty string.`;

export async function generateDraft(input: {
  audience: Audience;
  channel: "call" | "text" | "email";
  clientName: string;
  category: string;
  reasons: string[];
  senderName: string | null;
  address: string | null;
}): Promise<{
  subject: string;
  body: string;
  usage: { prompt: number; completion: number; total: number };
}> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Drafting is not configured.");

  const firstName = (input.clientName ?? "").trim().split(/\s+/)[0] || "there";
  const prompt = [
    `Channel: ${input.channel === "text" ? "text message" : "email"}`,
    `Sender role: ${input.audience === "agent" ? "real estate agent" : "mortgage loan officer"}`,
    `Sender name: ${input.senderName ?? "their agent"}`,
    `Homeowner first name: ${firstName}`,
    input.address ? `Property: ${input.address}` : "",
    `Conversation topic: ${categoryLabel(input.category)}`,
    `Facts we may reference: ${input.reasons.slice(0, 3).join("; ") || "none"}`,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({
      model: MODEL_LIGHT,
      messages: [
        { role: "system", content: DRAFT_SYSTEM },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "draft",
          schema: {
            type: "object",
            properties: { subject: { type: "string" }, body: { type: "string" } },
            required: ["subject", "body"],
            additionalProperties: false,
          },
          strict: false,
        },
      },
    }),
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error("The assistant is busy — try again in a moment.");
    if (res.status === 402) throw new Error("AI credits are exhausted for this workspace.");
    throw new Error(`AI Gateway ${res.status}`);
  }
  const json: any = await res.json();
  const content: string = json?.choices?.[0]?.message?.content ?? "";
  let parsed: any = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : {};
  }
  const u = json?.usage ?? {};
  return {
    subject: String(parsed.subject ?? "").slice(0, 160),
    body: String(parsed.body ?? "").slice(0, 2000),
    usage: {
      prompt: Number(u.prompt_tokens ?? 0),
      completion: Number(u.completion_tokens ?? 0),
      total: Number(u.total_tokens ?? 0),
    },
  };
}

/** Cache the recommended action + draft so re-rendering the card is free. */
export async function saveAction(args: {
  opportunityId: string;
  orgId: string;
  clientId: string;
  audience: Audience;
  temperature: Temperature;
  rank: number;
  channel: "call" | "text" | "email";
  actionKey: string;
  headline: string;
  why: string;
  subject?: string | null;
  body?: string | null;
  model?: string | null;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("opportunity_actions").upsert(
    {
      opportunity_id: args.opportunityId,
      org_id: args.orgId,
      portfolio_client_id: args.clientId,
      audience: args.audience,
      temperature: args.temperature,
      rank_score: args.rank,
      channel: args.channel,
      action_key: args.actionKey,
      headline: args.headline,
      why: args.why,
      draft_subject: args.subject ?? null,
      draft_body: args.body ?? null,
      draft_model: args.model ?? null,
      drafted_at: args.body ? new Date().toISOString() : null,
    },
    { onConflict: "opportunity_id,audience" },
  );
}
