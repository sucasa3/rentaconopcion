/**
 * Server-only helpers for inspection report AI extraction.
 * Uses Lovable AI Gateway (Gemini) with multimodal file input so we can send
 * the PDF/image directly without a Node PDF parser (which won't run in the
 * Cloudflare Worker runtime).
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.6-flash";

const SYSTEM_PROMPT = `You are a home inspection analyst. You will receive a home inspection report (PDF or image).
Extract discrete findings for the major home systems that the report actually discusses.
Only include what is stated or clearly implied by the report — do not invent conditions.

For each finding return:
- system: one of roof, hvac, plumbing, electrical, foundation, water_heater, appliances, windows, exterior, interior, attic, insulation, gutters, deck, garage, chimney, other
- condition: one of good, fair, poor, end_of_life (nullable if unstated)
- remaining_life_years: integer estimate if stated or clearly implied, else null
- urgency: one of immediate, 12_months, 1_3_years, monitor (nullable)
- defects: up to 4 short bullet strings (each under 120 chars)
- recommended_action: one short sentence
- recommended_category: which SuCasa service best fits, from: Roofing, HVAC, Plumbing, Electrical, Foundation, Water Heater, Appliances, Windows, Flooring, Water & Mold Restoration, Junk Removal, Movers, or null
- source_excerpt: a short verbatim quote (under 200 chars) from the report supporting the finding

Return strict JSON only, no prose.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          system: { type: "string" },
          condition: { type: ["string", "null"] },
          remaining_life_years: { type: ["integer", "null"] },
          urgency: { type: ["string", "null"] },
          defects: { type: "array", items: { type: "string" } },
          recommended_action: { type: ["string", "null"] },
          recommended_category: { type: ["string", "null"] },
          source_excerpt: { type: ["string", "null"] },
        },
        required: ["system", "defects"],
      },
    },
  },
  required: ["findings"],
};

export type Finding = {
  system: string;
  condition: string | null;
  remaining_life_years: number | null;
  urgency: string | null;
  defects: string[];
  recommended_action: string | null;
  recommended_category: string | null;
  source_excerpt: string | null;
};

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  // btoa is available in Workers
  return btoa(bin);
}

export async function extractFindingsFromFile(
  fileBytes: Uint8Array,
  mimeType: string,
  filename: string,
  language: "en" | "es" = "en",
): Promise<Finding[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

  const b64 = bytesToBase64(fileBytes);
  const isImage = mimeType.startsWith("image/");

  const userContent: any[] = [
    {
      type: "text",
      text: "Analyze this home inspection report and extract structured findings as JSON matching the required schema.",
    },
  ];

  if (isImage) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${mimeType};base64,${b64}` },
    });
  } else {
    // PDFs and other docs go as `file` blocks per Gemini multimodal spec
    userContent.push({
      type: "file",
      file: {
        filename,
        file_data: `data:${mimeType || "application/pdf"};base64,${b64}`,
      },
    });
  }

  const body = {
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          SYSTEM_PROMPT +
          (language === "es"
            ? "\n\nEscribe los campos de texto libre (defects, recommended_action) en español."
            : ""),
      },
      { role: "user", content: userContent },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "inspection_findings", schema: RESPONSE_SCHEMA, strict: false },
    },
  };

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`AI Gateway ${res.status}: ${errBody.slice(0, 400)}`);
  }

  const json: any = await res.json();
  const content: string = json?.choices?.[0]?.message?.content ?? "";
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Try to salvage a JSON object embedded in text
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Model did not return JSON");
    parsed = JSON.parse(m[0]);
  }

  const raw: any[] = Array.isArray(parsed?.findings) ? parsed.findings : [];
  return raw.slice(0, 40).map((f) => ({
    system: String(f.system ?? "other").slice(0, 40),
    condition: f.condition ? String(f.condition).slice(0, 20) : null,
    remaining_life_years:
      typeof f.remaining_life_years === "number" ? Math.max(0, Math.min(100, f.remaining_life_years)) : null,
    urgency: f.urgency ? String(f.urgency).slice(0, 20) : null,
    defects: Array.isArray(f.defects) ? f.defects.slice(0, 4).map((d: any) => String(d).slice(0, 200)) : [],
    recommended_action: f.recommended_action ? String(f.recommended_action).slice(0, 300) : null,
    recommended_category: f.recommended_category ? String(f.recommended_category).slice(0, 60) : null,
    source_excerpt: f.source_excerpt ? String(f.source_excerpt).slice(0, 300) : null,
  }));
}
