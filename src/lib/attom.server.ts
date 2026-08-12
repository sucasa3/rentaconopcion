/**
 * ATTOM provider — server-only. Never imported from routes/components directly.
 * Callers go through the valuation abstraction (`valuation.server.ts`) so we can
 * swap providers per-field without touching UI.
 *
 * Cost controls baked in:
 *   - Per-endpoint TTL cache in `property_intel`.
 *   - Every call logged to `attom_call_log` (cache_hit + cost_cents).
 *   - Monthly budget tracked in `attom_monthly_budget`; soft cap forces
 *     cache-only mode at 80% of the tier so we can't blow the bill.
 */

const ATTOM_BASE = "https://api.gateway.attomdata.com/propertyapi/v1.0.0";
const TRIAL_COST_CENTS = 10; // $0.10/call at the $500 trial tier

export type AttomEndpoint =
  | "avm"
  | "detail"
  | "tax"
  | "sales"
  | "permits"
  | "neighborhood"
  | "risk"
  | "owner"
  | "mortgage";

// TTLs by class (per approved plan)
export const ATTOM_TTL_DAYS: Record<AttomEndpoint, number> = {
  avm: 30,
  detail: 365,
  tax: 365,
  sales: 180,
  permits: 90,
  neighborhood: 180,
  risk: 180,
  owner: 90,
  mortgage: 90,
};

const ENDPOINT_PATHS: Record<AttomEndpoint, string> = {
  avm: "/attomavm/detail",
  detail: "/property/detail",
  tax: "/assessment/detail",
  sales: "/saleshistory/detail",
  permits: "/property/buildingpermits",
  neighborhood: "/neighborhood/community",
  risk: "/property/detailwithschools",
  owner: "/property/detailowner",
  mortgage: "/property/detailmortgage",
};

export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Split a US address into ATTOM's address1/address2 params */
function splitAddress(address: string): { address1: string; address2: string } {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return { address1: parts[0], address2: parts.slice(1).join(", ") };
  }
  if (parts.length === 2) {
    return { address1: parts[0], address2: parts[1] };
  }
  return { address1: address, address2: "" };
}

/**
 * Low-level ATTOM fetcher. Do NOT call from UI code — go through
 * `getPropertyIntel` in valuation.server.ts which handles caching + budgeting.
 */
export async function attomFetch(
  endpoint: AttomEndpoint,
  address: string,
): Promise<{ ok: true; data: unknown; status: number } | { ok: false; error: string; status: number }> {
  const apiKey = process.env.ATTOM_API_KEY;
  if (!apiKey) return { ok: false, error: "ATTOM_API_KEY not configured", status: 500 };

  const { address1, address2 } = splitAddress(address);
  // Without a city/state (or ZIP) the provider rejects the request outright.
  // Fail locally so we don't burn a paid lookup on a request we know is invalid.
  if (!address2) {
    return {
      ok: false,
      error: "Incomplete address: city and state (or ZIP) are required",
      status: 422,
    };
  }
  const url = new URL(`${ATTOM_BASE}${ENDPOINT_PATHS[endpoint]}`);
  url.searchParams.set("address1", address1);
  url.searchParams.set("address2", address2);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { apikey: apiKey, accept: "application/json" },
    });
    const status = res.status;
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `ATTOM ${endpoint} ${status}: ${body.slice(0, 200)}`, status };
    }
    const data = await res.json();
    return { ok: true, data, status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), status: 0 };
  }
}

export function attomCostCents(_endpoint: AttomEndpoint): number {
  // Flat rate on the trial tier. When we move to $1,500/25k, we'll tier this.
  return TRIAL_COST_CENTS;
}
