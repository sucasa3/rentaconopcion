/**
 * AI spend accounting + per-seat monthly caps.
 *
 * Every gateway call the app makes on behalf of a business user is logged so
 * spend is visible before it grows, and the copilot enforces a monthly query
 * cap per seat.
 */

/** Rough blended price per 1M tokens, in micro-cents, per model tier. */
const PRICE_MICRO_CENTS_PER_TOKEN: Record<string, number> = {
  "google/gemini-3.1-flash-lite": 8, // ~$0.0000008 / token blended
  "google/gemini-3.6-flash": 40,
  "google/gemini-3.5-flash": 40,
};

export const COPILOT_MONTHLY_QUERY_CAP = 300;

export function estimateCostMicroCents(model: string, totalTokens: number): number {
  const rate = PRICE_MICRO_CENTS_PER_TOKEN[model] ?? 40;
  return Math.round(totalTokens * rate);
}

export async function logAiUsage(args: {
  userId: string | null;
  orgId?: string | null;
  feature: string;
  model: string;
  usage?: { prompt?: number; completion?: number; total?: number };
  ok?: boolean;
  detail?: string | null;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const total = args.usage?.total ?? (args.usage?.prompt ?? 0) + (args.usage?.completion ?? 0);
    await supabaseAdmin.from("ai_usage_log").insert({
      user_id: args.userId,
      org_id: args.orgId ?? null,
      feature: args.feature,
      model: args.model,
      prompt_tokens: args.usage?.prompt ?? 0,
      completion_tokens: args.usage?.completion ?? 0,
      total_tokens: total,
      cost_micro_cents: estimateCostMicroCents(args.model, total),
      ok: args.ok ?? true,
      detail: args.detail ? String(args.detail).slice(0, 500) : null,
    });
  } catch {
    // Usage logging must never break the feature it is measuring.
  }
}

/** Returns how many calls of a feature this user made in the current month. */
export async function monthlyUsageCount(userId: string, feature: string): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { count } = await supabaseAdmin
    .from("ai_usage_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("feature", feature)
    .gte("created_at", start.toISOString());
  return count ?? 0;
}
