/**
 * Professional workspaces require a verified email address. Homeowners are not
 * gated. Proof comes only from the signed session itself: a session created by
 * an emailed code/link (amr "otp"/"magiclink") or by Google sign-in proves the
 * caller controls the address. A password-only session does not.
 */
const VERIFYING_METHODS = new Set(["otp", "magiclink", "oauth", "id_token", "sso/saml", "email/signup", "invite"]);

export async function assertProEmailVerified(userId: string, claims: unknown): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin
    .from("pro_email_verifications")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (row) return;

  const c = (claims ?? {}) as { amr?: Array<{ method?: string }>; app_metadata?: { provider?: string } };
  const method = (c.amr ?? []).map((a) => a?.method ?? "").find((m) => VERIFYING_METHODS.has(m));
  const provider = c.app_metadata?.provider;
  const viaProvider = provider && provider !== "email" && provider !== "phone" ? provider : null;
  if (!method && !viaProvider) throw new Error("EMAIL_UNVERIFIED");

  await supabaseAdmin
    .from("pro_email_verifications")
    .upsert({ user_id: userId, method: method ?? viaProvider! }, { onConflict: "user_id", ignoreDuplicates: true });
}
