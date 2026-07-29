/**
 * Home Assistant — one-shot Q&A with the homeowner's own home snapshot
 * as context. No threads, no tools, no persistence (MVP scope).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.6-flash";

const AskInput = z.object({
  question: z.string().min(1).max(1000),
});

type Snapshot = {
  name?: string | null;
  address?: string | null;
  cityStateZip?: string | null;
  yearBuilt?: number | null;
  sqft?: number | null;
  beds?: number | null;
  baths?: number | null;
  avm?: number | null;
  equity?: number | null;
  equityPct?: number | null;
  rate?: number | null;
  balance?: number | null;
  findings: Array<{
    system: string;
    condition: string | null;
    urgency: string | null;
    defects: string[];
    recommended_action: string | null;
    recommended_category: string | null;
  }>;
  recentRequests: Array<{ category: string; status: string; when: string }>;
};

function buildSystemPrompt(s: Snapshot): string {
  const parts: string[] = [];
  parts.push(
    `You are the SuCasa Home Assistant — the trusted operating system for a homeowner's house.`,
  );
  parts.push(
    `Your job: answer questions about THIS homeowner's home using the snapshot below. Be concise, plain-English, and specific to their home. Use short paragraphs and bullets when helpful. Keep replies under ~180 words unless the user asks for depth.`,
  );
  parts.push(
    `Scope: home maintenance, inspection findings, equity/refinancing in plain terms, seasonal tasks, matching problems to SuCasa service categories (Roofing, HVAC, Plumbing, Electrical, Foundation, Water Heater, Appliances, Windows, Flooring, Water & Mold Restoration, Junk Removal, Movers). If actionable, encourage the user to file a Service Request from the dashboard. If a question is off-topic (news, personal advice, code, etc.), politely decline and redirect to their home.`,
  );
  parts.push(
    `Do NOT invent numbers, dates, or facts that aren't in the snapshot. If a value is missing, say so.`,
  );

  const lines: string[] = ["=== HOME SNAPSHOT ==="];
  if (s.name) lines.push(`Homeowner: ${s.name}`);
  if (s.address) lines.push(`Address: ${s.address}${s.cityStateZip ? ", " + s.cityStateZip : ""}`);
  if (s.yearBuilt) lines.push(`Year built: ${s.yearBuilt} (age ${new Date().getFullYear() - s.yearBuilt} yrs)`);
  if (s.sqft) lines.push(`Size: ${s.sqft} sqft${s.beds ? `, ${s.beds} bd` : ""}${s.baths ? `/${s.baths} ba` : ""}`);
  if (s.avm) lines.push(`Estimated value (AVM): $${s.avm.toLocaleString()}`);
  if (s.equity != null) lines.push(`Equity: $${Math.round(s.equity).toLocaleString()}${s.equityPct != null ? ` (${Math.round(s.equityPct * 100)}%)` : ""}`);
  if (s.rate != null) lines.push(`Current mortgage rate: ${s.rate.toFixed(2)}%`);
  if (s.balance != null) lines.push(`Mortgage balance: $${Math.round(s.balance).toLocaleString()}`);

  if (s.findings.length) {
    lines.push(`\nInspection findings (${s.findings.length}):`);
    for (const f of s.findings.slice(0, 12)) {
      lines.push(
        `- ${f.system}${f.condition ? ` [${f.condition}]` : ""}${f.urgency ? ` (${f.urgency})` : ""}: ${f.defects.slice(0, 2).join("; ") || "—"}${f.recommended_action ? ` → ${f.recommended_action}` : ""}${f.recommended_category ? ` [SuCasa: ${f.recommended_category}]` : ""}`,
      );
    }
  } else {
    lines.push(`\nInspection findings: none on file yet — user can upload a report from Documents.`);
  }

  if (s.recentRequests.length) {
    lines.push(`\nRecent service requests:`);
    for (const r of s.recentRequests) lines.push(`- ${r.category} — ${r.status} (${r.when})`);
  } else {
    lines.push(`\nRecent service requests: none.`);
  }

  return parts.join("\n\n") + "\n\n" + lines.join("\n");
}

export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => AskInput.parse(input))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Home Assistant is not configured (missing LOVABLE_API_KEY).");

    // Fetch profile, findings, requests in parallel.
    const [{ data: profile }, { data: findings }, { data: requests }] = await Promise.all([
      context.supabase
        .from("profiles")
        .select("full_name, address, city, state, zip")
        .eq("id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("home_inspection_findings")
        .select("system, condition, urgency, defects, recommended_action, recommended_category")
        .eq("user_id", context.userId)
        .limit(20),
      context.supabase
        .from("service_requests")
        .select("category, status, created_at")
        .eq("homeowner_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    // Try home intel (AVM / equity / rate) — safe to fail.
    const snapshot: Snapshot = {
      name: profile?.full_name ?? null,
      address: profile?.address ?? null,
      cityStateZip: [profile?.city, profile?.state, profile?.zip].filter(Boolean).join(", ") || null,
      yearBuilt: null,
      sqft: null,
      beds: null,
      baths: null,
      avm: null,
      equity: null,
      equityPct: null,
      rate: null,
      balance: null,
      findings: (findings ?? []).map((f: any) => ({
        system: f.system,
        condition: f.condition,
        urgency: f.urgency,
        defects: Array.isArray(f.defects) ? f.defects : [],
        recommended_action: f.recommended_action,
        recommended_category: f.recommended_category,
      })),
      recentRequests: (requests ?? []).map((r: any) => ({
        category: r.category,
        status: r.status,
        when: new Date(r.created_at).toLocaleDateString(),
      })),
    };

    if (profile?.address) {
      try {
        const fullAddress = [profile.address, profile.city, profile.state, profile.zip]
          .filter(Boolean)
          .join(", ");
        const {
          getPropertyIntel,
          extractAvm,
          extractDetail,
          extractMortgage,
          computeEquityRibbon,
        } = await import("@/lib/valuation.server");
        const intel = await getPropertyIntel(fullAddress, {
          classes: ["avm", "detail", "mortgage"],
          userId: context.userId,
          revenueSource: "assistant_context",
        });
        if (intel?.ok) {
          const avm = extractAvm(intel.classes as any);
          const detail = extractDetail(intel.classes as any);
          const mortgage = extractMortgage(intel.classes as any);
          const equity = computeEquityRibbon(avm?.estimate ?? null, mortgage?.balance ?? null);
          snapshot.avm = avm?.estimate ?? null;
          snapshot.yearBuilt = detail?.yearBuilt ?? null;
          snapshot.sqft = detail?.sqft ?? null;
          snapshot.beds = detail?.beds ?? null;
          snapshot.baths = detail?.baths ?? null;
          snapshot.rate = mortgage?.rate ?? null;
          snapshot.balance = mortgage?.balance ?? null;
          snapshot.equity = equity?.equityDollars ?? null;
          snapshot.equityPct = equity?.equityPct ?? null;
        }
      } catch (e) {
        console.warn("[assistant] intel fetch skipped:", (e as Error).message);
      }
    }

    const systemPrompt = buildSystemPrompt(snapshot);

    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: data.question },
        ],
      }),
    });

    if (res.status === 429) {
      throw new Error("You're asking a lot right now — please wait a moment and try again.");
    }
    if (res.status === 402) {
      throw new Error("The Home Assistant is temporarily unavailable (AI credits exhausted). Please contact SuCasa support.");
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[assistant] gateway error", res.status, body.slice(0, 500));
      throw new Error("The Home Assistant couldn't respond. Please try again.");
    }

    const json: any = await res.json();
    const answer: string = json?.choices?.[0]?.message?.content?.trim() || "I don't have a good answer for that yet — try rephrasing?";
    return { answer };
  });
