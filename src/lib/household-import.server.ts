/**
 * Server executor for the multi-property importer. Inert until the reviewed
 * migration (docs/release-candidates/household-import-migration.sql) is applied
 * AND HOUSEHOLD_IMPORT_ENABLED is switched on. Turning the flag off is the
 * rollback: the legacy importer resumes and all staged evidence is preserved.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { addressKey } from "./agent-discovery";
import { planHouseholdImport, type ImportSourceRow } from "./household-import";

import { HOUSEHOLD_IMPORT_ENABLED } from "./household-import";
export { HOUSEHOLD_IMPORT_ENABLED };

type Parsed = ImportSourceRow & {
  loan_balance_cents?: number | null;
  interest_rate_bps?: number | null;
  note?: string | null;
};

async function remainingCapacity(portfolioId: string): Promise<number> {
  const { admin } = { admin: (await import("@/integrations/supabase/client.server")).supabaseAdmin };
  const { data: p } = await admin.from("lender_portfolios").select("lender_org_id").eq("id", portfolioId).maybeSingle();
  const orgId = (p as any)?.lender_org_id;
  if (!orgId) return 0;
  const { poolInputFor } = await import("./capacity.server");
  const { summarizePool } = await import("./profile-pool");
  const s = summarizePool(await poolInputFor(orgId));
  return Math.max(0, s.totalCapacity - s.lenderUsed - s.agentAllocated);
}

export async function runHouseholdImport(opts: {
  admin: SupabaseClient<any>;
  portfolioId: string;
  actorId: string;
  csv: string;
  rows: Parsed[];
  suppressedRowNumbers: Set<number>;
}) {
  const { admin, portfolioId } = opts;
  const [{ data: clients, error: cErr }, { data: contacts, error: kErr }, { data: links, error: lErr }] = await Promise.all([
    admin.from("lender_portfolio_clients").select("id, address_line1, city, state, zip").eq("portfolio_id", portfolioId),
    admin.from("book_contacts").select("id, full_name, email, phone").eq("book_id", portfolioId),
    admin.from("client_contact_links").select("contact_id, client_id").eq("book_id", portfolioId),
  ]);
  if (cErr || kErr || lErr) throw new Error("Could not read this book for import.");
  const byContact = new Map<string, string[]>();
  for (const l of links ?? []) byContact.set(l.contact_id, [...(byContact.get(l.contact_id) ?? []), l.client_id]);

  const capacity = await remainingCapacity(portfolioId);
  const plan = planHouseholdImport({
    rows: opts.rows,
    existingClients: clients ?? [],
    existingContacts: (contacts ?? []).map((c: any) => ({ id: c.id, name: c.full_name, email: c.email, phone: c.phone, clientIds: byContact.get(c.id) ?? [] })),
    suppressedRowNumbers: opts.suppressedRowNumbers,
    remainingCapacity: capacity,
  });
  const byNumber = new Map(opts.rows.map((r) => [r.rowNumber, r]));
  const payload = plan.rows.map((p) => {
    const r = byNumber.get(p.rowNumber)!;
    return {
      row_number: p.rowNumber,
      // Suppressed rows keep only non-identifying evidence.
      raw: p.outcome === "suppressed" ? { suppressed: true } : r,
      outcome: p.outcome,
      reason: p.reason,
      property_key: p.propertyKey,
      property_ref: p.propertyRef,
      contact_ref: p.contactRef,
      role: p.role,
      client: {
        client_name: r.full_name, client_email: r.email ?? null, client_phone: r.phone ?? null,
        address_line1: r.address, city: r.city ?? null, state: r.state ?? null, zip: r.zip ?? null,
        loan_amount_at_close_cents: r.loan_balance_cents ?? null,
        rate_at_close: r.interest_rate_bps != null ? Number((r.interest_rate_bps / 100).toFixed(3)) : null,
        notes: r.note ?? null,
      },
    };
  });
  const existingKeys = (clients ?? [])
    .filter((c: any) => c.address_line1?.trim())
    .map((c: any) => ({ property_key: addressKey({ address: c.address_line1, zip: c.zip, city: c.city, state: c.state }), client_id: c.id }));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(opts.csv));
  const sha = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const { data, error } = await (admin as any).rpc("import_household_batch", {
    p_book: portfolioId, p_actor: opts.actorId, p_file_sha256: sha,
    p_rows: payload, p_existing_keys: existingKeys, p_new_capacity: capacity,
  });
  if (error) throw new Error("Import could not be saved. Nothing was added.");
  return { ...(data as any), uniqueProperties: plan.uniqueProperties, uniqueContacts: plan.uniqueContacts };
}

/** Removes clients under an open intake hold from any automatic lookup path. */
export async function withoutHeldClients<T extends { id: string }>(admin: SupabaseClient<any>, rows: T[]): Promise<T[]> {
  if (!HOUSEHOLD_IMPORT_ENABLED || rows.length === 0) return rows;
  const { data, error } = await admin
    .from("enrichment_intake_holds").select("client_id").is("released_at", null)
    .in("client_id", rows.map((r) => r.id));
  if (error) throw new Error("Could not confirm import hold status.");
  const held = new Set((data ?? []).map((h: any) => h.client_id));
  return rows.filter((r) => !held.has(r.id));
}
