/**
 * Address lookup + verification.
 *
 * Uses the free U.S. Census Bureau geocoder (no API key, US addresses only) so
 * we can confirm an address exists and capture clean city / state / ZIP parts
 * before spending a paid property-records lookup on it.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SearchInput = z.object({
  query: z.string().trim().min(4).max(200),
});

export type AddressSuggestion = {
  label: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lon: number | null;
};

type CensusMatch = {
  matchedAddress?: string;
  coordinates?: { x?: number; y?: number };
  addressComponents?: {
    fromAddress?: string;
    preQualifier?: string;
    preDirection?: string;
    preType?: string;
    streetName?: string;
    suffixType?: string;
    suffixDirection?: string;
    suffixQualifier?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
};

function streetFrom(m: CensusMatch): string {
  const c = m.addressComponents ?? {};
  const parts = [
    c.fromAddress,
    c.preQualifier,
    c.preDirection,
    c.preType,
    c.streetName,
    c.suffixType,
    c.suffixDirection,
    c.suffixQualifier,
  ].filter((p) => p && p.trim().length > 0);
  if (parts.length > 0) return parts.join(" ");
  return (m.matchedAddress ?? "").split(",")[0]?.trim() ?? "";
}

/** Verify/complete a typed address. Returns 0-5 candidate matches. */
export const searchAddresses = createServerFn({ method: "POST" })
  .inputValidator((input) => SearchInput.parse(input))
  .handler(async ({ data }): Promise<{ suggestions: AddressSuggestion[]; error: string | null }> => {
    const url = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
    url.searchParams.set("address", data.query);
    url.searchParams.set("benchmark", "Public_AR_Current");
    url.searchParams.set("format", "json");

    try {
      const res = await fetch(url.toString(), {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return { suggestions: [], error: "Address lookup is unavailable right now." };
      const body = (await res.json()) as { result?: { addressMatches?: CensusMatch[] } };
      const matches = body.result?.addressMatches ?? [];

      const suggestions = matches.slice(0, 5).map((m) => {
        const c = m.addressComponents ?? {};
        return {
          label: m.matchedAddress ?? "",
          street: streetFrom(m),
          city: c.city ?? "",
          state: (c.state ?? "").toUpperCase(),
          zip: c.zip ?? "",
          lat: typeof m.coordinates?.y === "number" ? m.coordinates.y : null,
          lon: typeof m.coordinates?.x === "number" ? m.coordinates.x : null,
        };
      });

      return { suggestions, error: null };
    } catch {
      return { suggestions: [], error: "Address lookup is unavailable right now." };
    }
  });
