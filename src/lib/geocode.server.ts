/**
 * Server-side address verification (free U.S. Census geocoder, no API key).
 *
 * Used as a pre-flight before any paid property-records lookup: an address the
 * geocoder can't resolve would only burn an allowance call, so we park it for
 * review instead.
 */

export type VerifiedAddress = {
  street: string;
  city: string;
  state: string;
  zip: string;
};

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\b(Nw|Ne|Sw|Se)\b/g, (c) => c.toUpperCase());
}

/** Resolve a free-text address into clean parts. `null` = no confident match. */
export async function verifyAddress(query: string): Promise<VerifiedAddress | null> {
  if (!query || query.trim().length < 6) return null;
  const url = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
  url.searchParams.set("address", query);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("format", "json");

  try {
    const res = await fetch(url.toString(), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      result?: {
        addressMatches?: Array<{
          matchedAddress?: string;
          addressComponents?: { city?: string; state?: string; zip?: string };
        }>;
      };
    };
    const m = body.result?.addressMatches?.[0];
    if (!m) return null;
    const c = m.addressComponents ?? {};
    const street = titleCase((m.matchedAddress ?? "").split(",")[0]?.trim() ?? "");
    if (!street) return null;
    return {
      street,
      city: titleCase(c.city ?? ""),
      state: (c.state ?? "").toUpperCase(),
      zip: c.zip ?? "",
    };
  } catch {
    return null;
  }
}
