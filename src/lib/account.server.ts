/**
 * Account-settings server helpers: verified contact changes and the personal
 * privacy export.
 *
 * Scope rule for the export: it contains the signed-in person's OWN personal
 * information and what SuCasa holds about them. It deliberately never includes
 * client records an agent or lender organization holds about other people —
 * those are third-party personal data owned by the organization, and a
 * workspace export is a separate, permission-governed feature.
 */

import { createHmac, randomInt, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

/** Digits-only US/E.164 normalization so a number verifies and matches later. */
export function normalizePhone(raw: string): string | null {
  const digits = (raw ?? "").replace(/\D+/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

/** Show only the last four digits back to the user. */
export function maskPhone(e164: string): string {
  const tail = e164.slice(-4);
  return `••• ••• ${tail}`;
}

function codeSecret(): string {
  // Reuses the existing server-held token secret; never leaves the server.
  return process.env["INVITE_TOKEN_SECRET"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
}

/** Six-digit verification code. */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Keyed hash of a code + its target, so a stolen row cannot be replayed. */
export function hashCode(code: string, target: string): string {
  return createHmac("sha256", codeSecret()).update(`${target}:${code}`).digest("hex");
}

export function codeMatches(code: string, target: string, storedHash: string): boolean {
  const a = Buffer.from(hashCode(code, target));
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const CODE_TTL_MINUTES = 15;
export const MAX_CODE_ATTEMPTS = 5;
/** Codes a single account may request per hour. */
export const MAX_CODES_PER_HOUR = 3;

/** Append a privacy/account event to the existing compliance audit log. */
export async function recordAccountEvent(
  admin: Client,
  args: {
    userId: string;
    action: string;
    detail?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await admin.from("compliance_audit_events").insert({
    category: "privacy",
    action: args.action,
    actor_user_id: args.userId,
    homeowner_id: args.userId,
    entity_type: "account",
    entity_id: args.userId,
    detail: args.detail ?? null,
    metadata: (args.metadata ?? {}) as never,
  });
}

/**
 * Tables read for the personal privacy export, with the column that ties each
 * row to the requesting person. Organization-owned tables
 * (lender_portfolio_clients, sponsored_profiles, lender_members, pros,
 * professionals, agent workspace state, usage logs) are intentionally absent.
 */
export const PERSONAL_EXPORT_TABLES: ReadonlyArray<{ table: string; column: string }> = [
  { table: "user_roles", column: "user_id" },
  { table: "home_profiles", column: "user_id" },
  { table: "home_plans", column: "user_id" },
  { table: "home_plan_state", column: "user_id" },
  { table: "home_predicted_actions", column: "user_id" },
  { table: "home_component_service_log", column: "user_id" },
  { table: "home_inspection_findings", column: "user_id" },
  { table: "home_document_facts", column: "user_id" },
  { table: "home_value_snapshots", column: "user_id" },
  { table: "home_memory", column: "user_id" },
  { table: "homeowner_alerts", column: "user_id" },
  { table: "homeowner_intents", column: "user_id" },
  { table: "daily_read_sends", column: "user_id" },
  { table: "daily_read_signals", column: "user_id" },
  { table: "agent_conversations", column: "user_id" },
  { table: "agent_messages", column: "user_id" },
  { table: "homeowner_activity_events", column: "homeowner_id" },
  { table: "seller_intent_submissions", column: "homeowner_id" },
  { table: "service_requests", column: "homeowner_id" },
  { table: "consent_records", column: "homeowner_id" },
  { table: "homeowner_lender_consents", column: "homeowner_id" },
  { table: "homeowner_relationship_validations", column: "homeowner_id" },
  { table: "introduction_consent_events", column: "homeowner_id" },
  { table: "outreach_channel_permissions", column: "homeowner_id" },
  { table: "campaign_sends", column: "homeowner_id" },
  { table: "premium_memberships", column: "homeowner_id" },
  { table: "compliance_audit_events", column: "homeowner_id" },
];

/** Tables that must never appear in a personal privacy export. */
export const EXCLUDED_FROM_PERSONAL_EXPORT: ReadonlyArray<string> = [
  "lender_portfolio_clients",
  "lender_portfolios",
  "lender_orgs",
  "lender_members",
  "lender_member_profiles",
  "sponsored_profiles",
  "premium_sponsorships",
  "professionals",
  "pros",
  "agent_actions",
  "agent_feed_seen",
  "agent_permissions",
  "business_task_state",
  "ai_usage_log",
  "attom_call_log",
  "batchdata_call_log",
];

/** JSON-safe value: everything in the export crosses the wire as JSON. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type PersonalExport = {
  generatedAt: string;
  scope: string;
  notIncluded: string;
  account: { [key: string]: JsonValue } | null;
  authEmail: string | null;
  documents: Array<{ [key: string]: JsonValue }>;
  data: { [key: string]: JsonValue[] };
};

/**
 * Assemble the personal export. `db` must be a client acting as the requesting
 * user, so row-level security is a second boundary behind the explicit filters.
 */
export async function buildPersonalExport(
  db: Client,
  userId: string,
  authEmail: string | null,
): Promise<PersonalExport> {
  const { data: account } = await db.from("profiles").select("*").eq("id", userId).maybeSingle();

  const data: { [key: string]: JsonValue[] } = {};
  for (const { table, column } of PERSONAL_EXPORT_TABLES) {
    const { data: rows } = await db
      .from(table as never)
      .select("*")
      .eq(column as never, userId as never);
    if (rows && rows.length > 0) data[table] = rows as unknown as JsonValue[];
  }

  // Document index with short-lived download links (files stay private).
  const documents: Array<{ [key: string]: JsonValue }> = [];
  const { data: docs } = await db
    .from("home_documents")
    .select("id, kind, original_filename, storage_path, created_at")
    .eq("user_id", userId);
  for (const doc of docs ?? []) {
    let url: string | null = null;
    if (doc.storage_path) {
      const { data: signed } = await db.storage
        .from("home-documents")
        .createSignedUrl(doc.storage_path, 600);
      url = signed?.signedUrl ?? null;
    }
    documents.push({
      id: doc.id,
      kind: doc.kind,
      filename: doc.original_filename,
      uploadedAt: doc.created_at,
      downloadUrl: url,
      downloadUrlExpiresInMinutes: 10,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    scope:
      "Your personal SuCasa information: your account, your home profile and plan, your documents, your requests, your activity, and your consent and communication records.",
    notIncluded:
      "This export does not include client records that a real estate agent or lender organization keeps about other people in their own workspace. Those are that organization's records, not your personal data.",
    account: (account as unknown as { [key: string]: JsonValue } | null) ?? null,
    authEmail,
    documents,
    data,
  };
}

/**
 * Security notification to the account's PREVIOUS email address after a verified
 * contact-detail change completes. Never includes codes or new contact values.
 * Best effort: a delivery failure must not undo a completed, verified change.
 */
export async function sendContactChangeAlert(opts: {
  previousEmail: string | null | undefined;
  changed: "email address" | "phone number";
  language?: string | null;
}): Promise<void> {
  const to = (opts.previousEmail ?? "").trim();
  if (!to || !to.includes("@")) return;
  try {
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    await sendTemplateEmail("security-alert", to, {
      templateData: {
        changedWhat: opts.changed,
        changedAt: new Date().toLocaleDateString(opts.language === "es" ? "es-US" : "en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        supportEmail: "support@sucasa.com",
        language: opts.language === "es" ? "es" : "en",
      },
    });
  } catch {
    // Notification is advisory; the change itself is already verified.
  }
}
