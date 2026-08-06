import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RecommendedPro = {
  id: string;
  businessName: string;
  category: string;
  serviceArea: string | null;
  rating: number | null;
  reviewsCount: number;
  isFoundingPartner: boolean;
};

/** Public-safe recommended pros for a homeowner-facing category card. */
export const getRecommendedPros = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { category: string; limit?: number }) =>
    z
      .object({ category: z.string().min(2).max(60), limit: z.number().int().min(1).max(5).optional() })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("pros")
      .select("id, business_name, category, service_area, rating, reviews_count, is_founding_partner")
      .eq("active", true)
      .eq("accepting_leads", true)
      .ilike("category", data.category)
      .order("is_founding_partner", { ascending: false })
      .order("rating", { ascending: false, nullsFirst: false })
      .limit(data.limit ?? 2);

    return (rows ?? []).map((p) => ({
      id: p.id,
      businessName: p.business_name,
      category: p.category,
      serviceArea: p.service_area,
      rating: p.rating,
      reviewsCount: p.reviews_count ?? 0,
      isFoundingPartner: !!p.is_founding_partner,
    })) satisfies RecommendedPro[];
  });
