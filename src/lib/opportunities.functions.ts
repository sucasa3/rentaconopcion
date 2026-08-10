import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertPortfolioOrg,
  listPortfolioOpportunityRows,
  persistPortfolioOpportunities,
} from "./opportunities.server";

/** Recompute and store the opportunity set for one book. */
export const recomputePortfolioOpportunities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        portfolioId: z.string().uuid(),
        benchmarkRate: z.number().min(1).max(20).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const org = await assertPortfolioOrg(context.supabase, data.portfolioId);
    const result = await persistPortfolioOpportunities(
      context.supabase,
      data.portfolioId,
      org.orgId,
      data.benchmarkRate,
    );
    return { ...result, orgId: org.orgId, orgName: org.orgName };
  });

/** Full-detail opportunities for a book the caller's own organization owns. */
export const listPortfolioOpportunities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ portfolioId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const org = await assertPortfolioOrg(context.supabase, data.portfolioId);
    const rows = await listPortfolioOpportunityRows(context.supabase, data.portfolioId);
    return { ...rows, orgId: org.orgId, orgName: org.orgName, orgType: org.orgType };
  });
