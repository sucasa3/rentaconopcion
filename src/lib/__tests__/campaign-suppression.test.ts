import { describe, it, expect, vi, beforeEach } from "vitest";
import { classifyEmailOutcome } from "../campaign-email-outcome";

const tables: Record<string, any[]> = {};
function q(table: string) {
  let rows = [...(tables[table] ?? [])];
  const b: any = {
    select: () => b,
    order: () => b,
    limit: () => b,
    eq: (k: string, v: any) => ((rows = rows.filter((r) => r[k] === v)), b),
    in: (k: string, v: any[]) => ((rows = rows.filter((r) => v.includes(r[k]))), b),
    or: (expr: string) => {
      const pairs = expr.split(",").map((p) => p.split(".eq."));
      rows = rows.filter((r) => pairs.some(([k, v]) => r[k] === v));
      return b;
    },
    insert: async (row: any) => {
      (tables[table] ??= []).push(row);
      return { error: null };
    },
    then: (res: any) => res({ data: rows, error: null }),
  };
  return b;
}
const admin = { from: (t: string) => q(t) };
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: admin }));
const sendSpy = vi.fn();
vi.mock("@/lib/email-templates/send-email", () => ({ sendTemplateEmail: sendSpy }));

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  sendSpy.mockReset();
});

describe("email outcome", () => {
  it("provider recipient_suppressed is permanent, not retryable", () => {
    expect(classifyEmailOutcome({ sent: false, reason: "recipient_suppressed" })).toMatchObject({ status: "suppressed", retryable: false });
  });
  it("rate limit / network failure stays a retryable temporary failure", () => {
    const o = classifyEmailOutcome(new Error("Email API error: 429 rate_limited"));
    expect(o).toMatchObject({ status: "queued", retryable: true });
    expect(o.error).toMatch(/^temporary:/);
  });
  it("our own preference block is not recorded as provider suppression", () => {
    expect(classifyEmailOutcome({ sent: false, reason: "contact_preference" }).status).toBe("blocked");
  });
});

describe("provider suppression register", () => {
  it("blocks later email attempts but not texting or imports", async () => {
    const { recordSuppression, isSuppressed } = await import("../suppression.server");
    await recordSuppression(admin, { email: "A@x.com", scope: "email", eventType: "provider_suppressed", source: "lovable_email" });
    const row = tables.deletion_suppressions[0];
    expect(row.phone_hmac).toBeNull();
    expect(row.source).toBe("lovable_email");
    expect(await isSuppressed(admin, { email: "a@x.com" }, { channel: "email" })).toBe(true);
    expect(await isSuppressed(admin, { email: "a@x.com", phone: "5555550100" })).toBe(false);
  });
});

describe("paused campaigns", () => {
  it("do not dispatch", async () => {
    tables.campaigns = [{ id: "c1", key: "monthly_value_update", active: true }];
    tables.campaign_activations = [{ id: "a1", lender_org_id: "o1", campaign_id: "c1", active: false }];
    const { runCampaignTick } = await import("../campaigns-run.server");
    const r = await runCampaignTick({});
    expect(r.generated).toBe(0);
    expect(sendSpy).not.toHaveBeenCalled();
  });
});
