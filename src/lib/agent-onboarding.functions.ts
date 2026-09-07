import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { emailMatchesInvite, verifyInviteToken } from "./invite-token.server";

/**
 * Invitation → activation for real-estate agents.
 *
 * Nothing here changes access, consent, ranking or connection semantics: it
 * creates the agent's own workspace and, when the invitation checks out,
 * accepts the lender connection through the existing invitation path.
 */

const tokenInput = z.object({ token: z.string().min(10).max(2048) });

/**
 * Public preview for the invitation landing page. Returns only what the page
 * needs to render: who invited, the invited address, and the invite's state.
 * No homeowner data, no workspace data, no internal identifiers.
 */
export const getInvitePreview = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => tokenInput.parse(i))
  .handler(async ({ data }) => {
    const parsed = verifyInviteToken(data.token);
    if (!parsed.ok) {
      return { valid: false as const, reason: parsed.reason };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conn } = await supabaseAdmin
      .from("agent_lender_connections")
      .select(
        "id, status, invited_email, invited_name, message, agent_org_id, lender_orgs!agent_lender_connections_lender_org_id_fkey(name, logo_url, sponsored_allocation)",
      )
      .eq("id", parsed.connectionId)
      .maybeSingle();

    if (!conn || conn.invited_email?.toLowerCase() !== parsed.email) {
      return { valid: false as const, reason: "invalid" as const };
    }

    const org = (conn as any).lender_orgs ?? {};
    return {
      valid: true as const,
      status: conn.agent_org_id ? "answered" : (conn.status as string),
      invitedEmail: conn.invited_email as string,
      invitedName: (conn.invited_name as string | null) ?? null,
      message: (conn.message as string | null) ?? null,
      lenderName: (org.name as string | null) ?? "A lender on SuCasa",
      lenderLogoUrl: (org.logo_url as string | null) ?? null,
      sponsored: Number(org.sponsored_allocation ?? 0) > 0,
    };
  });

/**
 * Create (or reuse) the caller's agent workspace and, when a valid invitation
 * token is supplied for their own email address, connect the lender.
 * Idempotent: running it twice never creates a second agency or book.
 */
export const activateAgentWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        token: z.string().min(10).max(2048).optional(),
        agencyName: z.string().trim().min(2).max(120).optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const email = ((context.claims as any)?.email as string | undefined) ?? null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Reuse an existing agent organization when the caller already has one.
    const { data: memberships } = await supabaseAdmin
      .from("lender_members")
      .select("lender_org_id, lender_orgs!lender_members_lender_org_id_fkey(id, name, org_type)")
      .eq("user_id", context.userId);

    let orgId: string | null = null;
    for (const m of memberships ?? []) {
      const org = (m as any).lender_orgs;
      if (org?.org_type === "agent") {
        orgId = org.id;
        break;
      }
    }

    let created = false;
    if (!orgId) {
      const fallbackName =
        data.agencyName?.trim() ||
        (email ? `${email.split("@")[0]}'s brokerage` : "My brokerage");
      const { data: org, error } = await supabaseAdmin
        .from("lender_orgs")
        .insert({ name: fallbackName, org_type: "agent", plan: "starter" })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      orgId = org.id;
      created = true;

      const { error: memberError } = await supabaseAdmin
        .from("lender_members")
        .insert({ lender_org_id: orgId, user_id: context.userId, role: "owner" });
      if (memberError) throw new Error(memberError.message);
    } else if (data.agencyName?.trim() && created === false) {
      // Owners may rename their agency during setup.
      const { data: role } = await supabaseAdmin
        .from("lender_members")
        .select("role")
        .eq("lender_org_id", orgId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (role?.role === "owner") {
        await supabaseAdmin
          .from("lender_orgs")
          .update({ name: data.agencyName.trim() })
          .eq("id", orgId);
      }
    }

    // 2. Ensure the agent has a book of business.
    let { data: portfolio } = await supabaseAdmin
      .from("lender_portfolios")
      .select("id")
      .eq("lender_org_id", orgId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!portfolio) {
      const { data: madeBook, error } = await supabaseAdmin
        .from("lender_portfolios")
        .insert({ lender_org_id: orgId, name: "Sphere & past clients" })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      portfolio = madeBook;
    }

    // 3. Connect the sponsoring lender, only for a valid token addressed to
    //    the authenticated user's own email.
    let connectedLender: string | null = null;
    let connectionError: string | null = null;
    if (data.token) {
      const parsed = verifyInviteToken(data.token);
      if (!parsed.ok) {
        connectionError =
          parsed.reason === "expired"
            ? "That invitation link has expired — ask your lender to send a new one."
            : "That invitation link isn't valid.";
      } else if (!emailMatchesInvite(email, parsed.email)) {
        connectionError = `This invitation was sent to ${parsed.email}. Sign in with that address to connect.`;
      } else {
        const { respondToInvite } = await import("./network.server");
        try {
          await respondToInvite(context.userId, email, parsed.connectionId, orgId!, true);
          const { data: conn } = await supabaseAdmin
            .from("agent_lender_connections")
            .select("lender_orgs!agent_lender_connections_lender_org_id_fkey(name)")
            .eq("id", parsed.connectionId)
            .maybeSingle();
          connectedLender = ((conn as any)?.lender_orgs?.name as string) ?? "Your lender";
        } catch (e) {
          connectionError = (e as Error).message;
        }
      }
    }

    const { count } = await supabaseAdmin
      .from("lender_portfolio_clients")
      .select("id", { count: "exact", head: true })
      .eq("portfolio_id", portfolio!.id);

    return {
      orgId: orgId!,
      portfolioId: portfolio!.id,
      createdWorkspace: created,
      connectedLender,
      connectionError,
      clientCount: count ?? 0,
    };
  });
