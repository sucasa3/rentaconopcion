/**
 * Account deletion execution.
 *
 * SuCasa-controlled personal data is removed. An agent's or lender's own client
 * record is NOT deleted — it is an independent business record of that
 * organization — but every link to the SuCasa account, and every piece of
 * SuCasa intelligence that depended on the account, is removed and the person
 * is marked do-not-contact.
 */

import {
  DELETION_CONFIRM_WORD,
  runAccountDeletion,
  type DeletionIo,
  type DeletionOutcome,
} from "./account-deletion";
import { identifierHmac, normalizeEmailKey, normalizePhoneKey, recordSuppression } from "./suppression.server";

/** SuCasa-only: no independent provider has accepted the job yet, so it can be cancelled. */
const PENDING_REQUEST_STATUSES = ["New", "Matched"];
/** A provider has accepted or committed: detach from the account, never cancel on SuCasa's behalf. */
const COMMITTED_REQUEST_STATUSES = ["Claimed", "Scheduled", "In Progress"];
const OPEN_REQUEST_STATUSES = [...PENDING_REQUEST_STATUSES, ...COMMITTED_REQUEST_STATUSES];

export type OrgOwnership = {
  orgId: string;
  orgName: string;
  otherOwners: number;
  otherMembers: Array<{ userId: string; role: string }>;
};

export type DeletionPreview = {
  email: string | null;
  phone: string | null;
  subscription:
    | { kind: "none" }
    | { kind: "sponsored"; label: string }
    | { kind: "paid"; priceCents: number | null; willCancel: true };
  openServiceRequests: number;
  pendingServiceRequests: number;
  committedServiceRequests: number;
  openIntroductions: number;
  businessRecords: number;
  blockingOrgs: OrgOwnership[];
  confirmWord: string;
};

export async function deletionPreview(admin: any, userId: string): Promise<DeletionPreview> {
  const [{ data: profile }, { data: membership }, { data: reqs }, { data: intros }, { data: clients }] =
    await Promise.all([
      admin.from("profiles").select("email, phone").eq("id", userId).maybeSingle(),
      admin
        .from("premium_memberships")
        .select("funding_source, price_cents, stripe_subscription_id, status")
        .eq("homeowner_id", userId)
        .eq("status", "active")
        .maybeSingle(),
      admin
        .from("service_requests")
        .select("id, status")
        .eq("homeowner_id", userId)
        .in("status", OPEN_REQUEST_STATUSES),
      admin
        .from("introduction_requests")
        .select("id", { count: "exact", head: true })
        .eq("homeowner_id", userId)
        .in("status", ["pending", "approved"]),
      admin
        .from("lender_portfolio_clients")
        .select("id", { count: "exact", head: true })
        .eq("homeowner_id", userId),
    ]);

  const subscription: DeletionPreview["subscription"] = !membership
    ? { kind: "none" }
    : membership.funding_source === "homeowner"
      ? { kind: "paid", priceCents: membership.price_cents ?? null, willCancel: true }
      : { kind: "sponsored", label: String(membership.funding_source) };

  return {
    email: profile?.email ?? null,
    phone: profile?.phone ?? null,
    subscription,
    openServiceRequests: (reqs ?? []).length,
    pendingServiceRequests: (reqs ?? []).filter((r: any) =>
      PENDING_REQUEST_STATUSES.includes(r.status),
    ).length,
    committedServiceRequests: (reqs ?? []).filter((r: any) =>
      COMMITTED_REQUEST_STATUSES.includes(r.status),
    ).length,
    openIntroductions: (intros as any)?.count ?? 0,
    businessRecords: (clients as any)?.count ?? 0,
    blockingOrgs: await lastOwnerOrgs(admin, userId),
    confirmWord: DELETION_CONFIRM_WORD,
  };
}

/** Organizations where this person is the only remaining owner. */
export async function lastOwnerOrgs(admin: any, userId: string): Promise<OrgOwnership[]> {
  const { data: mine } = await admin
    .from("lender_members")
    .select("lender_org_id, role")
    .eq("user_id", userId);

  const owned = (mine ?? []).filter((m: any) => m.role === "owner");
  const out: OrgOwnership[] = [];

  for (const row of owned) {
    const { data: members } = await admin
      .from("lender_members")
      .select("user_id, role")
      .eq("lender_org_id", row.lender_org_id);
    const others = (members ?? []).filter((m: any) => m.user_id !== userId);
    const otherOwners = others.filter((m: any) => m.role === "owner").length;
    if (otherOwners > 0) continue;

    const { data: org } = await admin
      .from("lender_orgs")
      .select("name, active")
      .eq("id", row.lender_org_id)
      .maybeSingle();
    if (org && org.active === false) continue; // already closed

    out.push({
      orgId: row.lender_org_id,
      orgName: org?.name ?? "Your organization",
      otherOwners,
      otherMembers: others.map((m: any) => ({ userId: m.user_id, role: m.role })),
    });
  }
  return out;
}

/** Hand the organization to another member so the owner can still delete. */
export async function transferOrgOwnership(
  admin: any,
  args: { orgId: string; fromUserId: string; toUserId: string },
): Promise<{ ok: boolean }> {
  const { data: target } = await admin
    .from("lender_members")
    .select("id")
    .eq("lender_org_id", args.orgId)
    .eq("user_id", args.toUserId)
    .maybeSingle();
  if (!target) throw new Error("That person is not a member of this organization.");

  await admin
    .from("lender_members")
    .update({ role: "owner" })
    .eq("lender_org_id", args.orgId)
    .eq("user_id", args.toUserId);
  await admin
    .from("lender_members")
    .update({ role: "manager" })
    .eq("lender_org_id", args.orgId)
    .eq("user_id", args.fromUserId);

  await logDeletionEvent(admin, {
    action: "organization_ownership_transferred",
    orgId: args.orgId,
    metadata: { to_user_id: args.toUserId },
  });
  return { ok: true };
}

/**
 * Close the organization instead of transferring it. The organization's own
 * records stay in place for its retention obligations; what stops is access,
 * sending and billing.
 */
export async function closeOrganization(
  admin: any,
  args: { orgId: string; actorUserId: string },
): Promise<{ ok: boolean }> {
  await admin
    .from("lender_orgs")
    .update({ active: false, subscription_status: "canceled" })
    .eq("id", args.orgId);

  const { data: portfolios } = await admin
    .from("lender_portfolios")
    .select("id")
    .eq("lender_org_id", args.orgId);
  const portfolioIds = (portfolios ?? []).map((p: any) => p.id);

  if (portfolioIds.length > 0) {
    await admin
      .from("property_enrichment_queue")
      .update({ status: "canceled" })
      .in("portfolio_id", portfolioIds)
      .eq("status", "pending");
  }

  await admin
    .from("campaign_sends")
    .update({ status: "canceled" })
    .eq("lender_org_id", args.orgId)
    .in("status", ["queued", "scheduled", "pending"]);

  await logDeletionEvent(admin, {
    action: "organization_closed",
    orgId: args.orgId,
    detail: "Closed by its last owner ahead of account deletion.",
  });
  return { ok: true };
}

/** Audit evidence that never re-creates the deleted profile. */
export async function logDeletionEvent(
  admin: any,
  args: {
    action: string;
    detail?: string;
    orgId?: string | null;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await admin.from("compliance_audit_events").insert({
    category: "account_deletion",
    action: args.action,
    // No actor/homeowner reference: those columns cascade with the account, and
    // the evidence must outlive it.
    actor_user_id: null,
    homeowner_id: null,
    org_id: args.orgId ?? null,
    entity_type: "account",
    entity_id: args.entityId ?? null,
    detail: args.detail ?? null,
    metadata: args.metadata ?? {},
  });
}

// --- The steps --------------------------------------------------------------

export type DeletionContext = {
  admin: any;
  userId: string;
  requestId: string;
  email: string | null;
  phone: string | null;
  street: string | null;
  zip: string | null;
};

export function buildDeletionIo(ctx: DeletionContext): DeletionIo {
  const { admin, userId } = ctx;

  return {
    async stop_outreach() {
      await admin
        .from("outreach_channel_permissions")
        .update({
          email_allowed: false,
          sms_allowed: false,
          phone_allowed: false,
          automated_contact_allowed: false,
          do_not_email: true,
          do_not_text: true,
          do_not_call: true,
          notes: "Contact stopped: the homeowner deleted their SuCasa account.",
        })
        .eq("homeowner_id", userId);

      await admin
        .from("lender_portfolio_clients")
        .update({ contact_marketing_permission: false })
        .eq("homeowner_id", userId);

      return "marketing and automated contact disabled";
    },

    async cancel_scheduled_work() {
      await admin
        .from("campaign_sends")
        .update({ status: "canceled" })
        .eq("homeowner_id", userId)
        .in("status", ["queued", "scheduled", "pending"]);

      await admin
        .from("daily_read_sends")
        .update({ state: "canceled", status: "canceled" })
        .eq("user_id", userId)
        .is("sent_at", null);

      await admin
        .from("homeowner_alerts")
        .update({ dismissed_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("dismissed_at", null);

      // Stop enrichment/re-matching for the linked business records so nothing
      // re-creates or re-derives the person while deletion runs.
      const { data: clients } = await admin
        .from("lender_portfolio_clients")
        .select("id")
        .eq("homeowner_id", userId);
      const clientIds = (clients ?? []).map((c: any) => c.id);
      if (clientIds.length > 0) {
        await admin
          .from("property_enrichment_queue")
          .update({ status: "canceled" })
          .in("portfolio_client_id", clientIds);
      }

      await admin
        .from("ghl_sync_queue")
        .update({ processed_at: new Date().toISOString(), last_error: "account deleted" })
        .eq("entity_id", userId)
        .is("processed_at", null);

      return "scheduled sends, alerts, enrichment and CRM sync cancelled";
    },

    async handle_subscription() {
      const { data: memberships } = await admin
        .from("premium_memberships")
        .select("id, funding_source, stripe_subscription_id, price_cents, status")
        .eq("homeowner_id", userId)
        .eq("status", "active");

      const rows = memberships ?? [];
      if (rows.length === 0) return "no active subscription";

      for (const m of rows) {
        if (m.stripe_subscription_id) {
          const { cancelSubscription } = await import("./billing.server");
          await cancelSubscription(m.stripe_subscription_id);
          await admin.from("deletion_retained_records").insert({
            deletion_request_id: ctx.requestId,
            record_type: "payment_provider_records",
            record_id: m.stripe_subscription_id,
            reason:
              "Billing and accounting records held by the payment provider are retained as required; no future charges will be made.",
          });
        }
        await admin
          .from("premium_memberships")
          .update({
            status: "ended",
            canceled_at: new Date().toISOString(),
            ends_at: new Date().toISOString(),
          })
          .eq("id", m.id);
      }
      return `subscription cancelled (${rows.length})`;
    },

    async record_suppression() {
      const res = await recordSuppression(admin, {
        email: ctx.email,
        phone: ctx.phone,
        street: ctx.street,
        zip: ctx.zip,
        eventType: "account_deleted",
        source: "account_settings",
        reason: "Honoring the person's deletion request.",
      });
      if (!res.recorded) {
        throw new Error(
          "No email address or phone number was available to honor the deletion preference.",
        );
      }
      return "suppression recorded";
    },

    async document_open_transactions() {
      const { data: openReqs } = await admin
        .from("service_requests")
        .select("id, category, status, vendor_name, scheduled_at")
        .eq("homeowner_id", userId)
        .in("status", OPEN_REQUEST_STATUSES);

      const pending = (openReqs ?? []).filter((r: any) =>
        PENDING_REQUEST_STATUSES.includes(r.status),
      );
      const committed = (openReqs ?? []).filter((r: any) =>
        COMMITTED_REQUEST_STATUSES.includes(r.status),
      );

      // Nobody outside SuCasa has accepted these, so they can be cancelled.
      for (const r of pending) {
        await admin.from("deletion_retained_records").insert({
          deletion_request_id: ctx.requestId,
          record_type: "service_request",
          record_id: r.id,
          reason: `Unaccepted ${r.category} request cancelled on deletion; no provider had accepted it.`,
          metadata: { status_at_deletion: r.status, disposition: "cancelled" },
        });
      }
      if (pending.length > 0) {
        await admin
          .from("service_requests")
          .update({
            status: "Cancelled",
            cancelled_at: new Date().toISOString(),
            cancellation_reason: "Homeowner deleted their SuCasa account before any provider accepted",
          })
          .eq("homeowner_id", userId)
          .in("status", PENDING_REQUEST_STATUSES);
      }

      // A provider already accepted these. SuCasa does not cancel an agreement
      // between the homeowner and another business: detach the request from the
      // deleted account and keep only the minimum transaction record.
      for (const r of committed) {
        await admin.from("deletion_retained_records").insert({
          deletion_request_id: ctx.requestId,
          record_type: "service_request",
          record_id: r.id,
          reason:
            `${r.category} job already accepted by an independent provider; detached from the deleted account and retained only as the minimum record of that transaction.`,
          metadata: {
            status_at_deletion: r.status,
            disposition: "detached",
            vendor_name: r.vendor_name ?? null,
            scheduled_at: r.scheduled_at ?? null,
          },
        });
        await admin
          .from("service_requests")
          .update({
            homeowner_id: null,
            notes: "SuCasa account deleted; this job continues with the provider independently of SuCasa.",
          })
          .eq("id", r.id);
      }

      const { data: openIntros } = await admin
        .from("introduction_requests")
        .select("id, status")
        .eq("homeowner_id", userId)
        .in("status", ["pending", "approved"]);
      for (const i of openIntros ?? []) {
        await admin.from("deletion_retained_records").insert({
          deletion_request_id: ctx.requestId,
          record_type: "introduction_request",
          record_id: i.id,
          reason: "Introduction withdrawn on deletion; consent evidence retained.",
          metadata: { status_at_deletion: i.status },
        });
      }
      if ((openIntros ?? []).length > 0) {
        await admin
          .from("introduction_requests")
          .update({ status: "withdrawn" })
          .eq("homeowner_id", userId)
          .in("status", ["pending", "approved"]);
      }

      return `cancelled ${pending.length}, detached ${committed.length}, withdrew ${(openIntros ?? []).length}`;
    },

    async unlink_business_records() {
      const { data: clients } = await admin
        .from("lender_portfolio_clients")
        .select("id")
        .eq("homeowner_id", userId);
      const count = (clients ?? []).length;

      if (count > 0) {
        await admin
          .from("lender_portfolio_clients")
          .update({
            homeowner_id: null,
            intelligence_access_scope: "none",
            relationship_basis: "org_record",
            contact_marketing_permission: false,
            last_intel_refreshed_at: null,
          })
          .eq("homeowner_id", userId);
      }

      await admin.from("relationships").delete().eq("homeowner_id", userId);
      await admin.from("homeowner_lender_consents").delete().eq("homeowner_id", userId);

      return `unlinked ${count} organization records`;
    },

    async delete_storage_files() {
      const { data: docs } = await admin
        .from("home_documents")
        .select("storage_path")
        .eq("user_id", userId);
      const docPaths = (docs ?? []).map((d: any) => d.storage_path).filter(Boolean);
      if (docPaths.length > 0) {
        const { error } = await admin.storage.from("home-documents").remove(docPaths);
        if (error) throw new Error(error.message);
      }

      const { data: reqs } = await admin
        .from("service_requests")
        .select("invoice_path, receipt_path")
        .eq("homeowner_id", userId);
      const invoices = (reqs ?? []).map((r: any) => r.invoice_path).filter(Boolean);
      const receipts = (reqs ?? []).map((r: any) => r.receipt_path).filter(Boolean);
      if (invoices.length > 0) await admin.storage.from("service-invoices").remove(invoices);
      if (receipts.length > 0) await admin.storage.from("service-receipts").remove(receipts);

      return `removed ${docPaths.length + invoices.length + receipts.length} files`;
    },

    async revoke_sessions_and_delete_account() {
      // Deleting the auth user revokes every active session and personal access
      // token, and cascades the SuCasa-controlled personal tables.
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw new Error(error.message);
      return "sessions revoked and account removed";
    },
  };
}

/**
 * Run a deletion. Safe to call again after a partial failure: completed steps
 * are recorded on the request row and skipped on the retry.
 */
export async function executeAccountDeletion(
  admin: any,
  userId: string,
): Promise<DeletionOutcome & { requestId: string }> {
  const { data: profile } = await admin
    .from("profiles")
    .select("email, phone, address, zip")
    .eq("id", userId)
    .maybeSingle();

  const emailKey = normalizeEmailKey(profile?.email ?? null);
  const userHmac = emailKey ? identifierHmac("email", emailKey) : null;

  const { data: existing } = await admin
    .from("account_deletion_requests")
    .select("id, steps, status")
    .eq("user_id", userId)
    .neq("status", "completed")
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let requestId: string;
  let alreadyDone: string[] = [];
  if (existing) {
    requestId = existing.id;
    alreadyDone = ((existing.steps as any[]) ?? [])
      .filter((s) => s?.ok)
      .map((s) => String(s.step));
  } else {
    const { data: created, error } = await admin
      .from("account_deletion_requests")
      .insert({ user_id: userId, user_hmac: userHmac, status: "running" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    requestId = created.id;
  }

  const io = buildDeletionIo({
    admin,
    userId,
    requestId,
    email: profile?.email ?? null,
    phone: profile?.phone ?? null,
    street: profile?.address ?? null,
    zip: profile?.zip ?? null,
  });

  const outcome = await runAccountDeletion(io, { alreadyDone });

  await admin
    .from("account_deletion_requests")
    .update({
      status: outcome.status,
      steps: outcome.steps,
      failures: outcome.failures,
      needs_admin_attention: outcome.needsAdminAttention,
      completed_at: outcome.status === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", requestId);

  await logDeletionEvent(admin, {
    action: outcome.status === "completed" ? "account_deleted" : "account_deletion_partial",
    entityId: requestId,
    detail:
      outcome.status === "completed"
        ? "Personal data removed; suppression recorded."
        : `Deletion incomplete: ${outcome.failures.map((f) => f.step).join(", ")}`,
    metadata: {
      request_id: requestId,
      subject_hmac: userHmac,
      steps: outcome.steps.map((s) => ({ step: s.step, ok: s.ok })),
    },
  });

  return { ...outcome, requestId };
}

export function normalizedPhoneKeyFor(raw: string | null): string | null {
  return normalizePhoneKey(raw);
}
