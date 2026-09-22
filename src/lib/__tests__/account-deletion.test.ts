import { describe, expect, it, vi } from "vitest";

import {
  DELETION_STEPS,
  RECENT_AUTH_MAX_AGE_SECONDS,
  authenticatedAtSeconds,
  isRecentlyAuthenticated,
  runAccountDeletion,
  suppressionMatches,
  type DeletionIo,
  type DeletionStep,
} from "@/lib/account-deletion";
import {
  candidateFor,
  identifierHmac,
  normalizeAddressKey,
  normalizeEmailKey,
  normalizePhoneKey,
} from "@/lib/suppression.server";

// --- Recent authentication --------------------------------------------------

describe("recent authentication requirement", () => {
  const now = 1_800_000_000;

  it("uses the latest actual authentication, not the token refresh time", () => {
    const claims = {
      iat: now,
      amr: [
        { method: "password", timestamp: now - 9_000 },
        { method: "otp", timestamp: now - 120 },
      ],
    };
    expect(authenticatedAtSeconds(claims)).toBe(now - 120);
    expect(isRecentlyAuthenticated(claims, now)).toBe(true);
  });

  it("rejects an old session even with a freshly refreshed token", () => {
    const claims = { iat: now, amr: [{ method: "password", timestamp: now - 86_400 }] };
    expect(isRecentlyAuthenticated(claims, now)).toBe(false);
  });

  it("falls back to iat when amr is absent", () => {
    expect(isRecentlyAuthenticated({ iat: now - 60 }, now)).toBe(true);
    expect(isRecentlyAuthenticated({ iat: now - RECENT_AUTH_MAX_AGE_SECONDS - 5 }, now)).toBe(false);
  });

  it("rejects claims with no authentication evidence at all", () => {
    expect(isRecentlyAuthenticated({}, now)).toBe(false);
    expect(isRecentlyAuthenticated(null, now)).toBe(false);
  });
});

// --- Suppression identity rules ---------------------------------------------

describe("suppression identifiers", () => {
  it("stores only keyed one-way identifiers", () => {
    const c = candidateFor({ email: "Ana@Example.com", phone: "(415) 555-0132", street: "12 Oak St", zip: "94110" });
    expect(c.emailHmac).toMatch(/^[a-f0-9]{64}$/);
    expect(c.emailHmac).not.toContain("ana");
    expect(c.phoneHmac).not.toContain("0132");
    expect(c.addressHmac).not.toContain("Oak");
  });

  it("normalizes email, phone and address consistently", () => {
    expect(normalizeEmailKey(" ANA@Example.com ")).toBe("ana@example.com");
    expect(normalizeEmailKey("nope")).toBeNull();
    expect(normalizePhoneKey("415-555-0132")).toBe("+14155550132");
    expect(normalizeAddressKey("  12   Oak  St ", "94110")).toBe("12 oak st|94110");
  });

  it("suppresses a later re-import of the same person by email or phone", () => {
    const register = [
      {
        email_hmac: identifierHmac("email", "ana@example.com"),
        phone_hmac: identifierHmac("phone", "+14155550132"),
        address_hmac: identifierHmac("address", "12 oak st|94110"),
      },
    ];
    expect(suppressionMatches(register, candidateFor({ email: "ana@example.com" }))).toBe(true);
    expect(suppressionMatches(register, candidateFor({ phone: "4155550132" }))).toBe(true);
  });

  it("never suppresses on address alone, so a future occupant is not blocked", () => {
    const register = [
      {
        email_hmac: identifierHmac("email", "ana@example.com"),
        phone_hmac: null,
        address_hmac: identifierHmac("address", "12 oak st|94110"),
      },
    ];
    const newOccupant = candidateFor({
      email: "someone.else@example.com",
      street: "12 Oak St",
      zip: "94110",
    });
    expect(suppressionMatches(register, newOccupant)).toBe(false);
    // And a row with no identity at all cannot match anything.
    expect(suppressionMatches(register, candidateFor({ street: "12 Oak St", zip: "94110" }))).toBe(
      false,
    );
  });
});

// --- The ordered run --------------------------------------------------------

function ioWith(
  calls: string[],
  failAt?: DeletionStep,
): DeletionIo {
  const io = {} as DeletionIo;
  for (const step of DELETION_STEPS) {
    io[step] = async () => {
      if (step === failAt) throw new Error(`${step} failed upstream`);
      calls.push(step);
      return `${step} ok`;
    };
  }
  return io;
}

describe("deletion run order and safety", () => {
  it("stops future activity and cancels the subscription before removing anything", async () => {
    const calls: string[] = [];
    const out = await runAccountDeletion(ioWith(calls));
    expect(out.status).toBe("completed");
    expect(calls).toEqual([...DELETION_STEPS]);
    // outreach off, scheduled work cancelled, subscription handled, suppression
    // recorded — all strictly before storage and account removal.
    expect(calls.indexOf("stop_outreach")).toBeLessThan(calls.indexOf("delete_storage_files"));
    expect(calls.indexOf("cancel_scheduled_work")).toBeLessThan(
      calls.indexOf("revoke_sessions_and_delete_account"),
    );
    expect(calls.indexOf("handle_subscription")).toBeLessThan(calls.indexOf("record_suppression"));
    expect(calls.indexOf("record_suppression")).toBeLessThan(
      calls.indexOf("revoke_sessions_and_delete_account"),
    );
    expect(calls.indexOf("unlink_business_records")).toBeLessThan(
      calls.indexOf("revoke_sessions_and_delete_account"),
    );
  });

  it("reports a partial failure for administrative resolution instead of pretending success", async () => {
    const calls: string[] = [];
    const out = await runAccountDeletion(ioWith(calls, "delete_storage_files"));
    expect(out.status).toBe("partial");
    expect(out.needsAdminAttention).toBe(true);
    expect(out.failures.map((f) => f.step)).toContain("delete_storage_files");
    // Contact still stopped, and the account still removed: never left contactable.
    expect(calls).toContain("stop_outreach");
    expect(calls).toContain("revoke_sessions_and_delete_account");
  });

  it("refuses to remove the account when suppression could not be recorded", async () => {
    const calls: string[] = [];
    const out = await runAccountDeletion(ioWith(calls, "record_suppression"));
    expect(out.status).toBe("partial");
    expect(calls).not.toContain("revoke_sessions_and_delete_account");
    // Outreach is already off, so the person is not contactable meanwhile.
    expect(calls).toContain("stop_outreach");
    const blocked = out.failures.find((f) => f.step === "revoke_sessions_and_delete_account");
    expect(blocked?.error).toMatch(/Nothing was left contactable/i);
  });

  it("is idempotent: a repeat attempt skips the steps already completed", async () => {
    const calls: string[] = [];
    const out = await runAccountDeletion(ioWith(calls), {
      alreadyDone: ["stop_outreach", "cancel_scheduled_work", "handle_subscription", "record_suppression"],
    });
    expect(out.status).toBe("completed");
    expect(calls).not.toContain("stop_outreach");
    expect(calls).toContain("delete_storage_files");
    expect(calls).toContain("revoke_sessions_and_delete_account");
  });
});

// --- Step behaviour against a fake backend ---------------------------------

type Table = Record<string, any[]>;

function fakeAdmin(tables: Table, opts: { storageFails?: boolean } = {}) {
  const removed: Array<{ bucket: string; paths: string[] }> = [];
  const deletedUsers: string[] = [];
  const stripeCancelled: string[] = [];

  function query(name: string) {
    const rows = (tables[name] ??= []);
    const filters: Array<(r: any) => boolean> = [];
    const api: any = {
      select: () => api,
      eq: (col: string, val: any) => {
        filters.push((r) => r[col] === val);
        return api;
      },
      neq: (col: string, val: any) => {
        filters.push((r) => r[col] !== val);
        return api;
      },
      in: (col: string, vals: any[]) => {
        filters.push((r) => vals.includes(r[col]));
        return api;
      },
      is: (col: string, val: any) => {
        filters.push((r) => (r[col] ?? null) === val);
        return api;
      },
      or: () => api,
      order: () => api,
      limit: () => api,
      maybeSingle: async () => ({ data: match()[0] ?? null, error: null }),
      single: async () => ({ data: match()[0] ?? null, error: null }),
      insert: (payload: any) => {
        const list = Array.isArray(payload) ? payload : [payload];
        for (const p of list) rows.push({ id: `${name}-${rows.length + 1}`, ...p });
        const created = rows.slice(-list.length);
        const res: any = {
          select: () => res,
          single: async () => ({ data: created[0], error: null }),
          maybeSingle: async () => ({ data: created[0], error: null }),
          then: (cb: any) => cb({ data: created, error: null }),
        };
        return res;
      },
      update: (patch: any) => {
        const res: any = {
          eq: (col: string, val: any) => {
            filters.push((r) => r[col] === val);
            return res;
          },
          neq: (col: string, val: any) => {
            filters.push((r) => r[col] !== val);
            return res;
          },
          in: (col: string, vals: any[]) => {
            filters.push((r) => vals.includes(r[col]));
            return res;
          },
          is: (col: string, val: any) => {
            filters.push((r) => (r[col] ?? null) === val);
            return res;
          },
          then: (cb: any) => {
            for (const r of match()) Object.assign(r, patch);
            return cb({ data: null, error: null });
          },
        };
        return res;
      },
      delete: () => {
        const res: any = {
          eq: (col: string, val: any) => {
            tables[name] = rows.filter((r) => r[col] !== val);
            return res;
          },
          then: (cb: any) => cb({ data: null, error: null }),
        };
        return res;
      },
      then: (cb: any) => cb({ data: match(), error: null, count: match().length }),
    };
    function match() {
      return rows.filter((r) => filters.every((f) => f(r)));
    }
    return api;
  }

  return {
    tables,
    removed,
    deletedUsers,
    stripeCancelled,
    from: (name: string) => query(name),
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          if (opts.storageFails) return { error: { message: "storage unavailable" } };
          removed.push({ bucket, paths });
          return { error: null };
        },
      }),
    },
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          deletedUsers.push(id);
          return { error: null };
        },
      },
    },
  };
}

const USER = "user-1";

function seed() {
  return {
    profiles: [{ id: USER, email: "ana@example.com", phone: "+14155550132", address: "12 Oak St", zip: "94110" }],
    outreach_channel_permissions: [
      {
        homeowner_id: USER,
        portfolio_client_id: "pc-1",
        email_allowed: true,
        sms_allowed: true,
        phone_allowed: true,
        automated_contact_allowed: true,
        do_not_email: false,
        do_not_text: false,
        do_not_call: false,
      },
    ],
    lender_portfolio_clients: [
      {
        id: "pc-1",
        portfolio_id: "p-1",
        homeowner_id: USER,
        client_name: "Ana Ruiz",
        client_email: "ana@example.com",
        intelligence_access_scope: "own_relationship",
        contact_marketing_permission: true,
        last_intel_refreshed_at: "2026-09-01T00:00:00Z",
      },
    ],
    campaign_sends: [{ id: "cs-1", homeowner_id: USER, status: "queued" }],
    daily_read_sends: [{ id: "dr-1", user_id: USER, sent_at: null, state: "queued", status: "queued" }],
    homeowner_alerts: [{ id: "al-1", user_id: USER, dismissed_at: null }],
    property_enrichment_queue: [{ id: "q-1", portfolio_client_id: "pc-1", status: "pending" }],
    ghl_sync_queue: [{ id: "g-1", entity_id: USER, processed_at: null }],
    premium_memberships: [
      {
        id: "pm-1",
        homeowner_id: USER,
        status: "active",
        funding_source: "homeowner",
        price_cents: 1900,
        stripe_subscription_id: "sub_123",
      },
    ],
    service_requests: [
      { id: "sr-1", homeowner_id: USER, status: "Scheduled", category: "hvac", invoice_path: "inv/1.pdf", receipt_path: null },
    ],
    introduction_requests: [{ id: "ir-1", homeowner_id: USER, status: "pending" }],
    home_documents: [{ id: "d-1", user_id: USER, storage_path: "user-1/inspection.pdf" }],
    relationships: [{ id: "r-1", homeowner_id: USER }],
    homeowner_lender_consents: [{ id: "c-1", homeowner_id: USER }],
    deletion_suppressions: [],
    account_deletion_requests: [],
    deletion_retained_records: [],
    compliance_audit_events: [],
    lender_members: [],
  } as Table;
}

describe("deletion steps against a fake backend", () => {
  it("stops contact, cancels scheduled work, cancels the subscription, deletes files and the account", async () => {
    vi.resetModules();
    const cancel = vi.fn(async () => undefined);
    vi.doMock("@/lib/billing.server", () => ({ cancelSubscription: cancel }));
    const { executeAccountDeletion } = await import("@/lib/account-deletion.server");

    const admin = fakeAdmin(seed());
    const out = await executeAccountDeletion(admin as any, USER);

    expect(out.status).toBe("completed");

    const perms = admin.tables.outreach_channel_permissions[0];
    expect(perms.email_allowed).toBe(false);
    expect(perms.do_not_email).toBe(true);
    expect(perms.do_not_text).toBe(true);
    expect(perms.do_not_call).toBe(true);

    expect(admin.tables.campaign_sends[0].status).toBe("canceled");
    expect(admin.tables.daily_read_sends[0].state).toBe("canceled");
    expect(admin.tables.homeowner_alerts[0].dismissed_at).toBeTruthy();
    expect(admin.tables.property_enrichment_queue[0].status).toBe("canceled");
    expect(admin.tables.ghl_sync_queue[0].processed_at).toBeTruthy();

    // Subscription: cancelled upstream, no future charges, provider records kept.
    expect(cancel).toHaveBeenCalledWith("sub_123");
    expect(admin.tables.premium_memberships[0].status).toBe("ended");
    expect(
      admin.tables.deletion_retained_records.some((r) => r.record_type === "payment_provider_records"),
    ).toBe(true);

    // Open transactions documented and closed.
    // Already accepted by a provider: detached, never cancelled by SuCasa.
    expect(admin.tables.service_requests[0].status).toBe("Scheduled");
    expect(admin.tables.service_requests[0].homeowner_id).toBeNull();
    expect(admin.tables.introduction_requests[0].status).toBe("withdrawn");
    expect(
      admin.tables.deletion_retained_records.some((r) => r.record_type === "service_request"),
    ).toBe(true);

    // Organization business record survives, but unlinked and do-not-contact.
    const client = admin.tables.lender_portfolio_clients[0];
    expect(client.client_name).toBe("Ana Ruiz");
    expect(client.homeowner_id).toBeNull();
    expect(client.intelligence_access_scope).toBe("none");
    expect(client.contact_marketing_permission).toBe(false);
    expect(client.last_intel_refreshed_at).toBeNull();
    expect(admin.tables.relationships).toHaveLength(0);
    expect(admin.tables.homeowner_lender_consents).toHaveLength(0);

    // Storage and account.
    expect(admin.removed.some((r) => r.bucket === "home-documents")).toBe(true);
    // The invoice belongs to a job already accepted by a provider, so it stays
    // with that detached transaction record rather than being destroyed.
    expect(admin.removed.some((r) => r.bucket === "service-invoices")).toBe(false);
    expect(admin.deletedUsers).toEqual([USER]);

    // Suppression recorded with hashes only, and audit evidence written.
    const sup = admin.tables.deletion_suppressions[0];
    expect(sup.email_hmac).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(sup)).not.toContain("ana@example.com");
    expect(JSON.stringify(sup)).not.toContain("Ana");
    const audit = admin.tables.compliance_audit_events.at(-1);
    expect(audit.action).toBe("account_deleted");
    expect(audit.homeowner_id).toBeNull();
  });

  it("keeps the account when storage deletion fails, and flags it for admins", async () => {
    vi.resetModules();
    vi.doMock("@/lib/billing.server", () => ({ cancelSubscription: async () => undefined }));
    const { executeAccountDeletion } = await import("@/lib/account-deletion.server");

    const admin = fakeAdmin(seed(), { storageFails: true });
    const out = await executeAccountDeletion(admin as any, USER);

    expect(out.status).toBe("partial");
    expect(out.failures.map((f) => f.step)).toContain("delete_storage_files");
    const request = admin.tables.account_deletion_requests[0];
    expect(request.needs_admin_attention).toBe(true);
    // Contact already stopped and suppression recorded, so never contactable.
    expect(admin.tables.outreach_channel_permissions[0].do_not_email).toBe(true);
    expect(admin.tables.deletion_suppressions).toHaveLength(1);
  });

  it("a repeat deletion attempt reuses the open request and does not duplicate suppression", async () => {
    vi.resetModules();
    vi.doMock("@/lib/billing.server", () => ({ cancelSubscription: async () => undefined }));
    const { executeAccountDeletion } = await import("@/lib/account-deletion.server");

    const admin = fakeAdmin(seed(), { storageFails: true });
    await executeAccountDeletion(admin as any, USER);
    await executeAccountDeletion(admin as any, USER);

    expect(admin.tables.account_deletion_requests).toHaveLength(1);
    expect(admin.tables.deletion_suppressions).toHaveLength(1);
  });
});

describe("organization ownership before deletion", () => {
  it("blocks the last owner, and clears once ownership is transferred", async () => {
    const { lastOwnerOrgs, transferOrgOwnership } = await import("@/lib/account-deletion.server");
    const tables = seed();
    tables.lender_members = [
      { id: "m-1", lender_org_id: "org-1", user_id: USER, role: "owner" },
      { id: "m-2", lender_org_id: "org-1", user_id: "user-2", role: "manager" },
    ];
    tables.lender_orgs = [{ id: "org-1", name: "Cedar Lending", active: true }];
    const admin = fakeAdmin(tables);

    const blocking = await lastOwnerOrgs(admin as any, USER);
    expect(blocking).toHaveLength(1);
    expect(blocking[0].orgName).toBe("Cedar Lending");

    await transferOrgOwnership(admin as any, {
      orgId: "org-1",
      fromUserId: USER,
      toUserId: "user-2",
    });
    expect(await lastOwnerOrgs(admin as any, USER)).toHaveLength(0);
  });

  it("closing the organization also clears the path to deletion", async () => {
    const { lastOwnerOrgs, closeOrganization } = await import("@/lib/account-deletion.server");
    const tables = seed();
    tables.lender_members = [{ id: "m-1", lender_org_id: "org-1", user_id: USER, role: "owner" }];
    tables.lender_orgs = [{ id: "org-1", name: "Cedar Lending", active: true }];
    tables.lender_portfolios = [{ id: "p-1", lender_org_id: "org-1" }];
    const admin = fakeAdmin(tables);

    expect(await lastOwnerOrgs(admin as any, USER)).toHaveLength(1);
    await closeOrganization(admin as any, { orgId: "org-1", actorUserId: USER });
    expect(admin.tables.lender_orgs[0].active).toBe(false);
    expect(await lastOwnerOrgs(admin as any, USER)).toHaveLength(0);
  });
});

describe("open transactions: pending vs provider-accepted", () => {
  it("cancels an unaccepted request but detaches one a provider already accepted", async () => {
    vi.resetModules();
    vi.doMock("@/lib/billing.server", () => ({ cancelSubscription: async () => undefined }));
    const { executeAccountDeletion } = await import("@/lib/account-deletion.server");

    const tables = seed();
    tables.service_requests = [
      { id: "sr-pending", homeowner_id: USER, status: "New", category: "roof", invoice_path: null, receipt_path: null },
      {
        id: "sr-accepted",
        homeowner_id: USER,
        status: "Scheduled",
        category: "hvac",
        vendor_name: "Cedar HVAC",
        scheduled_at: "2026-10-01T15:00:00Z",
        invoice_path: null,
        receipt_path: null,
      },
    ];
    const admin = fakeAdmin(tables);
    const out = await executeAccountDeletion(admin as any, USER);
    expect(out.status).toBe("completed");

    // Files for the unaccepted request are destroyed with the account.
    const pending = admin.tables.service_requests.find((r: any) => r.id === "sr-pending");
    expect(pending.status).toBe("Cancelled");
    expect(pending.cancelled_at).toBeTruthy();

    // Never cancelled on the homeowner's behalf: it continues with the provider.
    const accepted = admin.tables.service_requests.find((r: any) => r.id === "sr-accepted");
    expect(accepted.status).toBe("Scheduled");
    expect(accepted.homeowner_id).toBeNull();

    const retained = admin.tables.deletion_retained_records.filter(
      (r: any) => r.record_type === "service_request",
    );
    expect(retained.find((r: any) => r.record_id === "sr-pending").metadata.disposition).toBe(
      "cancelled",
    );
    expect(retained.find((r: any) => r.record_id === "sr-accepted").metadata.disposition).toBe(
      "detached",
    );
  });

  it("the preview counts unaccepted and provider-accepted requests separately", async () => {
    const { deletionPreview } = await import("@/lib/account-deletion.server");
    const tables = seed();
    tables.service_requests = [
      { id: "a", homeowner_id: USER, status: "Matched", category: "roof" },
      { id: "b", homeowner_id: USER, status: "Claimed", category: "hvac" },
      { id: "c", homeowner_id: USER, status: "In Progress", category: "plumbing" },
      { id: "d", homeowner_id: USER, status: "Completed", category: "paint" },
    ];
    const preview = await deletionPreview(fakeAdmin(tables) as any, USER);
    expect(preview.pendingServiceRequests).toBe(1);
    expect(preview.committedServiceRequests).toBe(2);
  });
});

describe("new consent after deletion", () => {
  it("retires the old suppression as a new consent event instead of silently reusing it", async () => {
    const { recordSuppression, isSuppressed, recordConsentAfterSuppression } = await import(
      "@/lib/suppression.server"
    );
    const tables = seed();
    const admin = fakeAdmin(tables);

    await recordSuppression(admin as any, {
      email: "returning@example.com",
      eventType: "account_deleted",
      source: "account_settings",
    });
    expect(await isSuppressed(admin as any, { email: "returning@example.com" })).toBe(true);

    const res = await recordConsentAfterSuppression(admin as any, {
      email: "returning@example.com",
      userId: "user-new",
      source: "new_account_verified",
    });
    expect(res.renewed).toBe(true);
    expect(await isSuppressed(admin as any, { email: "returning@example.com" })).toBe(false);
    const event = admin.tables.compliance_audit_events.find(
      (e: any) => e.action === "consent_renewed_after_deletion",
    );
    expect(event).toBeTruthy();
    expect(event.metadata.subject_email_hmac).toBeTruthy();
    expect(JSON.stringify(event)).not.toContain("returning@example.com");
  });

  it("leaves an unrelated person's suppression in place", async () => {
    const { recordSuppression, isSuppressed, recordConsentAfterSuppression } = await import(
      "@/lib/suppression.server"
    );
    const admin = fakeAdmin(seed());
    await recordSuppression(admin as any, {
      email: "someone.else@example.com",
      eventType: "account_deleted",
      source: "account_settings",
    });
    await recordConsentAfterSuppression(admin as any, { email: "returning@example.com" });
    expect(await isSuppressed(admin as any, { email: "someone.else@example.com" })).toBe(true);
  });
});
