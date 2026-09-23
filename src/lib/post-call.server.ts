/**
 * Post-call voice note — server side.
 *
 * Context gathering is deliberately narrow: only what the professional can
 * already see about a client in their own book. The AI call uses the gateway
 * Responses API with a strict output schema; malformed output throws and
 * nothing is written.
 */
import { z } from "zod";
import {
  PostCallInterpretationSchema,
  normalizeFollowUpDate,
  type PostCallInterpretation,
} from "./post-call";

const RESPONSES_URL = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-6-astra";

export interface PostCallContext {
  orgId: string;
  opportunityId: string | null;
  clientEmail: string | null;
  prompt: string;
}

/**
 * Verify the caller can act on this client (same scope resolution the Today
 * queues use) and assemble the narrow context the AI is allowed to see.
 */
export async function gatherPostCallContext(
  supabase: any,
  userId: string,
  audience: "agent" | "lender",
  clientId: string,
): Promise<PostCallContext> {
  const { resolveScope } = await import("./nba.server");
  const scope = await resolveScope(supabase, userId, audience);
  if (!scope.orgIds.length) throw new Error("No workspace found.");

  const { data: client } = await supabase
    .from("lender_portfolio_clients")
    .select("id, portfolio_id, client_name, client_email, city, state")
    .eq("id", clientId)
    .maybeSingle();
  if (!client || !scope.bookIds.includes(client.portfolio_id)) {
    throw new Error("That homeowner is not in your book.");
  }
  const orgId = scope.orgByBook.get(client.portfolio_id) ?? scope.orgIds[0]!;

  const [{ data: opp }, { data: outcomes }, { data: convos }] = await Promise.all([
    supabase
      .from("homeowner_opportunities")
      .select("id, category, strength, reasons")
      .eq("portfolio_client_id", clientId)
      .eq("state", "open")
      .order("score", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("opportunity_outcomes")
      .select("stage, note, next_step, next_step_due_at, occurred_at")
      .eq("portfolio_client_id", clientId)
      .order("occurred_at", { ascending: false })
      .limit(3),
    supabase
      .from("professional_conversations")
      .select("summary, follow_up_timeframe_text, created_at")
      .eq("portfolio_client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const lastOutcome = (outcomes ?? [])[0] ?? null;
  const role = audience === "agent" ? "real estate agent" : "mortgage loan officer";

  const lines: string[] = [
    `Professional role: ${role}`,
    `Homeowner first name or name: ${client.client_name ?? "unknown"}`,
    `Home location: ${[client.city, client.state].filter(Boolean).join(", ") || "unknown"}`,
  ];
  if (opp) {
    lines.push(
      `Current conversation topic: ${opp.category} (${(opp.reasons ?? [])[0] ?? "signal detected"})`,
    );
  }
  if (lastOutcome) {
    lines.push(
      `Previous touch: ${lastOutcome.stage}${
        lastOutcome.next_step
          ? `; planned next step was "${lastOutcome.next_step}"${
              lastOutcome.next_step_due_at ? ` due ${lastOutcome.next_step_due_at}` : ""
            }`
          : ""
      }`,
    );
  }
  const lastConvo = (convos ?? [])[0] ?? null;
  if (lastConvo) lines.push(`Previous conversation summary: ${lastConvo.summary}`);

  return {
    orgId,
    opportunityId: opp?.id ?? null,
    clientEmail: client.client_email ?? null,
    prompt: lines.join("\n"),
  };
}

/** Strict-compatible output schema (every property required, nullable where optional). */
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    originalLanguage: { type: "string", enum: ["en", "es", "mixed"] },
    outcome: {
      type: "string",
      enum: ["no_answer", "talked", "appointment", "application", "closed", "not_interested"],
    },
    keyFacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          fact: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["fact", "confidence"],
      },
    },
    nextStep: { type: ["string", "null"] },
    followUp: {
      type: "object",
      additionalProperties: false,
      properties: {
        required: { type: "boolean" },
        date: { type: ["string", "null"] },
        timeframeText: { type: ["string", "null"] },
        reason: { type: ["string", "null"] },
      },
      required: ["required", "date", "timeframeText", "reason"],
    },
    suggestedFutureOpener: { type: ["string", "null"] },
  },
  required: [
    "summary",
    "originalLanguage",
    "outcome",
    "keyFacts",
    "nextStep",
    "followUp",
    "suggestedFutureOpener",
  ],
} as const;

/** Read a Responses SSE stream; returns the final output text. */
async function readResponsesStream(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("AI response had no body.");
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let completed: string | null = null;
  let failed: string | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const data = rawEvent
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("\n");
      if (!data || data === "[DONE]") continue;
      try {
        const ev = JSON.parse(data);
        if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") {
          text += ev.delta;
        } else if (ev.type === "response.completed") {
          const t = ev.response?.output_text;
          if (typeof t === "string" && t) completed = t;
        } else if (ev.type === "response.failed" || ev.type === "response.error" || ev.type === "error") {
          failed = ev.response?.error?.message ?? ev.error?.message ?? ev.message ?? "AI request failed";
        }
      } catch {
        /* keep accumulating */
      }
    }
  }
  if (failed) throw new Error(failed);
  const finalText = text || completed;
  if (!finalText) throw new Error("The AI returned an empty result. Nothing was saved.");
  return finalText;
}

/**
 * Turn a transcript into a structured, reviewable interpretation.
 * Throws on any gateway failure or malformed output — callers save nothing.
 */
export async function interpretTranscript(args: {
  apiKey: string;
  context: PostCallContext;
  transcript: string;
  timezone: string;
  now?: Date;
}): Promise<PostCallInterpretation> {
  const { apiKey, context, transcript, timezone } = args;
  const now = args.now ?? new Date();
  const today =
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now) || now.toISOString().slice(0, 10);

  const instructions = [
    "You are SuCasa's post-call assistant for real estate and mortgage professionals.",
    "The professional just finished a phone call with a homeowner in their own book and recorded a short voice note about it.",
    "The note may be in English, Spanish, or a natural mix of both. Understand all three; never translate the meaning away.",
    "Return ONLY the structured object. Rules:",
    "- summary: 1-3 sentences in the SAME language the professional predominantly used.",
    "- originalLanguage: en, es, or mixed.",
    "- outcome: pick the single best fit. no_answer if they did not reach the person; talked for a conversation with no commitment; appointment if a meeting/call was scheduled; application if an application or pre-approval step was agreed; closed if business was completed; not_interested if the homeowner declined.",
    "- keyFacts: durable things learned about the homeowner's plans, timing, family, finances or property (0-8 items). confidence 0-1. Never restate contact details or property facts already known.",
    "- nextStep: the single next thing the professional should do, or null.",
    "- followUp.required: true only when the professional expressed intent to reconnect later.",
    `- followUp.date: resolve natural language to YYYY-MM-DD. Today is ${today} and the professional's timezone is ${timezone}. Resolve relative phrasing in both languages (tomorrow/mañana, next Friday/el viernes que viene, in two weeks/en dos semanas, after Thanksgiving/después de Acción de Gracias). For intentionally broad timing ("first week of January", "after the holidays", "sometime next month"), pick one reasonable date inside that window.`,
    "- followUp.timeframeText: the professional's original timing words, verbatim, or null if none.",
    "- followUp.reason: why the follow-up matters (e.g. a promise made), or null.",
    "- suggestedFutureOpener: one warm, natural sentence the professional could open the next conversation with, referencing what was discussed. Same language as the note. Null if no follow-up.",
    "Never invent facts. When unsure, prefer lower confidence and fewer facts.",
  ].join("\n");

  const res = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MODEL,
      instructions,
      input: `${context.prompt}\n\nVoice note transcript:\n"""${transcript}"""`,
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      text: {
        format: {
          type: "json_schema",
          name: "post_call_note",
          strict: true,
          schema: OUTPUT_SCHEMA,
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[post-call] gateway failed [${res.status}]: ${body}`);
    throw new Error(`AI request failed [${res.status}]. Nothing was saved.`);
  }

  const raw = await readResponsesStream(res);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The AI returned malformed output. Nothing was saved.");
  }
  const result = PostCallInterpretationSchema.safeParse(parsed);
  if (!result.success) {
    console.error(`[post-call] schema mismatch: ${result.error.message}`);
    throw new Error("The AI returned malformed output. Nothing was saved.");
  }

  const interpretation = result.data;
  // Server-side guard: an unusable AI date is dropped, never silently kept.
  interpretation.followUp.date = normalizeFollowUpDate(interpretation.followUp.date, now);
  if (!interpretation.followUp.required) {
    interpretation.followUp.date = null;
  }
  return interpretation;
}

export const TranscriptInput = z.string().min(3).max(8000);
