/**
 * Server-only helpers for the business copilot search.
 *
 * The model NEVER writes or runs SQL. It only turns a plain-English question
 * into a typed filter object, which this module validates and then applies to
 * an ordinary org-scoped query. That keeps the blast radius of a bad or
 * adversarial prompt to "wrong filter", never "wrong tenant".
 */

import { z } from "zod";
import { MODEL_LIGHT } from "./documents-ai.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export const FilterSchema = z.object({
  /** Free-text match against client name (partial, case-insensitive). */
  name: z.string().max(80).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
  state: z.string().max(20).nullable().optional(),
  zip: z.string().max(12).nullable().optional(),
  min_equity_dollars: z.number().nullable().optional(),
  max_equity_dollars: z.number().nullable().optional(),
  min_rate: z.number().nullable().optional(),
  max_rate: z.number().nullable().optional(),
  min_loan_dollars: z.number().nullable().optional(),
  max_loan_dollars: z.number().nullable().optional(),
  min_years_since_close: z.number().nullable().optional(),
  max_years_since_close: z.number().nullable().optional(),
  intent: z.enum(["high", "medium", "low", "any"]).nullable().optional(),
  opportunity_category: z.string().max(40).nullable().optional(),
  not_contacted_days: z.number().nullable().optional(),
  has_email: z.boolean().nullable().optional(),
  sort: z
    .enum(["intent", "equity", "rate", "savings", "name", "recent"])
    .nullable()
    .optional(),
  limit: z.number().nullable().optional(),
  summary: z.string().max(200).nullable().optional(),
});

export type CopilotFilter = z.infer<typeof FilterSchema>;

const JSON_SCHEMA = {
  type: "object",
  properties: {
    name: { type: ["string", "null"] },
    city: { type: ["string", "null"] },
    state: { type: ["string", "null"] },
    zip: { type: ["string", "null"] },
    min_equity_dollars: { type: ["number", "null"] },
    max_equity_dollars: { type: ["number", "null"] },
    min_rate: { type: ["number", "null"] },
    max_rate: { type: ["number", "null"] },
    min_loan_dollars: { type: ["number", "null"] },
    max_loan_dollars: { type: ["number", "null"] },
    min_years_since_close: { type: ["number", "null"] },
    max_years_since_close: { type: ["number", "null"] },
    intent: { type: ["string", "null"] },
    opportunity_category: { type: ["string", "null"] },
    not_contacted_days: { type: ["number", "null"] },
    has_email: { type: ["boolean", "null"] },
    sort: { type: ["string", "null"] },
    limit: { type: ["number", "null"] },
    summary: { type: "string" },
  },
  required: ["summary"],
};

const SYSTEM = `You translate a mortgage/real-estate professional's plain-English question about their own client book into a filter object. You never answer the question yourself and you never invent clients.

Fields you may set (leave anything not asked for as null):
- name: a person's name or partial name mentioned in the question
- city / state / zip: location the question names
- min_equity_dollars / max_equity_dollars: equity bands in dollars
- min_rate / max_rate: mortgage interest rate in percent (e.g. 6.5)
- min_loan_dollars / max_loan_dollars: original loan amount
- min_years_since_close / max_years_since_close: how long ago they closed
- intent: "high", "medium", "low" or "any" — set when the question mentions intent, likely sellers, "thinking of moving", "hot" clients
- opportunity_category: one of refi, cash_out, sell, hpi, maintenance when the question names an opportunity type
- not_contacted_days: set when the question asks who hasn't been contacted/touched in N days ("in a while" = 90)
- has_email: true when the question implies emailable clients
- sort: intent | equity | rate | savings | name | recent
- limit: integer 1-100 when the question asks for "top N"
- summary: a short plain-English restatement of the filter you applied, e.g. "Clients named Alba" or "High intent clients in 30907"

Return strict JSON only.`;

export async function parseQuestionToFilter(
  question: string,
): Promise<{ filter: CopilotFilter; usage: { prompt: number; completion: number; total: number } }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Copilot is not configured (missing LOVABLE_API_KEY).");

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({
      model: MODEL_LIGHT,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: question.slice(0, 500) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "client_filter", schema: JSON_SCHEMA, strict: false },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("The assistant is busy right now — try again in a moment.");
    if (res.status === 402)
      throw new Error("AI credits are exhausted for this workspace. Add credits to keep using search.");
    throw new Error(`AI Gateway ${res.status}: ${body.slice(0, 200)}`);
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

  const safe = FilterSchema.safeParse({
    ...parsed,
    intent: ["high", "medium", "low", "any"].includes(parsed?.intent) ? parsed.intent : null,
    sort: ["intent", "equity", "rate", "savings", "name", "recent"].includes(parsed?.sort)
      ? parsed.sort
      : null,
  });

  const u = json?.usage ?? {};
  return {
    filter: safe.success ? safe.data : { summary: "All clients" },
    usage: {
      prompt: Number(u.prompt_tokens ?? 0),
      completion: Number(u.completion_tokens ?? 0),
      total: Number(u.total_tokens ?? 0),
    },
  };
}

export type CopilotClient = {
  id: string;
  portfolio_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  rate: number | null;
  loan_cents: number | null;
  balance_cents: number | null;
  value_cents: number | null;
  equity_cents: number;
  savings_per_month: number;
  close_date: string | null;
  years_since_close: number;
  intent: "high" | "medium" | "low" | null;
  intent_score: number | null;
  categories: string[];
  last_contact_at: string | null;
};

const CATEGORY_ALIASES: Record<string, string> = {
  refinance: "refi",
  refi: "refi",
  "cash out": "cash_out",
  cash_out: "cash_out",
  cashout: "cash_out",
  sell: "sell",
  selling: "sell",
  seller: "sell",
  listing: "sell",
  hpi: "hpi",
  maintenance: "maintenance",
  home_care: "maintenance",
};

export function applyFilter(rows: CopilotClient[], f: CopilotFilter): CopilotClient[] {
  const nameQ = f.name?.trim().toLowerCase();
  const cityQ = f.city?.trim().toLowerCase();
  const stateQ = f.state?.trim().toLowerCase();
  const zipQ = f.zip?.trim();
  const cat = f.opportunity_category
    ? CATEGORY_ALIASES[f.opportunity_category.trim().toLowerCase()] ??
      f.opportunity_category.trim().toLowerCase()
    : null;
  const now = Date.now();

  let out = rows.filter((r) => {
    if (nameQ && !(r.name ?? "").toLowerCase().includes(nameQ)) return false;
    if (cityQ && (r.city ?? "").toLowerCase() !== cityQ) return false;
    if (stateQ && (r.state ?? "").toLowerCase() !== stateQ) return false;
    if (zipQ && (r.zip ?? "") !== zipQ) return false;
    if (f.min_equity_dollars != null && r.equity_cents / 100 < f.min_equity_dollars) return false;
    if (f.max_equity_dollars != null && r.equity_cents / 100 > f.max_equity_dollars) return false;
    if (f.min_rate != null && (r.rate ?? -1) < f.min_rate) return false;
    if (f.max_rate != null && (r.rate ?? 999) > f.max_rate) return false;
    if (f.min_loan_dollars != null && (r.loan_cents ?? 0) / 100 < f.min_loan_dollars) return false;
    if (f.max_loan_dollars != null && (r.loan_cents ?? 0) / 100 > f.max_loan_dollars) return false;
    if (f.min_years_since_close != null && r.years_since_close < f.min_years_since_close) return false;
    if (f.max_years_since_close != null && r.years_since_close > f.max_years_since_close) return false;
    if (f.intent && f.intent !== "any" && r.intent !== f.intent) return false;
    if (cat && !r.categories.includes(cat)) return false;
    if (f.has_email && !r.email) return false;
    if (f.not_contacted_days != null) {
      const cutoff = now - f.not_contacted_days * 86400000;
      if (r.last_contact_at && new Date(r.last_contact_at).getTime() > cutoff) return false;
    }
    return true;
  });

  const rank = { high: 3, medium: 2, low: 1 } as Record<string, number>;
  switch (f.sort) {
    case "equity":
      out.sort((a, b) => b.equity_cents - a.equity_cents);
      break;
    case "rate":
      out.sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));
      break;
    case "savings":
      out.sort((a, b) => b.savings_per_month - a.savings_per_month);
      break;
    case "name":
      out.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
      break;
    case "recent":
      out.sort((a, b) => (b.close_date ?? "").localeCompare(a.close_date ?? ""));
      break;
    case "intent":
    default:
      out.sort(
        (a, b) =>
          (rank[b.intent ?? ""] ?? 0) - (rank[a.intent ?? ""] ?? 0) ||
          (b.intent_score ?? 0) - (a.intent_score ?? 0) ||
          b.equity_cents - a.equity_cents,
      );
  }

  const limit = f.limit != null ? Math.max(1, Math.min(100, Math.round(f.limit))) : 50;
  return out.slice(0, limit);
}

/** Which extra columns to show, based on what the question asked about. */
export function columnsFor(f: CopilotFilter): string[] {
  const cols: string[] = [];
  if (f.intent && f.intent !== "any") cols.push("intent");
  if (f.min_rate != null || f.max_rate != null || f.sort === "rate") cols.push("rate");
  if (f.min_equity_dollars != null || f.max_equity_dollars != null || f.sort === "equity")
    cols.push("equity");
  if (f.sort === "savings") cols.push("savings");
  if (f.not_contacted_days != null) cols.push("last_contact");
  if (cols.length === 0) cols.push("intent");
  return cols;
}
