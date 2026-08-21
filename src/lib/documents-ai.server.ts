/**
 * Server-only document intelligence.
 *
 * Reads ANY uploaded home document (inspection report, insurance policy,
 * warranty, permit/invoice, deed) with the Lovable AI Gateway multimodal
 * file input, and returns:
 *  - facts: structured key/value data pulled off the page
 *  - actions: forward-looking things the homeowner should plan for
 *
 * Inspection reports keep their dedicated findings extractor
 * (`inspection.server.ts`); this module adds everything else plus the
 * shared prediction layer.
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

/** Cheap tier — classification and short structured reads. */
export const MODEL_LIGHT = "google/gemini-3.1-flash-lite";
/** Full document reads (multi-page PDFs). */
export const MODEL_DOC = "google/gemini-3.6-flash";

export type DocKind = "inspection" | "insurance" | "warranty" | "permit" | "deed" | "other";

export type DocFact = {
  label: string;
  value: string | null;
  value_date: string | null;
  value_cents: number | null;
  system: string | null;
  source_excerpt: string | null;
};

export type PredictedAction = {
  action_key: string;
  title: string;
  why: string | null;
  system: string | null;
  service_category: string | null;
  urgency: "immediate" | "12_months" | "1_3_years" | "monitor";
  due_from: string | null;
  due_by: string | null;
  est_cost_low_cents: number | null;
  est_cost_high_cents: number | null;
};

export type DocAnalysis = {
  kind: DocKind;
  facts: DocFact[];
  actions: PredictedAction[];
  usage: { prompt: number; completion: number; total: number };
};

const CATEGORIES =
  "Roofing, HVAC, Plumbing, Electrical, Foundation, Water Heater, Appliances, Windows, Flooring, Water & Mold Restoration, Junk Removal, Movers";

const KIND_GUIDE: Record<DocKind, string> = {
  inspection: `A home inspection report. Facts: inspection date, inspector, overall condition per system. Actions: repairs and replacements the report implies, with timing.`,
  insurance: `A homeowners insurance policy or declarations page. Facts: carrier, policy number, dwelling coverage amount, deductible, effective date, renewal/expiration date, notable exclusions (e.g. roof surfacing ACV, water backup excluded). Actions: renewal review before expiry, coverage gaps worth fixing, documentation the carrier will want.`,
  warranty: `A warranty, service contract, or appliance manual. Facts: covered system/appliance, brand, model, serial, purchase/install date, warranty length, expiration date, provider. Actions: service or replace while covered, register the warranty, schedule the covered maintenance the terms require.`,
  permit: `A building permit, contractor invoice, or receipt for work done on the home. Facts: work performed, permit number, contractor, permit/work date, final/close-out date, declared cost. Actions: the follow-up the work implies (e.g. re-inspection, filter or sealant schedule started by the install, next service due date).`,
  deed: `A deed, title, closing disclosure, or mortgage document. Facts: purchase date, purchase price, lender, loan amount, rate, term, escrow items. Actions: none unless a dated obligation is stated (e.g. PMI removal eligibility, escrow review).`,
  other: `An unclassified home document. Extract whatever dated, financial or system-related facts it contains and only propose actions the document clearly supports.`,
};

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string" },
    facts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          value: { type: ["string", "null"] },
          value_date: { type: ["string", "null"] },
          value_cents: { type: ["integer", "null"] },
          system: { type: ["string", "null"] },
          source_excerpt: { type: ["string", "null"] },
        },
        required: ["label"],
      },
    },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          why: { type: ["string", "null"] },
          system: { type: ["string", "null"] },
          service_category: { type: ["string", "null"] },
          urgency: { type: ["string", "null"] },
          due_from: { type: ["string", "null"] },
          due_by: { type: ["string", "null"] },
          est_cost_low_cents: { type: ["integer", "null"] },
          est_cost_high_cents: { type: ["integer", "null"] },
        },
        required: ["title"],
      },
    },
  },
  required: ["kind", "facts", "actions"],
};

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(bin);
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function isoDate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : s;
}

const URGENCIES = new Set(["immediate", "12_months", "1_3_years", "monitor"]);

/**
 * Reads a document and returns structured facts + predicted actions.
 * `declaredKind` is the homeowner's own label; the model may correct it.
 */
export async function analyzeDocument(opts: {
  fileBytes: Uint8Array;
  mimeType: string;
  filename: string;
  declaredKind: string;
  language?: "en" | "es";
  homeContext?: string;
}): Promise<DocAnalysis> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

  const declared = (
    ["inspection", "insurance", "warranty", "permit", "deed", "other"].includes(opts.declaredKind)
      ? opts.declaredKind
      : "other"
  ) as DocKind;

  const today = new Date().toISOString().slice(0, 10);
  const system = [
    `You are SuCasa's home document analyst. Today is ${today}.`,
    `You will receive one document a homeowner uploaded. The homeowner labeled it "${declared}".`,
    `First decide its true kind: inspection, insurance, warranty, permit, deed, or other. ${KIND_GUIDE[declared]}`,
    `Then extract FACTS: short label/value pairs actually printed in the document. Use value_date (YYYY-MM-DD) for dates and value_cents for money (US cents, integer). Never guess a value that is not in the document.`,
    `Then propose ACTIONS: things this homeowner should plan for, derived from the document. Each action needs a plain-English title a 5th grader understands, a one-sentence "why" that cites the document, an urgency (immediate, 12_months, 1_3_years, monitor), a due window (due_from/due_by as YYYY-MM-DD when the document implies dates), a typical US cost range in cents when the work has one, and the best SuCasa service category from: ${CATEGORIES} (or null).`,
    `Return at most 12 facts and 6 actions. Prefer fewer, higher-confidence items. Return strict JSON only.`,
    opts.homeContext ? `Home context (for relevance only, do not restate):\n${opts.homeContext}` : "",
    opts.language === "es"
      ? "Escribe todos los textos libres (label, value, title, why) en español."
      : "Write all free text in English.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const b64 = bytesToBase64(opts.fileBytes);
  const isImage = opts.mimeType.startsWith("image/");
  const userContent: any[] = [
    { type: "text", text: "Analyze this home document and return the JSON described." },
  ];
  if (isImage) {
    userContent.push({ type: "image_url", image_url: { url: `data:${opts.mimeType};base64,${b64}` } });
  } else {
    userContent.push({
      type: "file",
      file: {
        filename: opts.filename,
        file_data: `data:${opts.mimeType || "application/pdf"};base64,${b64}`,
      },
    });
  }

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({
      model: MODEL_DOC,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "home_document_analysis", schema: RESPONSE_SCHEMA, strict: false },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI Gateway ${res.status}: ${body.slice(0, 300)}`);
  }

  const json: any = await res.json();
  const content: string = json?.choices?.[0]?.message?.content ?? "";
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Model did not return JSON");
    parsed = JSON.parse(m[0]);
  }

  const kindRaw = String(parsed?.kind ?? declared).toLowerCase();
  const kind = (["inspection", "insurance", "warranty", "permit", "deed", "other"].includes(kindRaw)
    ? kindRaw
    : declared) as DocKind;

  const facts: DocFact[] = (Array.isArray(parsed?.facts) ? parsed.facts : [])
    .slice(0, 12)
    .map((f: any) => ({
      label: String(f?.label ?? "").slice(0, 120),
      value: f?.value != null ? String(f.value).slice(0, 300) : null,
      value_date: isoDate(f?.value_date),
      value_cents: typeof f?.value_cents === "number" ? Math.round(f.value_cents) : null,
      system: f?.system ? String(f.system).slice(0, 40) : null,
      source_excerpt: f?.source_excerpt ? String(f.source_excerpt).slice(0, 300) : null,
    }))
    .filter((f: DocFact) => f.label.length > 0);

  const actions: PredictedAction[] = (Array.isArray(parsed?.actions) ? parsed.actions : [])
    .slice(0, 6)
    .map((a: any) => {
      const title = String(a?.title ?? "").slice(0, 200);
      const urgency = URGENCIES.has(String(a?.urgency)) ? String(a.urgency) : "monitor";
      return {
        action_key: `${kind}:${slug(title)}`,
        title,
        why: a?.why ? String(a.why).slice(0, 400) : null,
        system: a?.system ? String(a.system).slice(0, 40) : null,
        service_category: a?.service_category ? String(a.service_category).slice(0, 60) : null,
        urgency: urgency as PredictedAction["urgency"],
        due_from: isoDate(a?.due_from),
        due_by: isoDate(a?.due_by),
        est_cost_low_cents:
          typeof a?.est_cost_low_cents === "number" ? Math.max(0, Math.round(a.est_cost_low_cents)) : null,
        est_cost_high_cents:
          typeof a?.est_cost_high_cents === "number" ? Math.max(0, Math.round(a.est_cost_high_cents)) : null,
      };
    })
    .filter((a: PredictedAction) => a.title.length > 0);

  const u = json?.usage ?? {};
  return {
    kind,
    facts,
    actions,
    usage: {
      prompt: Number(u.prompt_tokens ?? 0),
      completion: Number(u.completion_tokens ?? 0),
      total: Number(u.total_tokens ?? 0),
    },
  };
}

/**
 * Turns inspection findings into the same predicted-action shape so Home Care
 * shows one unified list no matter which document produced the insight.
 */
export function actionsFromFindings(
  findings: Array<{
    system: string;
    condition: string | null;
    urgency: string | null;
    remaining_life_years: number | null;
    defects: string[];
    recommended_action: string | null;
    recommended_category: string | null;
  }>,
): PredictedAction[] {
  const now = new Date();
  return findings
    .filter((f) => f.recommended_action || f.defects.length)
    .slice(0, 8)
    .map((f) => {
      const urgency = URGENCIES.has(String(f.urgency)) ? String(f.urgency) : "monitor";
      const months = urgency === "immediate" ? 1 : urgency === "12_months" ? 12 : urgency === "1_3_years" ? 36 : 60;
      const due = new Date(now.getTime());
      due.setMonth(due.getMonth() + months);
      const title = f.recommended_action || `Address ${f.system.replace(/_/g, " ")} issues`;
      return {
        action_key: `inspection:${slug(f.system + "-" + title)}`,
        title: title.slice(0, 200),
        why:
          f.defects.length > 0
            ? `Your inspection report noted: ${f.defects.slice(0, 2).join("; ")}.`
            : `Flagged on your inspection report.`,
        system: f.system,
        service_category: f.recommended_category,
        urgency: urgency as PredictedAction["urgency"],
        due_from: now.toISOString().slice(0, 10),
        due_by: due.toISOString().slice(0, 10),
        est_cost_low_cents: null,
        est_cost_high_cents: null,
      };
    });
}
