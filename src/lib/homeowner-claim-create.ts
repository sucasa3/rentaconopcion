import { resolveInviteOrigin } from "./invite-origin";
import { claimMessages } from "./homeowner-claim";

const TTL_MS = 14 * 24 * 60 * 60 * 1000;

function origin(requestUrl: string, clientOrigin?: string): string {
  return resolveInviteOrigin(requestUrl, clientOrigin, process.env["SITE_URL"] ?? "https://sucasa.com");
}

/** Create or replace a homeowner claim link. Never sends anything. */
export async function createClaimLinkHandler({ data, context, requestUrl }: {
  data: { clientId: string; origin?: string };
  context: { supabase: any; userId: string };
  requestUrl: string;
}) {
  // RLS as the agent decides whether they may see this client at all.
  const { data: c } = await context.supabase
    .from("lender_portfolio_clients")
    .select("id, portfolio_id, client_name, client_email, client_phone, address_line1, city, state, zip, archived_at, homeowner_id, lender_portfolios!inner(lender_org_id)")
    .eq("id", data.clientId)
    .maybeSingle();
  if (!c || c.archived_at) throw new Error("Client not found.");
  // Assigned-book ownership, checked before any token or revocation.
  const { assertClaimInviteOwner } = await import("./claim-invite-guard");
  await assertClaimInviteOwner(context.supabase, context.userId, (c as any).portfolio_id);
  if (!c.client_email) throw new Error("Add the client's email first — the link is tied to it.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { isSuppressed } = await import("./suppression.server");
  if (await isSuppressed(supabaseAdmin, { email: c.client_email, phone: c.client_phone, street: c.address_line1, zip: c.zip }))
    throw new Error("This person opted out. An invitation can't be created.");
  const orgId = (c as any).lender_portfolios.lender_org_id as string;
  const { signTypedInviteToken } = await import("./invite-token.server");
  const { randomUUID } = await import("crypto");
  // Revoke earlier unclaimed links so only the newest works.
  await supabaseAdmin.from("homeowner_claim_invites").update({ revoked_at: new Date().toISOString() })
    .eq("client_id", c.id).is("claimed_at", null).is("revoked_at", null);
  const nonce = randomUUID();
  const expires = new Date(Date.now() + TTL_MS);
  const { data: row, error } = await supabaseAdmin.from("homeowner_claim_invites").insert({
    client_id: c.id, org_id: orgId, created_by: context.userId,
    email: c.client_email.trim().toLowerCase(), nonce, expires_at: expires.toISOString(),
    link_copied_at: new Date().toISOString(),
  }).select("id").single();
  if (error || !row) throw new Error("Couldn't create the link.");
  const token = signTypedInviteToken({ invitationId: row.id, context: "homeowner_claim", email: c.client_email, nonce, ttlMs: TTL_MS });
  const url = `${origin(requestUrl, data.origin)}/claim?t=${encodeURIComponent(token)}`;
  const { data: prof } = await supabaseAdmin.from("profiles").select("full_name").eq("id", context.userId).maybeSingle();
  return { url, expiresAt: expires.toISOString(), messages: claimMessages({ firstName: (c.client_name ?? "").split(" ")[0] ?? "", agentName: (prof as any)?.full_name ?? "", address: c.address_line1, url }) };
}
