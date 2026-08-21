import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SearchSchema = z.object({
  question: z.string().min(1).max(300),
  portfolioId: z.string().uuid().optional().nullable(),
});

/**
 * Plain-English client search for agents and lenders.
 *
 * One cheap AI call turns the question into a typed filter; the client rows
 * themselves come from the ordinary org-scoped query, so no data ever leaves
 * the tenant boundary and the model never sees the book.
 */
export const searchClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SearchSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { parseQuestionToFilter, applyFilter, columnsFor } = await import("./copilot.server");
    const { MODEL_LIGHT } = await import("./documents-ai.server");
    const { logAiUsage, monthlyUsageCount, COPILOT_MONTHLY_QUERY_CAP } = await import(
      "./ai-usage.server"
    );
    const { monthsBetween, remainingBalanceCents, estimatedValueCents, BENCHMARK_RATE_DEFAULT } =
      await import("./opportunities");

    // --- org scope -------------------------------------------------------
    const { data: memberships } = await context.supabase
      .from("lender_members")
      .select("lender_org_id")
      .eq("user_id", context.userId);
    const orgIds = (memberships ?? []).map((m: any) => m.lender_org_id);
    if (orgIds.length === 0) {
      return {
        used: 0,
        cap: COPILOT_MONTHLY_QUERY_CAP,
        summary: "No client book yet",
        columns: ["intent"],
        results: [],
      };
    }

    // --- per-seat monthly cap -------------------------------------------
    const used = await monthlyUsageCount(context.userId, "copilot_search");
    if (used >= COPILOT_MONTHLY_QUERY_CAP) {
      throw new Error(
        `You've used all ${COPILOT_MONTHLY_QUERY_CAP} assistant searches for this month. They reset on the 1st.`,
      );
    }

    // --- question -> filter ---------------------------------------------
    const { filter, usage } = await parseQuestionToFilter(data.question);
    await logAiUsage({
      userId: context.userId,
      orgId: orgIds[0],
      feature: "copilot_search",
      model: MODEL_LIGHT,
      usage,
    });

    // --- org-scoped rows (RLS applies) ----------------------------------
    let portfolioQ = context.supabase
      .from("lender_portfolios")
      .select("id, name")
      .in("lender_org_id", orgIds);
    if (data.portfolioId) portfolioQ = portfolioQ.eq("id", data.portfolioId);
    const { data: portfolios } = await portfolioQ;
    const portfolioIds = (portfolios ?? []).map((p: any) => p.id);
    if (portfolioIds.length === 0) {
      return {
        used: used + 1,
        cap: COPILOT_MONTHLY_QUERY_CAP,
        summary: filter.summary ?? "All clients",
        columns: columnsFor(filter),
        results: [],
      };
    }

    const { data: clients, error: cErr } = await context.supabase
      .from("lender_portfolio_clients")
      .select(
        "id, portfolio_id, client_name, client_email, client_phone, address_line1, city, state, zip, close_date, loan_amount_at_close_cents, rate_at_close, term_months",
      )
      .in("portfolio_id", portfolioIds)
      .limit(5000);
    if (cErr) throw new Error(cErr.message);

    const clientIds = (clients ?? []).map((c: any) => c.id);
    const [{ data: opps }, { data: activity }] = await Promise.all([
      clientIds.length
        ? context.supabase
            .from("homeowner_opportunities")
            .select("portfolio_client_id, category, strength, score")
            .in("portfolio_client_id", clientIds.slice(0, 1000))
        : Promise.resolve({ data: [] as any[] }),
      clientIds.length
        ? context.supabase
            .from("lender_activity")
            .select("portfolio_client_id, created_at")
            .in("portfolio_client_id", clientIds.slice(0, 1000))
            .order("created_at", { ascending: false })
            .limit(2000)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const oppMap = new Map<string, { categories: string[]; best: string | null; score: number }>();
    for (const o of (opps ?? []) as any[]) {
      const cur = oppMap.get(o.portfolio_client_id) ?? { categories: [], best: null, score: 0 };
      cur.categories.push(String(o.category));
      const rank = { high: 3, medium: 2, low: 1 } as Record<string, number>;
      if ((rank[o.strength] ?? 0) > (rank[cur.best ?? ""] ?? 0)) cur.best = o.strength;
      cur.score = Math.max(cur.score, Number(o.score ?? 0));
      oppMap.set(o.portfolio_client_id, cur);
    }

    const lastContact = new Map<string, string>();
    for (const a of (activity ?? []) as any[]) {
      if (!lastContact.has(a.portfolio_client_id)) lastContact.set(a.portfolio_client_id, a.created_at);
    }

    const now = new Date();
    const rows = (clients ?? []).map((c: any) => {
      const months = monthsBetween(c.close_date, now);
      const term = c.term_months ?? 360;
      const balance = remainingBalanceCents(c.loan_amount_at_close_cents, c.rate_at_close, term, months);
      const value = estimatedValueCents(c.loan_amount_at_close_cents, months);
      const equity = (value ?? 0) - (balance ?? 0);
      const pmt = (p: number, r: number) => {
        const mr = r / 100 / 12;
        return mr <= 0 ? p / term : (p * mr) / (1 - Math.pow(1 + mr, -term));
      };
      const savings = Math.max(
        0,
        Math.round(
          pmt((balance ?? 0) / 100, c.rate_at_close ?? 0) -
            pmt((balance ?? 0) / 100, BENCHMARK_RATE_DEFAULT),
        ),
      );
      const opp = oppMap.get(c.id);
      return {
        id: c.id,
        portfolio_id: c.portfolio_id,
        name: c.client_name ?? "—",
        email: c.client_email,
        phone: c.client_phone,
        address: c.address_line1,
        city: c.city,
        state: c.state,
        zip: c.zip,
        rate: c.rate_at_close != null ? Number(c.rate_at_close) : null,
        loan_cents: c.loan_amount_at_close_cents,
        balance_cents: balance,
        value_cents: value,
        equity_cents: equity,
        savings_per_month: savings,
        close_date: c.close_date,
        years_since_close: Math.round((months / 12) * 10) / 10,
        intent: (opp?.best ?? null) as "high" | "medium" | "low" | null,
        intent_score: opp?.score ?? null,
        categories: opp?.categories ?? [],
        last_contact_at: lastContact.get(c.id) ?? null,
      };
    });

    const results = applyFilter(rows, filter);

    return {
      used: used + 1,
      cap: COPILOT_MONTHLY_QUERY_CAP,
      summary: filter.summary ?? "All clients",
      columns: columnsFor(filter),
      total_book: rows.length,
      results,
    };
  });
