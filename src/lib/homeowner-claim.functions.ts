import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { claimMessages, claimStatus } from "./homeowner-claim";

const TTL_MS = 14 * 24 * 60 * 60 * 1000;

function origin(): string {
  const req = getRequest();
  const host = new URL(req.url);
  const isPreview = /lovable\.app$|lovableproject\.com$|localhost/.test(host.hostname) &&
    !/rentaconopcion\.lovable\.app$/.test(host.hostname);
  return isPreview ? host.origin : (process.env["SITE_URL"] ?? "https://sucasa.com");
}

/** Agent: create (or reuse) a claim link for a client in a book they can see. Never sends anything. */
export const createClaimLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { clientId: string }) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    // RLS as the agent decides whether they may see this client at all.
    const { data: c } = await context.supabase
      .from("lender_portfolio_clients")
      .select("id, client_name, client_email, client_phone, address_line1, city, state, zip, archived_at, homeowner_id, lender_portfolios!inner(lender_org_id)")
      .eq("id", data.clientId)
      .maybeSingle();
    if (!c || c.archived_at) throw new Error("Client not found.");
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
    const url = `${origin()}/claim?t=${encodeURIComponent(token)}`;
    const { data: prof } = await supabaseAdmin.from("profiles").select("full_name").eq("id", context.userId).maybeSingle();
    return { url, expiresAt: expires.toISOString(), messages: claimMessages({ firstName: (c.client_name ?? "").split(" ")[0] ?? "", agentName: (prof as any)?.full_name ?? "", address: c.address_line1, url }) };
  });

/** Agent: latest invitation status for a client. */
export const getClaimStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { clientId: string }) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: c } = await context.supabase.from("lender_portfolio_clients").select("id").eq("id", data.clientId).maybeSingle();
    if (!c) throw new Error("Client not found.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: r } = await supabaseAdmin.from("homeowner_claim_invites")
      .select("created_at, link_copied_at, expires_at, revoked_at, claimed_at, home_confirmed_at, home_corrected, connection_outcome, activated_at")
      .eq("client_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return claimStatus(r ?? null);
  });

async function loadInvite(token: string) {
  const { verifyTypedInviteToken } = await import("./invite-token.server");
  const v = verifyTypedInviteToken(token);
  if (!v.ok) return { error: v.reason === "expired" ? "expired" : "invalid" } as const;
  if (v.claims.context !== "homeowner_claim") return { error: "invalid" } as const;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: inv } = await supabaseAdmin.from("homeowner_claim_invites").select("*").eq("id", v.claims.invitationId).maybeSingle();
  if (!inv || inv.nonce !== v.claims.nonce || inv.email !== v.claims.email) return { error: "invalid" } as const;
  if (inv.revoked_at) return { error: "replaced" } as const;
  if (!inv.claimed_at && new Date(inv.expires_at).getTime() < Date.now()) return { error: "expired" } as const;
  const { data: c } = await supabaseAdmin.from("lender_portfolio_clients")
    .select("id, client_name, address_line1, city, state, zip, homeowner_id, archived_at").eq("id", inv.client_id).maybeSingle();
  if (!c || c.archived_at) return { error: "invalid" } as const;
  const { data: prof } = await supabaseAdmin.from("profiles").select("full_name").eq("id", inv.created_by).maybeSingle();
  return { inv, client: c, agentName: (prof as any)?.full_name ?? "Your agent", admin: supabaseAdmin } as const;
}

function maskEmail(e: string) {
  const [u, d] = e.split("@");
  return `${(u ?? "").slice(0, 2)}•••@${d ?? ""}`;
}

/** Public: what the link is for. Shows only first name, masked email and the address on file. */
export const getClaimPreview = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string }) => z.object({ token: z.string().min(10).max(2000) }).parse(i))
  .handler(async ({ data }) => {
    const r = await loadInvite(data.token);
    if ("error" in r) return { ok: false as const, reason: r.error };
    const addr = [r.client.address_line1, r.client.city, r.client.state, r.client.zip].filter(Boolean).join(", ");
    return {
      ok: true as const,
      firstName: (r.client.client_name ?? "").split(" ")[0] ?? "",
      agentName: r.agentName,
      email: r.inv.email,
      maskedEmail: maskEmail(r.inv.email),
      address: addr,
      claimed: Boolean(r.inv.claimed_at),
    };
  });

/** Homeowner: claim with a verified session whose email matches the invitation. */
export const claimHomeowner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    token: z.string().min(10).max(2000),
    homeCorrect: z.boolean(),
    correctedAddress: z.string().trim().max(300).optional(),
    connect: z.enum(["accept", "decline"]),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const r = await loadInvite(data.token);
    if ("error" in r) return { ok: false as const, reason: r.error };
    const { inv, client, admin } = r;
    const { data: u } = await admin.auth.admin.getUserById(context.userId);
    const email = u?.user?.email?.toLowerCase();
    if (!u?.user?.email_confirmed_at || email !== inv.email) return { ok: false as const, reason: "email_mismatch" };
    if (inv.claimed_by && inv.claimed_by !== context.userId) return { ok: false as const, reason: "already_claimed" };
    if (!data.homeCorrect && !data.correctedAddress) return { ok: false as const, reason: "need_address" };

    let outcome: "accepted" | "declined" | "conflict" = data.connect === "accept" ? "accepted" : "declined";
    if (outcome === "accepted") {
      if (client.homeowner_id && client.homeowner_id !== context.userId) outcome = "conflict";
      else if (!client.homeowner_id) {
        // Only fill an empty link — never overwrite an existing one.
        const { data: upd } = await admin.from("lender_portfolio_clients").update({ homeowner_id: context.userId })
          .eq("id", client.id).is("homeowner_id", null).select("id");
        if (!upd?.length) outcome = "conflict";
      }
    }
    const now = new Date().toISOString();
    await admin.from("homeowner_claim_invites").update({
      claimed_at: inv.claimed_at ?? now, claimed_by: context.userId,
      home_confirmed_at: data.homeCorrect ? now : null,
      home_corrected: !data.homeCorrect,
      corrected_address: data.homeCorrect ? null : data.correctedAddress,
      connection_outcome: outcome,
    }).eq("id", inv.id);

    // Prefill the Home Record only when the homeowner has none yet (existing accounts keep theirs).
    if (data.homeCorrect) {
      const { data: hp } = await admin.from("home_profiles").select("id").eq("user_id", context.userId).maybeSingle();
      if (!hp) {
        const address = [client.address_line1, client.city, client.state, client.zip].filter(Boolean).join(", ");
        await admin.from("home_profiles").insert({ user_id: context.userId, address } as any);
      }
    }
    return { ok: true as const, outcome, homeConfirmed: data.homeCorrect };
  });
