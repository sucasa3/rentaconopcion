/**
 * SuCasa Daily Read — the morning send job. Server-only.
 *
 * Reads the canonical engines (the agent action queue, the gated lender
 * workspace) and emails the result. It adds no intelligence of its own: every
 * name, reason and next step in the email is the same string Today renders.
 */

import {
  buildDailyReadEmail,
  isDeliveryHour,
  localDateIn,
  markNewItems,
  passesDailyReadThreshold,
  shouldSendDailyRead,
  signalFingerprint,
  unresolvedSetHash,
  agentGroupFor,
  AGENT_GROUP_LABEL,
  DAILY_READ_EXCLUDED_GROUPS,
  DEFAULT_DAILY_READ_TIMEZONE,
  type DailyReadAudience,
  type DailyReadItem,
  type DailyReadTemperature,
  type PriorSend,
} from "@/lib/daily-read";
import { logNetworkEvent } from "@/lib/network-events.server";
import { siteUrl } from "@/lib/site-urls";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";

/** Read at call time so a domain override needs no code change. */
function site(): string {
  return siteUrl();
}

interface Recipient {
  userId: string;
  orgId: string;
  orgName: string;
  audience: DailyReadAudience;
  email: string;
  name: string | null;
  timezone: string;
  enabled: boolean;
}

function temperature(value: unknown): DailyReadTemperature {
  return value === "hot" || value === "warm" ? value : "nurture";
}

/** Every agent/lender workspace member, with their preference and timezone. */
async function listRecipients(admin: any, userIds?: string[]): Promise<Recipient[]> {
  let q = admin
    .from("lender_members")
    .select("user_id, lender_org_id, lender_orgs(id, name, org_type)");
  if (userIds?.length) q = q.in("user_id", userIds);
  const { data: members } = await q;

  const rows = ((members ?? []) as any[]).filter((m) =>
    ["agent", "lender"].includes(m.lender_orgs?.org_type),
  );
  if (!rows.length) return [];

  const uniqueUserIds = [...new Set(rows.map((r) => r.user_id))];
  const [{ data: prefs }, { data: profiles }] = await Promise.all([
    admin
      .from("professional_notification_prefs")
      .select("user_id, org_id, audience, daily_read_email_enabled, timezone")
      .in("user_id", uniqueUserIds),
    admin.from("profiles").select("id, full_name").in("id", uniqueUserIds),
  ]);
  const prefByKey = new Map<string, any>(
    ((prefs ?? []) as any[]).map((p) => [`${p.user_id}:${p.org_id}:${p.audience}`, p]),
  );
  const nameById = new Map<string, string | null>(
    ((profiles ?? []) as any[]).map((p) => [p.id, p.full_name ?? null]),
  );

  const emailById = new Map<string, string | null>();
  for (const id of uniqueUserIds) {
    try {
      const { data } = await admin.auth.admin.getUserById(id);
      emailById.set(id, data?.user?.email ?? null);
    } catch {
      emailById.set(id, null);
    }
  }

  const out: Recipient[] = [];
  for (const r of rows) {
    const audience = r.lender_orgs.org_type as DailyReadAudience;
    const email = emailById.get(r.user_id);
    if (!email) continue;
    const pref = prefByKey.get(`${r.user_id}:${r.lender_org_id}:${audience}`);
    out.push({
      userId: r.user_id,
      orgId: r.lender_org_id,
      orgName: r.lender_orgs.name ?? "Your team",
      audience,
      email,
      name: nameById.get(r.user_id) ?? null,
      timezone: pref?.timezone || DEFAULT_DAILY_READ_TIMEZONE,
      enabled: pref ? pref.daily_read_email_enabled !== false : true,
    });
  }
  return out;
}

interface SkipStats {
  missingReasonOrNextStep: number;
}

/** Agent items — straight from the canonical action queue, agent groups only. */
async function agentItems(
  admin: any,
  r: Recipient,
  stats: SkipStats,
): Promise<DailyReadItem[]> {
  const { buildActionQueue } = await import("@/lib/nba.server");
  const queue = await buildActionQueue(admin, r.userId, "agent", 60);
  const out: DailyReadItem[] = [];
  for (const item of queue.items) {
    if (item.orgId !== r.orgId) continue;
    const group = agentGroupFor(item.category, {
      engagedRecently: item.engagedRecently,
      play: item.narrative?.play ?? null,
    });
    if (!group) continue; // lender-only category: never shown to an agent
    // Standing home-care work belongs in Today, not in a morning email.
    if (DAILY_READ_EXCLUDED_GROUPS.has(group)) continue;
    const reason = item.narrative?.whyNow || item.why;
    const nextStep = item.narrative?.howToBeUseful || item.ask || item.headline;
    // A card without both a canonical reason and a canonical next step is never
    // rendered blank — it is excluded here.
    if (!reason?.trim() || !nextStep?.trim()) {
      stats.missingReasonOrNextStep += 1;
      continue;
    }
    out.push({
      clientId: item.clientId,
      opportunityId: item.opportunityId ?? null,
      name: item.name,
      categoryKey: group,
      categoryLabel: AGENT_GROUP_LABEL[group],
      temperature: temperature(item.temperature),
      rank: item.rank ?? 0,
      strength: item.strength ?? "emerging",
      reason,
      nextStep,
      href: item.portfolioId
        ? `${site()}/agent/portfolio/${item.portfolioId}?client=${item.clientId}`
        : `${site()}/agent`,
      fingerprint: signalFingerprint({
        clientId: item.clientId,
        categoryKey: group,
        reason,
        temperature: temperature(item.temperature),
      }),
      isNew: false,
    });
  }
  return out;
}

/**
 * Lender items — read through the gated workspace, so only homeowners this
 * lender may see by name can ever reach the inbox, with only permitted facts.
 */
async function lenderItems(
  admin: any,
  r: Recipient,
  stats: SkipStats,
): Promise<DailyReadItem[]> {
  const { readLenderWorkspace } = await import("@/lib/lender-workspace.server");
  const ws = await readLenderWorkspace(admin, r.userId, { orgId: r.orgId });
  if (!ws) return [];
  const out: DailyReadItem[] = [];
  for (const row of ws.daily) {
    if (!row.access?.named || !row.access?.inQueue) continue;
    const review = row.reviews?.[0];
    const categoryKey = review?.type ?? "relationship_follow_up";
    const reason = row.whyToday;
    const nextStep = row.recommendedAction || row.objective;
    if (!reason?.trim() || !nextStep?.trim()) {
      stats.missingReasonOrNextStep += 1;
      continue;
    }
    out.push({
      clientId: row.id,
      opportunityId: null,
      name: row.name,
      categoryKey,
      categoryLabel: review?.label ?? "Relationship follow-up",
      temperature: temperature(row.temperature),
      rank: row.rank ?? 0,
      // The gated lender workspace exposes no opportunity strength, so lender
      // items qualify on canonical urgency only.
      strength: "",
      reason,
      nextStep,
      href: `${site()}/lender/portfolio/${row.portfolioId}?client=${row.id}`,
      fingerprint: signalFingerprint({
        clientId: row.id,
        categoryKey,
        reason,
        temperature: temperature(row.temperature),
      }),
      isNew: false,
    });
  }
  return out;
}

export interface DailyReadOutcome {
  userId: string;
  orgId: string;
  audience: DailyReadAudience;
  email: string;
  localDate: string;
  state: string;
  reason: string;
  /** Canonical opportunities available for this recipient before the threshold. */
  available: number;
  /** Opportunities that passed the Daily Read threshold. */
  items: number;
  newItems: number;
  /** Why the below-threshold opportunities were excluded, by canonical reason. */
  excluded: { belowThreshold: number; missingReasonOrNextStep: number };
  breakdown?: { label: string; count: number }[];
  sent: boolean;
  error?: string;
  top?: { name: string; why: string; next: string }[];
}

/**
 * One recipient's Daily Read. Returns the decision either way, so a dry run can
 * show exactly who would receive State 1, State 2 or nothing.
 */
export async function buildDailyReadFor(
  admin: any,
  r: Recipient,
  opts: { now?: Date } = {},
): Promise<{
  outcome: DailyReadOutcome;
  content: ReturnType<typeof buildDailyReadEmail> | null;
  items: DailyReadItem[];
}> {
  const now = opts.now ?? new Date();
  const localDate = localDateIn(r.timezone, now);

  const stats: SkipStats = { missingReasonOrNextStep: 0 };
  const raw =
    r.audience === "agent"
      ? await agentItems(admin, r, stats)
      : await lenderItems(admin, r, stats);

  const [{ data: seen }, { data: priors }] = await Promise.all([
    admin
      .from("daily_read_signals")
      .select("fingerprint")
      .eq("user_id", r.userId)
      .eq("org_id", r.orgId)
      .eq("audience", r.audience)
      .limit(5000),
    admin
      .from("daily_read_sends")
      .select("send_date, state, unresolved_hash")
      .eq("user_id", r.userId)
      .eq("org_id", r.orgId)
      .eq("audience", r.audience)
      .order("send_date", { ascending: false })
      .limit(10),
  ]);

  const marked = markNewItems(
    raw,
    ((seen ?? []) as any[]).map((s) => s.fingerprint),
  );
  // The quality gate: canonical urgency, or a genuinely new signal at the
  // engine's own strong strength. Every count below is post-gate.
  const items = marked.filter(passesDailyReadThreshold);
  const priorSends: PriorSend[] = ((priors ?? []) as any[]).map((p) => ({
    sendDate: p.send_date,
    state: p.state,
    unresolvedHash: p.unresolved_hash ?? null,
  }));

  // Nothing has ever been surfaced to this professional in this role yet, so the
  // existing book is a baseline to record — not activity that happened today.
  const hasHistory = (seen?.length ?? 0) > 0 || priorSends.length > 0;

  const decision = shouldSendDailyRead({
    enabled: r.enabled,
    today: localDate,
    items,
    priorSends,
    hasHistory,
  });

  const outcome: DailyReadOutcome = {
    userId: r.userId,
    orgId: r.orgId,
    audience: r.audience,
    email: r.email,
    localDate,
    state: decision.state,
    reason: decision.reason,
    available: marked.length + stats.missingReasonOrNextStep,
    items: items.length,
    newItems: decision.newCount,
    excluded: {
      belowThreshold: marked.length - items.length,
      missingReasonOrNextStep: stats.missingReasonOrNextStep,
    },
    sent: false,
  };

  if (decision.state === "none") return { outcome, content: null, items };

  const content = buildDailyReadEmail({
    state: decision.state,
    audience: r.audience,
    recipientName: r.name,
    items,
  });
  outcome.top = content.top.map((t) => ({ name: t.name, why: t.reason, next: t.nextStep }));
  outcome.breakdown = content.breakdown;
  return { outcome, content, items };
}

async function recordSignals(admin: any, r: Recipient, items: DailyReadItem[]) {
  if (!items.length) return;
  const nowIso = new Date().toISOString();
  await admin.from("daily_read_signals").upsert(
    items.map((i) => ({
      user_id: r.userId,
      org_id: r.orgId,
      audience: r.audience,
      portfolio_client_id: i.clientId,
      opportunity_id: i.opportunityId,
      fingerprint: i.fingerprint,
      category: i.categoryKey,
      first_surfaced_at: nowIso,
      last_surfaced_at: nowIso,
    })),
    { onConflict: "user_id,org_id,audience,fingerprint", ignoreDuplicates: false },
  );
}

export interface DailyReadTickResult {
  considered: number;
  sent: number;
  suppressed: number;
  failed: number;
  dryRun: boolean;
  outcomes: DailyReadOutcome[];
}

/**
 * Hourly tick. Only recipients whose own local time is the morning hour are
 * considered, so one simple schedule serves every US timezone and survives
 * daylight-saving changes.
 */
export async function runDailyReadTick(
  opts: {
    limit?: number;
    dryRun?: boolean;
    /** Ignore the local-morning window (used for dry runs and manual tests). */
    force?: boolean;
    userIds?: string[];
    now?: Date;
  } = {},
): Promise<DailyReadTickResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin;
  const now = opts.now ?? new Date();
  const dryRun = opts.dryRun === true;
  const limit = Math.min(500, Math.max(1, opts.limit ?? 100));

  const all = await listRecipients(admin, opts.userIds);
  const due = all.filter((r) => opts.force === true || isDeliveryHour(r.timezone, now));
  const batch = due.slice(0, limit);

  const result: DailyReadTickResult = {
    considered: batch.length,
    sent: 0,
    suppressed: 0,
    failed: 0,
    dryRun,
    outcomes: [],
  };

  for (const r of batch) {
    try {
      const { outcome, content, items } = await buildDailyReadFor(admin, r, { now });

      if (!content) {
        result.suppressed += 1;
        result.outcomes.push(outcome);
        continue;
      }
      if (dryRun) {
        result.outcomes.push(outcome);
        continue;
      }

      const { data: send, error: insertError } = await admin
        .from("daily_read_sends")
        .insert({
          user_id: r.userId,
          org_id: r.orgId,
          audience: r.audience,
          send_date: outcome.localDate,
          state: outcome.state,
          item_count: items.length,
          new_count: outcome.newItems,
          client_ids: items.map((i) => i.clientId),
          opportunity_ids: items.map((i) => i.opportunityId).filter(Boolean),
          fingerprints: items.map((i) => i.fingerprint),
          unresolved_hash: unresolvedSetHash(items),
          status: "pending",
        })
        .select("id")
        .single();

      // A duplicate is the uniqueness guard doing its job, not a failure.
      if (insertError || !send) {
        outcome.reason = "already_sent_today";
        outcome.state = "none";
        result.suppressed += 1;
        result.outcomes.push(outcome);
        continue;
      }

      await logNetworkEvent(admin, {
        action: "daily_read_generated",
        actorUserId: r.userId,
        orgId: r.orgId,
        entityType: "daily_read_send",
        entityId: send.id,
        metadata: { audience: r.audience, state: outcome.state, items: items.length },
      });

      const { openPixelUrl, clickUrl } = await import("@/lib/tracking.server");
      try {
        const sendResult = await sendTemplateEmail(
          r.audience === "agent" ? "daily-read-agent" : "daily-read-lender",
          r.email,
          {
            idempotencyKey: `daily-read-${send.id}`,
            templateData: {
              ...content,
              audience: r.audience,
              orgName: r.orgName,
              ctaUrl: clickUrl(send.id, `${site()}/${r.audience}`),
              trackingPixelUrl: openPixelUrl(send.id),
              // The email layout reads `why` / `next`; the canonical item
              // carries `reason` / `nextStep`. Map explicitly so a reason can
              // never go missing in the inbox.
              top: content.top.map((t) => ({
                name: t.name,
                why: t.reason,
                next: t.nextStep,
                href: clickUrl(send.id, t.href),
              })),
              preferencesUrl: `${site()}/${r.audience}`,
            },
          },
        );
        if (sendResult.sent) {
          await admin
            .from("daily_read_sends")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", send.id);
          await recordSignals(admin, r, items);
          await logNetworkEvent(admin, {
            action: "daily_read_sent",
            actorUserId: r.userId,
            orgId: r.orgId,
            entityType: "daily_read_send",
            entityId: send.id,
            metadata: { audience: r.audience, state: outcome.state, new: outcome.newItems },
          });
          outcome.sent = true;
          result.sent += 1;
        } else {
          await admin
            .from("daily_read_sends")
            .update({ status: "suppressed", error_message: sendResult.reason })
            .eq("id", send.id);
          outcome.reason = sendResult.reason;
          result.suppressed += 1;
        }
      } catch (err: any) {
        await admin
          .from("daily_read_sends")
          .update({ status: "failed", error_message: String(err?.message ?? err).slice(0, 300) })
          .eq("id", send.id);
        outcome.error = String(err?.message ?? err).slice(0, 300);
        result.failed += 1;
      }
      result.outcomes.push(outcome);
    } catch (err: any) {
      result.failed += 1;
      result.outcomes.push({
        userId: r.userId,
        orgId: r.orgId,
        audience: r.audience,
        email: r.email,
        localDate: localDateIn(r.timezone, now),
        state: "none",
        reason: "error",
        available: 0,
        items: 0,
        newItems: 0,
        excluded: { belowThreshold: 0, missingReasonOrNextStep: 0 },
        sent: false,
        error: String(err?.message ?? err).slice(0, 300),
      });
    }
  }

  return result;
}
