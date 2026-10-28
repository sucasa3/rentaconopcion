/**
 * Connected Lending Partner — server authority.
 *
 * Economically inert by construction: no reads or writes of plans, prices,
 * capacity, credits, sponsorships or rankings. The only path to a lender being
 * shown is an agent's own designation over a live connection, to a homeowner
 * who linked their own account to that agent.
 */
import {
  LENDING_DISCLOSURE_VERSION,
  authorizedAgentOrg,
  contactPayload,
  designationIsLive,
  sharedFieldsFor,
  suggestedOfficer,
} from "./lending-partner";

type Admin = any;

async function officerIdentity(admin: Admin, lenderOrgId: string, userId: string) {
  const [{ data: profile }, { data: org }] = await Promise.all([
    admin
      .from("lender_member_profiles")
      .select("contact_name, sender_name, license_number, contact_title")
      .eq("lender_org_id", lenderOrgId)
      .eq("user_id", userId)
      .maybeSingle(),
    admin.from("lender_orgs").select("name, license_number").eq("id", lenderOrgId).maybeSingle(),
  ]);
  let name = (profile?.contact_name || profile?.sender_name || null) as string | null;
  if (!name) {
    const { data: p } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
    name = (p?.full_name as string | null) ?? null;
  }
  return {
    name,
    title: (profile?.contact_title as string | null) ?? null,
    company: (org?.name as string | null) ?? null,
    // Individual NMLS first; the company NMLS is labeled separately.
    nmls: (profile?.license_number as string | null) ?? null,
    companyNmls: (org?.license_number as string | null) ?? null,
  };
}

async function isActiveMember(admin: Admin, orgId: string, userId: string) {
  const { data } = await admin
    .from("lender_members")
    .select("id")
    .eq("lender_org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

async function liveDesignation(admin: Admin, agentOrgId: string) {
  const { data: d } = await admin
    .from("agent_lending_designations")
    .select("id, connection_id, lender_org_id, lo_user_id, designated_by, removed_at")
    .eq("agent_org_id", agentOrgId)
    .is("removed_at", null)
    .maybeSingle();
  if (!d) return null;
  const { data: conn } = await admin
    .from("agent_lender_connections")
    .select("status")
    .eq("id", d.connection_id)
    .maybeSingle();
  const live = designationIsLive({
    designationRemoved: !!d.removed_at,
    connectionStatus: (conn?.status as string | null) ?? null,
    officerActiveMember: await isActiveMember(admin, d.lender_org_id, d.lo_user_id),
  });
  return live ? d : null;
}

// --------------------------------------------------------------- homeowner

export async function lendingContactForHomeowner(admin: Admin, homeownerId: string) {
  const { data: rows } = await admin
    .from("lender_portfolio_clients")
    .select("homeowner_id, archived_at, created_at, lender_portfolios!inner(lender_org_id, lender_orgs!inner(org_type))")
    .eq("homeowner_id", homeownerId);
  const links = (rows ?? []).map((r: any) => ({
    agent_org_id: r.lender_portfolios.lender_org_id,
    org_type: r.lender_portfolios.lender_orgs?.org_type ?? null,
    homeowner_id: r.homeowner_id,
    archived_at: r.archived_at,
    created_at: r.created_at,
  }));
  const agentOrgId = authorizedAgentOrg(homeownerId, links);
  if (!agentOrgId) return null;
  const d = await liveDesignation(admin, agentOrgId);
  if (!d) return null;

  const [officer, { data: agentOrg }, { data: agentProfile }, { data: open }] = await Promise.all([
    officerIdentity(admin, d.lender_org_id, d.lo_user_id),
    admin.from("lender_orgs").select("name, contact_name").eq("id", agentOrgId).maybeSingle(),
    admin
      .from("lender_member_profiles")
      .select("contact_name")
      .eq("lender_org_id", agentOrgId)
      .eq("user_id", d.designated_by)
      .maybeSingle(),
    admin
      .from("homeowner_lending_requests")
      .select("id, created_at")
      .eq("homeowner_id", homeownerId)
      .eq("lo_user_id", d.lo_user_id)
      .eq("status", "open")
      .maybeSingle(),
  ]);
  if (!officer.name) return null; // never show an unnamed lender

  const { data: me } = await admin
    .from("profiles")
    .select("full_name, email, phone, address, city, state, zip")
    .eq("id", homeownerId)
    .maybeSingle();

  return {
    designationId: d.id as string,
    officer,
    agentName:
      (agentProfile?.contact_name as string | null) ??
      (agentOrg?.contact_name as string | null) ??
      (agentOrg?.name as string | null) ??
      null,
    requestedAt: (open?.created_at as string | null) ?? null,
    me: {
      name: (me?.full_name as string | null) ?? null,
      email: (me?.email as string | null) ?? null,
      phone: (me?.phone as string | null) ?? null,
      address: [me?.address, me?.city, me?.state, me?.zip].filter(Boolean).join(", ") || null,
    },
  };
}

export async function requestLendingConversation(
  admin: Admin,
  args: {
    homeownerId: string;
    designationId: string;
    channel: "email" | "phone";
    email: string | null;
    phone: string | null;
    includeValueEquity: boolean;
  },
) {
  const contact = await lendingContactForHomeowner(admin, args.homeownerId);
  // Re-resolve server-side: the client can't pick which lender receives this.
  if (!contact || contact.designationId !== args.designationId) {
    throw new Error("This lending contact is no longer available");
  }
  const { data: d } = await admin
    .from("agent_lending_designations")
    .select("id, agent_org_id, lender_org_id, lo_user_id")
    .eq("id", args.designationId)
    .single();

  const { data: existing } = await admin
    .from("homeowner_lending_requests")
    .select("id")
    .eq("homeowner_id", args.homeownerId)
    .eq("lo_user_id", d.lo_user_id)
    .eq("status", "open")
    .maybeSingle();
  if (existing) return { ok: true as const, requestId: existing.id as string, duplicate: true };

  const picked = contactPayload({ channel: args.channel, email: args.email, phone: args.phone });
  const fields = sharedFieldsFor(args.includeValueEquity);

  const { data: me } = await admin
    .from("profiles")
    .select("full_name, address, city, state, zip")
    .eq("id", args.homeownerId)
    .maybeSingle();
  if (!me?.address) throw new Error("Add your home address before requesting a conversation");

  // Consent evidence: scoped to this one officer and conversation only.
  const { data: consent, error: cErr } = await admin
    .from("consent_records")
    .insert({
      homeowner_id: args.homeownerId,
      recipient_org_id: d.lender_org_id,
      recipient_kind: "lender",
      consent_type: "connection_request",
      scope: fields,
      source: "homeowner_action",
      disclosure_version: LENDING_DISCLOSURE_VERSION,
      context: {
        via: "money_lending_contact",
        lo_user_id: d.lo_user_id,
        agent_org_id: d.agent_org_id,
        channel: args.channel,
        marketing: false,
      },
    })
    .select("id")
    .single();
  if (cErr) throw new Error(cErr.message);

  // The officer's own book — reuse an existing row for this homeowner.
  const { data: book } = await admin
    .from("lender_portfolios")
    .select("id")
    .eq("lender_org_id", d.lender_org_id)
    .eq("assigned_user_id", d.lo_user_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!book) throw new Error("This lending contact can't receive requests right now");

  let clientId: string | null = null;
  const { data: prior } = await admin
    .from("lender_portfolio_clients")
    .select("id")
    .eq("portfolio_id", book.id)
    .eq("homeowner_id", args.homeownerId)
    .is("archived_at", null)
    .maybeSingle();
  if (prior) clientId = prior.id;
  else {
    const { data: row, error } = await admin
      .from("lender_portfolio_clients")
      .insert({
        portfolio_id: book.id,
        homeowner_id: args.homeownerId,
        client_name: me.full_name ?? null,
        client_email: picked.email,
        client_phone: picked.phone,
        address_line1: me.address,
        city: me.city ?? null,
        state: me.state ?? null,
        zip: me.zip ?? null,
        relationship_basis: "homeowner_requested",
        // A conversation request is not marketing consent.
        contact_marketing_permission: "false",
        intelligence_access_scope: args.includeValueEquity ? ["value", "equity"] : [],
        notes: "Homeowner requested a mortgage conversation on SuCasa.",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    clientId = row.id;
  }

  const { data: opp } = await admin
    .from("homeowner_opportunities")
    .upsert(
      {
        portfolio_client_id: clientId,
        org_id: d.lender_org_id,
        category: "mortgage_review",
        strength: "strong",
        state: "open",
        signal_key: "homeowner_requested_conversation",
        reasons: ["Homeowner asked for a conversation"],
        reason_codes: ["homeowner_requested"],
        computed_at: new Date().toISOString(),
      },
      { onConflict: "portfolio_client_id,category" },
    )
    .select("id")
    .single();

  const { data: req, error: rErr } = await admin
    .from("homeowner_lending_requests")
    .insert({
      homeowner_id: args.homeownerId,
      designation_id: d.id,
      agent_org_id: d.agent_org_id,
      lender_org_id: d.lender_org_id,
      lo_user_id: d.lo_user_id,
      lender_client_id: clientId,
      opportunity_id: opp?.id ?? null,
      consent_record_id: consent.id,
      contact_name: me.full_name ?? null,
      contact_email: picked.email,
      contact_phone: picked.phone,
      preferred_channel: args.channel,
      shared_fields: fields,
      disclosure_version: LENDING_DISCLOSURE_VERSION,
    })
    .select("id")
    .single();
  if (rErr) throw new Error(rErr.message);

  await admin.from("lender_activity").insert({
    lender_org_id: d.lender_org_id,
    portfolio_client_id: clientId,
    actor_user_id: args.homeownerId,
    action: "homeowner_conversation_request",
    detail: "Homeowner asked for a mortgage conversation",
  });

  // Notify the assigned officer (transactional: about a request they must act on).
  let notified = false;
  try {
    const { data: u } = await admin.auth.admin.getUserById(d.lo_user_id);
    const to = u?.user?.email as string | undefined;
    if (to) {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      const res = await sendTemplateEmail("lending-conversation-request", to, {
        purpose: "transactional",
        recipientUserId: d.lo_user_id,
        idempotencyKey: `lending-request-${req.id}`,
        templateData: {
          officerName: contact.officer.name,
          homeownerName: me.full_name ?? "A homeowner",
          channel: args.channel,
          agentName: contact.agentName,
        },
      });
      notified = res.sent;
    }
  } catch (e) {
    console.error("lending request notify failed", (e as Error).message);
  }
  if (notified) {
    await admin.from("homeowner_lending_requests").update({ notified: true }).eq("id", req.id);
  }
  return { ok: true as const, requestId: req.id as string, duplicate: false };
}

// ------------------------------------------------------------------- agent

export async function agentDesignationState(admin: Admin, agentOrgId: string) {
  const { data: conns } = await admin
    .from("agent_lender_connections")
    .select("id, lender_org_id, owner_user_id, invited_by, status")
    .eq("agent_org_id", agentOrgId)
    .eq("status", "connected");
  const options = [];
  for (const c of conns ?? []) {
    const lo = suggestedOfficer(c);
    if (!lo || !(await isActiveMember(admin, c.lender_org_id, lo))) continue;
    const who = await officerIdentity(admin, c.lender_org_id, lo);
    options.push({ connectionId: c.id as string, loUserId: lo, ...who });
  }
  const current = await liveDesignation(admin, agentOrgId);
  return {
    current: current
      ? { connectionId: current.connection_id as string, loUserId: current.lo_user_id as string }
      : null,
    options,
  };
}

export async function setAgentDesignation(
  admin: Admin,
  args: { agentOrgId: string; actorUserId: string; connectionId: string | null },
) {
  const now = new Date().toISOString();
  // Remove the current one (agent-only action; lenders have no write path).
  await admin
    .from("agent_lending_designations")
    .update({ removed_at: now, removed_by: args.actorUserId })
    .eq("agent_org_id", args.agentOrgId)
    .is("removed_at", null);
  if (!args.connectionId) return { ok: true as const };

  const { data: c } = await admin
    .from("agent_lender_connections")
    .select("id, lender_org_id, owner_user_id, invited_by, status, agent_org_id")
    .eq("id", args.connectionId)
    .maybeSingle();
  if (!c || c.agent_org_id !== args.agentOrgId || c.status !== "connected") {
    throw new Error("That lender connection isn't active");
  }
  const lo = suggestedOfficer(c);
  if (!lo || !(await isActiveMember(admin, c.lender_org_id, lo))) {
    throw new Error("That loan officer is no longer on the team");
  }
  const { error } = await admin.from("agent_lending_designations").insert({
    agent_org_id: args.agentOrgId,
    connection_id: c.id,
    lender_org_id: c.lender_org_id,
    lo_user_id: lo,
    designated_by: args.actorUserId,
  });
  if (error) throw new Error(error.message);
  return { ok: true as const };
}
