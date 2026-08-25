/**
 * Server-only helpers for the Home Plan. The plan itself is deterministic
 * (src/lib/home-plan.ts); this module optionally upgrades each item's "why"
 * into a short personal sentence written by AI — once per plan, cached in
 * home_plans.ai_why, with the deterministic copy as fallback on any failure.
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.6-flash";

interface PlanItemForWhy {
  key: string;
  title: string;
  why: string;
  horizon: string;
  targetYear?: number | null;
}

/**
 * Returns a map of item key -> improved one-sentence "why", or null when the
 * AI is unavailable (caller keeps the deterministic why text).
 */
export async function generatePlanWhy(
  items: PlanItemForWhy[],
  homeContext: { city: string | null; yearBuilt: number | null },
  language: "en" | "es",
): Promise<Record<string, string> | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey || items.length === 0) return null;

  const system = [
    "You are SuCasa's home planner. For each plan item, rewrite the 'why' into ONE short personal sentence for the homeowner.",
    "Rules: plain 5th-grade English, warm but factual, max 20 words each, no scare tactics, never invent numbers or dates not in the input.",
    "Return strict JSON only: {\"whys\":[{\"key\":\"...\",\"why\":\"...\"}]} — one entry per input key, no extras.",
    language === "es" ? "Escribe cada \"why\" en español." : "Write every \"why\" in English.",
  ].join("\n");

  const user = JSON.stringify({
    home: { city: homeContext.city, yearBuilt: homeContext.yearBuilt },
    items: items.map((i) => ({
      key: i.key,
      title: i.title,
      why: i.why,
      horizon: i.horizon,
      targetYear: i.targetYear ?? null,
    })),
  });

  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "home_plan_whys",
            strict: false,
            schema: {
              type: "object",
              properties: {
                whys: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { key: { type: "string" }, why: { type: "string" } },
                    required: ["key", "why"],
                  },
                },
              },
              required: ["whys"],
            },
          },
        },
      }),
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? content);
    const out: Record<string, string> = {};
    for (const w of Array.isArray(parsed?.whys) ? parsed.whys : []) {
      const key = String(w?.key ?? "");
      const why = String(w?.why ?? "").trim();
      if (key && why) out[key] = why.slice(0, 200);
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}
