/**
 * Business task list for agents and lenders.
 *
 * Tasks are *derived* from signals SuCasa already detects — nothing is created
 * manually. Checking a task off only records a hidden state for that user; the
 * underlying record is never modified.
 */

export type BusinessTask = {
  key: string;
  orgId: string;
  title: string;
  who: string | null;
  why: string;
  urgency: "now" | "later";
  actionLabel: string;
  to: string | null;
  params: Record<string, string> | null;
  search: Record<string, string> | null;
  done: boolean;
  completedAt: string | null;
};

const HIGH_STRENGTH = new Set(["high", "strong", "hot"]);

function hasAddress(c: any) {
  return Boolean(c?.address_line1 && String(c.address_line1).trim());
}

export async function buildBusinessTasks(
  supabase: any,
  userId: string,
  orgType: "agent" | "lender",
): Promise<{ tasks: BusinessTask[]; openCount: number }> {
  const base = orgType === "agent" ? "/agent" : "/lender";

  // --- Which orgs and books this user can see -----------------------------
  const { data: isAdmin } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });

  let orgIds: string[] = [];
  let isManager = Boolean(isAdmin);
  if (isAdmin) {
    const { data } = await supabase.from("lender_orgs").select("id").eq("org_type", orgType);
    orgIds = (data ?? []).map((o: any) => o.id);
  } else {
    const { data: members } = await supabase
      .from("lender_members")
      .select("lender_org_id, role, lender_orgs(id, org_type)")
      .eq("user_id", userId);
    const mine = (members ?? []).filter((m: any) => m.lender_orgs?.org_type === orgType);
    orgIds = mine.map((m: any) => m.lender_org_id);
    isManager = mine.some((m: any) => m.role === "owner" || m.role === "admin" || m.role === "manager");
  }
  if (!orgIds.length) return { tasks: [], openCount: 0 };

  const { data: portfolios } = await supabase
    .from("lender_portfolios")
    .select("id, name, lender_org_id, assigned_user_id")
    .in("lender_org_id", orgIds);
  const visible = (portfolios ?? []).filter(
    (p: any) => isManager || !p.assigned_user_id || p.assigned_user_id === userId,
  );
  const bookIds = visible.map((p: any) => p.id);
  const orgByBook = new Map(visible.map((p: any) => [p.id, p.lender_org_id]));
  const primaryOrgId = orgIds[0]!;
  const firstBookId: string | null = bookIds[0] ?? null;

  const { data: clients } = bookIds.length
    ? await supabase
        .from("lender_portfolio_clients")
        .select("id, portfolio_id, client_name, address_line1, city, state, homeowner_id")
        .in("portfolio_id", bookIds)
    : { data: [] as any[] };
  const rows = clients ?? [];
  const clientById = new Map<string, any>(rows.map((c: any) => [c.id, c]));
  const clientIds = rows.map((c: any) => c.id);
  const orgForClient = (id: string) =>
    (orgByBook.get(clientById.get(id)?.portfolio_id) as string) ?? primaryOrgId;

  const tasks: BusinessTask[] = [];

  // --- 1. New high-strength opportunities ---------------------------------
  if (clientIds.length) {
    const { data: opps } = await supabase
      .from("homeowner_opportunities")
      .select("id, portfolio_client_id, category, strength, score, reasons")
      .in("portfolio_client_id", clientIds)
      .eq("state", "open")
      .order("score", { ascending: false })
      .limit(60);

    for (const o of opps ?? []) {
      const c: any = clientById.get(o.portfolio_client_id);
      const strong = HIGH_STRENGTH.has(String(o.strength ?? "").toLowerCase());
      tasks.push({
        key: `opp:${o.id}`,
        orgId: orgForClient(o.portfolio_client_id),
        title: "Reach out about a new signal",
        who: c?.client_name ?? "Homeowner",
        why: (o.reasons ?? [])[0] ?? "A new opportunity was detected for this homeowner.",
        urgency: strong ? "now" : "later",
        actionLabel: c?.portfolio_id ? "View homeowner" : "View opportunity",
        to: c?.portfolio_id ? `${base}/portfolio/$id` : `${base}/opportunities`,
        params: c?.portfolio_id ? { id: c.portfolio_id } : null,
        search: c?.portfolio_id ? { client: o.portfolio_client_id } : null,
        done: false,
        completedAt: null,
      });
    }

  }

  // --- 2 & 4. Introductions ------------------------------------------------
  const { data: intros } = await supabase
    .from("introduction_requests")
    .select(
      "id, status, outcome, category, message, agent_org_id, lender_org_id, portfolio_client_id, created_at",
    )
    .or(`agent_org_id.in.(${orgIds.join(",")}),lender_org_id.in.(${orgIds.join(",")})`)
    .limit(100);

  for (const r of intros ?? []) {
    const mineAsAgent = orgIds.includes(r.agent_org_id);
    const c: any = clientById.get(r.portfolio_client_id);
    if (r.status === "pending" && mineAsAgent) {
      tasks.push({
        key: `intro:${r.id}`,
        orgId: r.agent_org_id,
        title: "Respond to an introduction request",
        who: c?.client_name ?? "A homeowner in your book",
        why: r.message?.trim() || "A partner asked to be introduced to this homeowner.",
        urgency: "now",
        actionLabel: "Open request",
        to: `${base}/network`,
        params: null,
        search: null,
        done: false,
        completedAt: null,
      });
    } else if (r.status === "approved" && !r.outcome) {
      tasks.push({
        key: `intro-followup:${r.id}`,
        orgId: mineAsAgent ? r.agent_org_id : r.lender_org_id,
        title: "Log the outcome of an introduction",
        who: c?.client_name ?? "Homeowner",
        why: "This introduction was accepted but no outcome has been recorded yet.",
        urgency: "later",
        actionLabel: "Open network",
        to: `${base}/network`,
        params: null,
        search: null,
        done: false,
        completedAt: null,
      });
    }
  }

  // --- 3. Campaign approvals waiting on this org ---------------------------
  const { data: approvals } = await supabase
    .from("campaign_approvals")
    .select("id, status, agent_org_id, opportunity_category, proposed_client_ids, campaigns(name)")
    .in("agent_org_id", orgIds)
    .eq("status", "pending")
    .limit(50);

  for (const a of approvals ?? []) {
    tasks.push({
      key: `approval:${a.id}`,
      orgId: a.agent_org_id,
      title: `Approve the "${(a as any).campaigns?.name ?? "campaign"}" audience`,
      who: `${(a.proposed_client_ids ?? []).length} homeowner${(a.proposed_client_ids ?? []).length === 1 ? "" : "s"}`,
      why: "A partner proposed sending this campaign to homeowners in your book.",
      urgency: "now",
      actionLabel: "Review audience",
      to: `${base}/campaigns`,
      params: null,
      search: null,
      done: false,
      completedAt: null,
    });
  }

  // --- 5. Sender branding --------------------------------------------------
  const { data: memberProfile } = await supabase
    .from("lender_member_profiles")
    .select("sender_name, reply_to_email, lender_org_id")
    .eq("user_id", userId)
    .in("lender_org_id", orgIds)
    .maybeSingle();
  const { data: orgRow } = await supabase
    .from("lender_orgs")
    .select("id, sender_name, reply_to_email")
    .eq("id", primaryOrgId)
    .maybeSingle();

  const senderReady =
    (memberProfile?.sender_name && memberProfile?.reply_to_email) ||
    (orgRow?.sender_name && orgRow?.reply_to_email);
  if (!senderReady) {
    tasks.push({
      key: `branding:${primaryOrgId}:${userId}`,
      orgId: primaryOrgId,
      title: "Finish your email sender details",
      who: null,
      why: "Campaign emails need your name and a reply-to address before they go out.",
      urgency: "now",
      actionLabel: "Set up branding",
      to: `${base}/campaigns`,
      params: null,
      search: null,
      done: false,
      completedAt: null,
    });
  }

  // --- 6. Homeowners missing an address ------------------------------------
  const missingAddress = rows.filter((c: any) => !hasAddress(c));
  for (const c of missingAddress.slice(0, 25)) {
    tasks.push({
      key: `address:${c.id}`,
      orgId: orgForClient(c.id),
      title: "Add a property address",
      who: c.client_name ?? "Homeowner",
      why: "Without an address we can't pull property records or detect opportunities.",
      urgency: "later",
      actionLabel: "Open homeowner",
      to: `${base}/portfolio/$id`,
      params: { id: c.portfolio_id },
      search: { client: c.id },
      done: false,
      completedAt: null,
    });
  }

  // --- 7. Enrichment backlog ----------------------------------------------
  if (bookIds.length) {
    const { count } = await supabase
      .from("property_enrichment_queue")
      .select("id", { count: "exact", head: true })
      .in("portfolio_id", bookIds)
      .in("status", ["pending", "error"]);
    if ((count ?? 0) > 0) {
      tasks.push({
        key: `enrichment:${primaryOrgId}:${count}`,
        orgId: primaryOrgId,
        title: `${count} homeowners still need property data`,
        who: null,
        why: "Their records are queued for enrichment — check back once it finishes.",
        urgency: "later",
        actionLabel: firstBookId ? "Open your book" : "",
        to: firstBookId ? `${base}/portfolio/$id` : null,
        params: firstBookId ? { id: firstBookId } : null,
        search: null,
        done: false,
        completedAt: null,
      });
    }
  }

  // --- Apply completion state ---------------------------------------------
  const { data: state } = await supabase
    .from("business_task_state")
    .select("task_key, status, completed_at")
    .eq("user_id", userId)
    .in("org_id", orgIds);
  const stateByKey = new Map((state ?? []).map((s: any) => [s.task_key, s]));

  const withState = tasks.map((t) => {
    const s: any = stateByKey.get(t.key);
    return s && s.status === "done"
      ? { ...t, done: true, completedAt: s.completed_at as string }
      : t;
  });

  return { tasks: withState, openCount: withState.filter((t) => !t.done).length };
}
