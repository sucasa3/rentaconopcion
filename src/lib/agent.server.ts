/**
 * HOME AGENT — server brain.
 *
 * Builds the grounded home context, runs the tool-using loop against the
 * Lovable AI Gateway, and enforces the permission ladder before anything is
 * ever actually done. Server-only: never imported from a component.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  CAPABILITIES,
  defaultPermissions,
  type CapabilityKey,
  type PermissionLevel,
} from "@/lib/agent-core";

type DB = SupabaseClient<Database>;

// Keep the agent-side portfolio intelligence exports stable while the Home
// Agent uses this same server-only module.
export {
  extractOwnership,
  extractCharacteristics,
  extractTaxTrend,
  computeMoveScore,
  computeListingReadiness,
  draftOpener,
} from "./agent-portfolio-helpers";


const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.7-flash";
const MAX_STEPS = 6;

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export async function loadPermissions(
  supabase: DB,
  userId: string,
): Promise<Record<CapabilityKey, PermissionLevel>> {
  const perms = defaultPermissions();
  const { data } = await supabase
    .from("agent_permissions")
    .select("capability, level")
    .eq("user_id", userId);
  for (const row of data ?? []) {
    const cap = row.capability as CapabilityKey;
    if (cap in perms) perms[cap] = Math.min(5, Math.max(1, row.level)) as PermissionLevel;
  }
  return perms;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export type HomeContext = {
  language: "en" | "es";
  lines: string[];
};

export async function buildHomeContext(supabase: DB, userId: string): Promise<HomeContext> {
  const [{ data: profile }, { data: findings }, { data: requests }, { data: planRow }, { data: memory }, { data: intents }, { data: log }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, address, city, state, zip, language")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("home_inspection_findings")
        .select("system, condition, urgency, defects, recommended_action, recommended_category")
        .eq("user_id", userId)
        .limit(20),
      supabase
        .from("service_requests")
        .select("category, status, created_at")
        .eq("homeowner_id", userId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase.from("home_plans").select("plan, ai_why").eq("user_id", userId).maybeSingle(),
      supabase
        .from("home_memory")
        .select("kind, label, value, confidence")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(40),
      supabase
        .from("homeowner_intents")
        .select("intent_type, confidence, evidence, status")
        .eq("user_id", userId)
        .eq("status", "active"),
      supabase
        .from("home_component_service_log")
        .select("component_key, action, serviced_on, provider")
        .eq("user_id", userId)
        .order("serviced_on", { ascending: false })
        .limit(10),
    ]);

  const lines: string[] = ["=== HOME RECORD ==="];
  if (profile?.full_name) lines.push(`Homeowner: ${profile.full_name}`);
  const addr = [profile?.address, profile?.city, profile?.state, profile?.zip]
    .filter(Boolean)
    .join(", ");
  if (addr) lines.push(`Address: ${addr}`);

  if (profile?.address) {
    try {
      const {
        getPropertyIntel,
        extractAvm,
        extractDetail,
        extractMortgage,
        extractSales,
        extractTax,
        computeEquityRibbon,
        estimateLoanBalance,
      } = await import("@/lib/valuation.server");
      const intel = await getPropertyIntel(addr, {
        classes: ["avm", "detail", "mortgage", "sales", "tax"],
        cachedOnlyClasses: ["sales", "tax"],
        requestedBy: userId,
        revenueSource: "assistant_context",
      });
      const avm = extractAvm(intel.classes.avm?.data);
      const detail = extractDetail(intel.classes.detail?.data);
      const mortgage = extractMortgage(intel.classes.mortgage?.data);
      const sales = extractSales(intel.classes.sales?.data);
      const tax = intel.classes.tax ? extractTax(intel.classes.tax.data) : null;
      const equity = computeEquityRibbon(avm, mortgage, sales, tax);
      const balance = mortgage ? estimateLoanBalance(mortgage) : null;
      const value = equity.estimatedValue ?? avm?.estimate ?? null;
      if (detail?.yearBuilt) lines.push(`Year built: ${detail.yearBuilt}`);
      if (detail?.sqft) lines.push(`Size: ${detail.sqft} sqft`);
      if (value) lines.push(`Estimated value: $${Math.round(value).toLocaleString()}`);
      if (equity?.equityDollars != null)
        lines.push(`Equity: $${Math.round(equity.equityDollars).toLocaleString()}`);
      if (mortgage?.interestRate != null) lines.push(`Mortgage rate: ${mortgage.interestRate}%`);
      if (balance != null) lines.push(`Loan balance: $${Math.round(balance).toLocaleString()}`);
    } catch (e) {
      console.warn("[home-agent] intel skipped:", (e as Error).message);
    }
  }

  const aiWhy = (planRow?.ai_why ?? {}) as Record<string, string>;
  const planItems = (((planRow?.plan as { items?: any[] } | null)?.items ?? []) as any[]).slice(0, 12);
  if (planItems.length) {
    lines.push("\nHome plan (what this home needs):");
    for (const i of planItems) {
      lines.push(`- [${i.horizon ?? "?"}] ${i.title} — ${aiWhy[i.key] ?? i.why ?? ""}`.slice(0, 220));
    }
  }

  if ((findings ?? []).length) {
    lines.push("\nInspection findings:");
    for (const f of findings ?? []) {
      lines.push(
        `- ${f.system}${f.urgency ? ` (${f.urgency})` : ""}: ${
          Array.isArray(f.defects) ? (f.defects as string[]).slice(0, 2).join("; ") : "—"
        }${f.recommended_action ? ` → ${f.recommended_action}` : ""}`,
      );
    }
  }

  if ((log ?? []).length) {
    lines.push("\nRecent service log:");
    for (const l of log ?? [])
      lines.push(`- ${l.component_key}: ${l.action}${l.serviced_on ? ` on ${l.serviced_on}` : ""}`);
  }

  if ((requests ?? []).length) {
    lines.push("\nService requests:");
    for (const r of requests ?? [])
      lines.push(`- ${r.category} — ${r.status} (${new Date(r.created_at).toLocaleDateString()})`);
  }

  if ((memory ?? []).length) {
    lines.push("\nWhat I remember about this homeowner:");
    for (const m of memory ?? []) lines.push(`- [${m.kind}] ${m.label}: ${m.value ?? ""}`);
  }

  if ((intents ?? []).length) {
    lines.push("\nActive intents:");
    for (const i of intents ?? [])
      lines.push(`- ${i.intent_type} (confidence ${i.confidence})${i.evidence ? ` — ${i.evidence}` : ""}`);
  }

  return { language: profile?.language === "es" ? "es" : "en", lines };
}

function systemPrompt(ctx: HomeContext, perms: Record<CapabilityKey, PermissionLevel>): string {
  const permLines = CAPABILITIES.map((c) => `- ${c.key}: level ${perms[c.key]}`).join("\n");
  return [
    `You are the SuCasa Home Agent — an AI that actively takes care of ONE specific home.`,
    `You are not a chatbot. You observe the home record, understand what the homeowner wants, prioritize what matters, recommend, and — where you are allowed — prepare or take action.`,
    `Be concise and plain-spoken. Short paragraphs, bullets when useful, under ~180 words unless depth is asked for. Never invent numbers or facts that are not in the record; if something is missing, say so and offer to find it.`,
    ctx.language === "es"
      ? `IMPORTANTE: responde SIEMPRE en español.`
      : `Always answer in English.`,
    `PERMISSION LADDER (1 observe, 2 recommend, 3 prepare & wait for approval, 4 do it, 5 bring in a human). Current grants:\n${permLines}`,
    `Rules for tools:`,
    `- Call remember_fact whenever the homeowner tells you something durable about their home, their preferences, their plans or important dates.`,
    `- Call record_intent when the conversation reveals what they want (SELL, BUY, REFINANCE, HELOC, RENOVATE, MAINTAIN, REPAIR, INSURE, MOVE, VALUE, INVEST, FINANCIAL_PLANNING).`,
    `- Call propose_action when there is real work to do (a service request to file, maintenance to log, a professional to bring in). The system enforces permission: at level 3 it waits for a tap, at level 4 it runs.`,
    `- Never claim you did something a tool did not confirm.`,
    ctx.lines.join("\n"),
  ].join("\n\n");
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    type: "function",
    function: {
      name: "remember_fact",
      description: "Store a durable fact about this home or homeowner in long-term memory.",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["preference", "goal", "important_date", "appliance", "system", "note"],
          },
          label: { type: "string", description: "Short human label, e.g. 'Roof replaced'." },
          value: { type: "string", description: "The fact itself, in plain language." },
        },
        required: ["kind", "label", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "record_intent",
      description: "Record what the homeowner wants, with the evidence that revealed it.",
      parameters: {
        type: "object",
        properties: {
          intent_type: { type: "string" },
          confidence: { type: "number" },
          evidence: { type: "string" },
        },
        required: ["intent_type", "evidence"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_action",
      description:
        "Propose a concrete piece of work. Depending on permission level it is prepared for approval or executed now.",
      parameters: {
        type: "object",
        properties: {
          capability: {
            type: "string",
            enum: ["watch", "record_keeping", "service_request", "introductions"],
          },
          kind: {
            type: "string",
            enum: ["service_request", "log_service", "reminder", "introduction"],
          },
          title: { type: "string" },
          summary: { type: "string" },
          rationale: { type: "string", description: "Why this home needs it, from the record." },
          category: { type: "string", description: "Service category when kind=service_request." },
          component_key: { type: "string", description: "Component when kind=log_service." },
        },
        required: ["capability", "kind", "title", "rationale"],
      },
    },
  },
] as const;

// ---------------------------------------------------------------------------
// Action execution
// ---------------------------------------------------------------------------

export async function executeAction(
  supabase: DB,
  userId: string,
  action: {
    id: string;
    capability: string;
    title: string;
    summary: string | null;
    payload: Record<string, any>;
  },
): Promise<{ ok: boolean; note: string }> {
  const kind = String(action.payload?.kind ?? "reminder");
  try {
    if (kind === "service_request") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("address, city, state, zip")
        .eq("id", userId)
        .maybeSingle();
      const { error } = await supabase.from("service_requests").insert({
        homeowner_id: userId,
        category: String(action.payload?.category ?? "General"),
        description: action.summary ?? action.title,
        source: "home_agent",
        address: profile?.address ?? null,
        city: profile?.city ?? null,
        state: profile?.state ?? null,
        zip: profile?.zip ?? null,
      });
      if (error) throw error;
      return { ok: true, note: "Service request filed." };
    }
    if (kind === "log_service") {
      const { error } = await supabase.from("home_component_service_log").insert({
        user_id: userId,
        component_key: String(action.payload?.component_key ?? "general"),
        action: "serviced",
        serviced_on: new Date().toISOString().slice(0, 10),
        notes: action.summary ?? action.title,
      });
      if (error) throw error;
      return { ok: true, note: "Logged to your home record." };
    }
    return { ok: true, note: "Noted." };
  } catch (e) {
    return { ok: false, note: (e as Error).message };
  }
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

type GatewayMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
};

async function callGateway(apiKey: string, messages: GatewayMessage[]) {
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({ model: MODEL, messages, tools: TOOLS }),
  });
  if (res.status === 429)
    throw new Error("Your Home Agent is busy right now — try again in a moment.");
  if (res.status === 402)
    throw new Error("The Home Agent is temporarily unavailable (AI credits exhausted).");
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[home-agent] gateway error", res.status, body.slice(0, 400));
    throw new Error("The Home Agent couldn't respond. Please try again.");
  }
  return (await res.json()) as any;
}

export async function runAgentTurn(
  supabase: DB,
  userId: string,
  history: { role: "user" | "assistant"; content: string }[],
  question: string,
): Promise<{ answer: string; toolActivity: { tool: string; note: string }[] }> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("The Home Agent is not configured.");

  const [ctx, perms] = await Promise.all([
    buildHomeContext(supabase, userId),
    loadPermissions(supabase, userId),
  ]);

  const messages: GatewayMessage[] = [
    { role: "system", content: systemPrompt(ctx, perms) },
    ...history.slice(-12).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: question },
  ];

  const toolActivity: { tool: string; note: string }[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const json = await callGateway(apiKey, messages);
    const msg = json?.choices?.[0]?.message;
    const calls = msg?.tool_calls as any[] | undefined;

    if (!calls?.length) {
      return {
        answer:
          (msg?.content ?? "").trim() ||
          "I don't have a good answer for that yet — try asking another way?",
        toolActivity,
      };
    }

    messages.push({ role: "assistant", content: msg?.content ?? "", tool_calls: calls });

    for (const call of calls) {
      let args: any = {};
      try {
        args = JSON.parse(call.function?.arguments || "{}");
      } catch {
        args = {};
      }
      const name = call.function?.name as string;
      let result: Record<string, unknown> = { ok: false };

      if (name === "remember_fact") {
        const key = `${args.kind}:${String(args.label ?? "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .slice(0, 60)}`;
        const level = perms.record_keeping;
        if (level < 2) {
          result = { ok: false, reason: "Homeowner has not allowed record keeping." };
        } else {
          const { error } = await supabase.from("home_memory").upsert(
            {
              user_id: userId,
              kind: String(args.kind ?? "note"),
              memory_key: key,
              label: String(args.label ?? "").slice(0, 160),
              value: String(args.value ?? "").slice(0, 1000),
              source: "agent",
            },
            { onConflict: "user_id,memory_key" },
          );
          result = error ? { ok: false, reason: error.message } : { ok: true };
          if (!error) toolActivity.push({ tool: "memory", note: `Remembered: ${args.label}` });
        }
      } else if (name === "record_intent") {
        const { error } = await supabase.from("homeowner_intents").upsert(
          {
            user_id: userId,
            intent_type: String(args.intent_type ?? "").toUpperCase().slice(0, 40),
            confidence: Math.min(1, Math.max(0, Number(args.confidence ?? 0.6))),
            evidence: String(args.evidence ?? "").slice(0, 500),
            status: "active",
            source: "conversation",
          },
          { onConflict: "user_id,intent_type" },
        );
        result = error ? { ok: false, reason: error.message } : { ok: true };
        if (!error)
          toolActivity.push({ tool: "intent", note: `Noted intent: ${args.intent_type}` });
      } else if (name === "propose_action") {
        const capability = (String(args.capability ?? "watch") as CapabilityKey) in perms
          ? (String(args.capability) as CapabilityKey)
          : "watch";
        const level = perms[capability];
        const kind = String(args.kind ?? "reminder");
        const payload = { kind, category: args.category, component_key: args.component_key };
        if (level < 2) {
          result = { ok: false, reason: "This capability is set to observe only." };
        } else {
          const status = level >= 4 ? "in_progress" : "proposed";
          const { data: row, error } = await supabase
            .from("agent_actions")
            .insert({
              user_id: userId,
              capability,
              title: String(args.title ?? "").slice(0, 160),
              summary: String(args.summary ?? "").slice(0, 600) || null,
              rationale: String(args.rationale ?? "").slice(0, 600) || null,
              required_level: kind === "reminder" ? 2 : 3,
              status,
              payload,
              source_kind: "conversation",
            })
            .select("id")
            .single();
          if (error) {
            result = { ok: false, reason: error.message };
          } else if (level >= 4 && kind !== "reminder") {
            const exec = await executeAction(supabase, userId, {
              id: row.id,
              capability,
              title: String(args.title ?? ""),
              summary: String(args.summary ?? ""),
              payload,
            });
            await supabase
              .from("agent_actions")
              .update({
                status: exec.ok ? "done" : "blocked",
                result: { note: exec.note },
                completed_at: exec.ok ? new Date().toISOString() : null,
                decided_at: new Date().toISOString(),
              })
              .eq("id", row.id);
            result = { ok: exec.ok, executed: exec.ok, note: exec.note };
            toolActivity.push({ tool: "action", note: `${args.title} — ${exec.note}` });
          } else {
            result = { ok: true, executed: false, note: "Waiting for the homeowner to approve." };
            toolActivity.push({ tool: "action", note: `Proposed: ${args.title}` });
          }
        }
      } else {
        result = { ok: false, reason: "Unknown tool." };
      }

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  return {
    answer: "I looked into that but couldn't wrap it up — can you ask again?",
    toolActivity,
  };
}
