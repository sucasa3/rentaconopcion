/**
 * Agent Discovery — server side. Reuses the agent book, the shared property
 * record (via the existing enrichment trigger), suppression checks, the
 * credit ledger and Agent Today's queue. No second ranking or signal engine.
 */
import { addressKey, planAgentIntake, type AgentIntakeRow } from "./agent-discovery";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function phoneHash(e164: string): Promise<string> {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(`sucasa-phone:${e164}`).digest("hex");
}

/** The caller's agent org for this book, or throws. */
export async function requireAgentBook(supabase: any, userId: string, portfolioId: string) {
  const db = await admin();
  const { data: book } = await db
    .from("lender_portfolios")
    .select("id, lender_org_id, lender_orgs(id, name, org_type, plan_key, subscription_status)")
    .eq("id", portfolioId)
    .maybeSingle();
  if (!book || (book as any).lender_orgs?.org_type !== "agent") throw new Error("Book not found");
  const orgId = (book as any).lender_org_id as string;
  const { data: member } = await supabase.rpc("is_lender_member", { _user_id: userId, _org_id: orgId });
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!member && !isAdmin) throw new Error("Forbidden");
  return { orgId, org: (book as any).lender_orgs };
}

async function remainingFor(orgId: string): Promise<number> {
  const db = await admin();
  const { data } = await db.from("agent_credit_ledger").select("delta").eq("org_id", orgId);
  return (data ?? []).reduce((s: number, r: any) => s + (r.delta ?? 0), 0);
}

async function existingKeys(portfolioId: string): Promise<string[]> {
  const db = await admin();
  const { data } = await db
    .from("lender_portfolio_clients")
    .select("address_key, address_line1, city, state, zip")
    .eq("portfolio_id", portfolioId)
    .is("archived_at", null);
  return (data ?? []).map(
    (c: any) =>
      c.address_key ?? addressKey({ address: c.address_line1 ?? "", zip: c.zip, city: c.city, state: c.state }),
  );
}

/**
 * Insert rows; the partial unique index on (portfolio_id, address_key) makes
 * concurrent uploads of the same file converge on one profile per property.
 */
async function insertRows(
  portfolioId: string,
  rows: (AgentIntakeRow & { address_key: string })[],
): Promise<{ inserted: number; raced: number }> {
  if (!rows.length) return { inserted: 0, raced: 0 };
  const db = await admin();
  const payload = rows.map((r) => ({
    portfolio_id: portfolioId,
    client_name: r.full_name,
    client_email: r.email ?? null,
    address_line1: r.address,
    city: r.city ?? null,
    state: r.state ?? null,
    zip: r.zip ?? null,
    notes: r.note ?? null,
    address_key: r.address_key,
  }));
  const { error } = await db.from("lender_portfolio_clients").insert(payload);
  if (!error) return { inserted: rows.length, raced: 0 };
  if (error.code !== "23505") throw new Error(error.message);
  // Someone inserted one of these concurrently — fall back to one at a time.
  let inserted = 0;
  let raced = 0;
  for (const p of payload) {
    const { error: e } = await db.from("lender_portfolio_clients").insert(p);
    if (!e) inserted += 1;
    else if (e.code === "23505") raced += 1;
    else throw new Error(e.message);
  }
  return { inserted, raced };
}

export interface DiscoveryReport {
  submitted: number;
  imported: number;
  duplicates: number;
  sharedContacts: number;
  needsAddress: number;
  excluded: number;
  optedOut: number;
  overAllowance: number;
  at: string;
}

export async function runAgentDiscovery(input: {
  userId: string;
  orgId: string;
  portfolioId: string;
  csv: string;
}): Promise<DiscoveryReport> {
  const db = await admin();
  const { parseClientCsv } = await import("./lender.server");
  const sink = { addressless: [] as any[], invalid: 0 };
  const parsed = parseClientCsv(input.csv, sink);

  const { partitionSuppressed } = await import("./suppression.server");
  const { allowed, suppressed } = await partitionSuppressed(db, parsed, (r: any) => ({
    email: r.email ?? null,
    street: r.address,
    zip: r.zip ?? null,
  }));

  const plan = planAgentIntake(allowed as AgentIntakeRow[], {
    existingKeys: await existingKeys(input.portfolioId),
    remaining: await remainingFor(input.orgId),
  });
  const { inserted, raced } = await insertRows(input.portfolioId, plan.toImport);

  const report: DiscoveryReport = {
    submitted: parsed.length + sink.addressless.length + sink.invalid,
    imported: inserted,
    duplicates: plan.duplicateProperties + raced,
    sharedContacts: plan.sharedContactRows,
    needsAddress: sink.addressless.length,
    excluded: sink.invalid,
    optedOut: suppressed.length,
    overAllowance: plan.overAllowance.length,
    at: new Date().toISOString(),
  };

  // One run per book: a retry updates the same job and never re-grants.
  await db.from("agent_discovery_runs").upsert(
    {
      org_id: input.orgId,
      portfolio_id: input.portfolioId,
      created_by: input.userId,
      report,
      pending_rows: plan.overAllowance,
      needs_address: sink.addressless.slice(0, 500).map((r: any) => ({
        full_name: r.full_name,
        email: r.email ?? null,
      })),
    },
    { onConflict: "portfolio_id" },
  );
  return report;
}

/** After an upgrade: import held rows within the new capacity. Safe to repeat. */
export async function importPendingRows(orgId: string, portfolioId: string) {
  const db = await admin();
  const { data: run } = await db
    .from("agent_discovery_runs")
    .select("id, pending_rows, report")
    .eq("portfolio_id", portfolioId)
    .maybeSingle();
  const pending = ((run as any)?.pending_rows ?? []) as (AgentIntakeRow & { address_key: string })[];
  if (!run || !pending.length) return { inserted: 0, stillPending: 0, duplicates: 0 };

  const plan = planAgentIntake(pending, {
    existingKeys: await existingKeys(portfolioId),
    remaining: await remainingFor(orgId),
  });
  const { inserted, raced } = await insertRows(portfolioId, plan.toImport);
  await db
    .from("agent_discovery_runs")
    .update({
      pending_rows: plan.overAllowance,
      report: { ...((run as any).report ?? {}), overAllowance: plan.overAllowance.length },
    })
    .eq("id", (run as any).id);
  return {
    inserted,
    stillPending: plan.overAllowance.length,
    duplicates: plan.duplicateProperties + raced,
  };
}

// ---------------------------------------------------------------------------
// SMS verification (Twilio Verify through the connector gateway)
// ---------------------------------------------------------------------------

export function smsConfigured(): boolean {
  return Boolean(
    process.env["LOVABLE_API_KEY"] &&
      process.env["TWILIO_API_KEY"] &&
      process.env["TWILIO_VERIFY_SERVICE_SID"],
  );
}

async function twilio(path: string, body: Record<string, string>) {
  const res = await fetch(`https://connector-gateway.lovable.dev/twilio${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
      "X-Connection-Api-Key": process.env["TWILIO_API_KEY"]!,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Text message service error [${res.status}]: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

export async function sendSmsCode(e164: string) {
  if (!smsConfigured()) throw new Error("SMS_NOT_CONFIGURED");
  const sid = process.env["TWILIO_VERIFY_SERVICE_SID"]!;
  await twilio(`/verify/v2/Services/${sid}/Verifications`, { To: e164, Channel: "sms" });
}

export async function checkSmsCode(e164: string, code: string): Promise<boolean> {
  if (!smsConfigured()) throw new Error("SMS_NOT_CONFIGURED");
  const sid = process.env["TWILIO_VERIFY_SERVICE_SID"]!;
  const r = await twilio(`/verify/v2/Services/${sid}/VerificationCheck`, { To: e164, Code: code });
  return r?.status === "approved";
}

// ---------------------------------------------------------------------------
// Promotion redemption
// ---------------------------------------------------------------------------

export type PromoOutcome = "granted" | "already_entitled" | "phone_used" | "user_used" | "org_used";

/**
 * Record a server-verified phone, then redeem atomically. Shared license or
 * email domain are review signals only and never block on their own.
 */
export async function recordVerifiedPhoneAndRedeem(input: {
  userId: string;
  orgId: string;
  e164: string;
  licenseKey: string | null;
  licenseNumber: string | null;
  licenseState: string | null;
}): Promise<PromoOutcome> {
  const db = await admin();
  const hash = await phoneHash(input.e164);

  await db.from("agent_identity").upsert(
    {
      user_id: input.userId,
      phone_hash: hash,
      phone_last4: input.e164.slice(-4),
      phone_verified_at: new Date().toISOString(),
      license_number: input.licenseNumber,
      license_state: input.licenseState,
      license_key: input.licenseKey,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (input.licenseKey) {
    const { data: sameLicense } = await db
      .from("agent_identity")
      .select("user_id")
      .eq("license_key", input.licenseKey)
      .neq("user_id", input.userId)
      .limit(1);
    if ((sameLicense ?? []).length) {
      await openReview({
        kind: "license_match",
        userId: input.userId,
        orgId: input.orgId,
        relatedUserId: (sameLicense as any)[0].user_id,
        signals: { license_state: input.licenseState },
      });
    }
  }

  const { data, error } = await db.rpc("redeem_agent_promotion", {
    _user_id: input.userId,
    _org_id: input.orgId,
    _phone_hash: hash,
  });
  if (error) throw new Error(error.message);
  const outcome = data as PromoOutcome;

  if (outcome === "phone_used") {
    const { data: prior } = await db
      .from("agent_promo_redemptions")
      .select("user_id")
      .eq("phone_hash", hash)
      .maybeSingle();
    await openReview({
      kind: "shared_phone",
      userId: input.userId,
      orgId: input.orgId,
      relatedUserId: (prior as any)?.user_id ?? null,
      signals: { phone_last4: input.e164.slice(-4) },
    });
  }
  return outcome;
}

async function openReview(r: {
  kind: string;
  userId: string;
  orgId: string | null;
  relatedUserId: string | null;
  signals: Record<string, unknown>;
}) {
  const db = await admin();
  await db
    .from("agent_identity_reviews")
    .insert({
      kind: r.kind,
      user_id: r.userId,
      org_id: r.orgId,
      related_user_id: r.relatedUserId,
      signals: r.signals,
    })
    .then(
      () => undefined,
      () => undefined,
    );
}
