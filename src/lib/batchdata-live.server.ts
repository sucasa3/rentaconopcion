/**
 * Live BatchData lookup used by every production enrichment and refresh.
 * Uses the request shape validated in the controlled BatchData test runs.
 * Server-only: reads the API key.
 */
import { parseTestAddress } from "./batchdata-normalize";

const LOOKUP_URL = "https://api.batchdata.com/api/v1/property/lookup/all-attributes";

export type BatchdataLookupResult =
  | { ok: true; status: number; data: unknown }
  | { ok: false; status: number; error: string };

export async function batchdataLookup(address: string): Promise<BatchdataLookupResult> {
  const apiKey = process.env["BATCHDATA_API_KEY"];
  if (!apiKey) return { ok: false, status: 500, error: "BATCHDATA_API_KEY not configured" };
  const p = parseTestAddress(address);
  if (!p.address_line1 || (!p.city && !p.state && !p.zip)) {
    return { ok: false, status: 422, error: "Incomplete address: street plus city/state/ZIP required" };
  }
  const body = {
    requests: [{ address: { street: p.address_line1, city: p.city, state: p.state, zip: p.zip } }],
  };
  try {
    const res = await fetch(LOOKUP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, status: res.status, error: `BatchData ${res.status}: ${text.slice(0, 200)}` };
    try {
      return { ok: true, status: res.status, data: JSON.parse(text) };
    } catch {
      return { ok: false, status: 502, error: "BatchData returned non-JSON" };
    }
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}
