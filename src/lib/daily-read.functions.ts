import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * The professional's own Daily Read email preference. Governs SuCasa's emails
 * to this professional only — it has nothing to do with homeowner contact
 * consent or marketing permissions.
 */

interface PrefInput {
  orgId: string;
  audience: "agent" | "lender";
}

async function assertMember(supabase: any, userId: string, input: PrefInput) {
  const { data } = await supabase
    .from("lender_members")
    .select("lender_org_id, lender_orgs(org_type)")
    .eq("user_id", userId)
    .eq("lender_org_id", input.orgId)
    .maybeSingle();
  if (!data || data.lender_orgs?.org_type !== input.audience) {
    throw new Error("Not a member of this workspace");
  }
}

export const getDailyReadPreference = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: PrefInput) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data);
    const { data: pref } = await supabase
      .from("professional_notification_prefs")
      .select("daily_read_email_enabled, timezone")
      .eq("user_id", userId)
      .eq("org_id", data.orgId)
      .eq("audience", data.audience)
      .maybeSingle();
    return {
      enabled: pref ? pref.daily_read_email_enabled !== false : true,
      timezone: pref?.timezone ?? null,
    };
  });

export const setDailyReadPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: PrefInput & { enabled: boolean; timezone?: string | null }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data);
    const { error } = await supabase.from("professional_notification_prefs").upsert(
      {
        user_id: userId,
        org_id: data.orgId,
        audience: data.audience,
        daily_read_email_enabled: data.enabled,
        ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
      },
      { onConflict: "user_id,org_id,audience" },
    );
    if (error) throw error;
    return { enabled: data.enabled };
  });
