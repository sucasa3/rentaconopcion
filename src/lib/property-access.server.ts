/**
 * The only sanctioned reader for raw provider property records.
 *
 * AUTHORIZATION RULE (do not weaken):
 *   A raw property record is never released because a signed-in person's
 *   profile *says* they live at that address. An address string is user
 *   editable, so it can never act as proof of entitlement. Direct client
 *   access to `property_intel` is denied by policy (admin only); every
 *   product read goes through server code that has already authorized the
 *   caller against a server-controlled record — the homeowner's own
 *   `home_profiles` / `profiles` row, or organization membership plus consent
 *   for a `lender_portfolio_clients` row.
 *
 * Callers therefore pass the *keys* they are entitled to read, not a database
 * client: this helper always uses the service-role client, so there is no way
 * for a user-scoped client (or a spoofed address) to widen the result set.
 */

const CHUNK = 200;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Rows whose `address_normalized` is one of `keys`. */
export async function readPropertyIntelByNormalized(
  columns: string,
  keys: string[],
): Promise<any[]> {
  const db = await admin();
  const out: any[] = [];
  for (let i = 0; i < keys.length; i += CHUNK) {
    const { data } = await db
      .from("property_intel")
      .select(columns)
      .in("address_normalized", keys.slice(i, i + CHUNK));
    for (const row of data ?? []) out.push(row);
  }
  return out;
}

/** Rows whose `address_line1` is one of `keys` (records imported without a city). */
export async function readPropertyIntelByLine1(columns: string, keys: string[]): Promise<any[]> {
  const db = await admin();
  const out: any[] = [];
  for (let i = 0; i < keys.length; i += CHUNK) {
    const { data } = await db
      .from("property_intel")
      .select(columns)
      .in("address_line1", keys.slice(i, i + CHUNK));
    for (const row of data ?? []) out.push(row);
  }
  return out;
}
