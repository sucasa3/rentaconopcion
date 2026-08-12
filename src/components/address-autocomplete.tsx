import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { searchAddresses, type AddressSuggestion } from "@/lib/geocode.functions";
import { Check, Loader2, MapPin, Search } from "lucide-react";

export type AddressValue = {
  street: string;
  city: string;
  state: string;
  zip: string;
};

const inputCls =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

/** Small OpenStreetMap embed used to visually confirm the matched location. */
export function AddressMapPreview({
  lat,
  lon,
  label,
}: {
  lat: number;
  lon: number;
  label?: string;
}) {
  const d = 0.0032;
  const bbox = [lon - d, lat - d / 1.6, lon + d, lat + d / 1.6].join("%2C");
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <iframe
        title={label ? `Map of ${label}` : "Map of the selected address"}
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lon}`}
        className="h-44 w-full border-0"
        loading="lazy"
      />
    </div>
  );
}

/**
 * Street input with US address autocomplete + map verification. City / state /
 * ZIP stay editable — selecting a suggestion just fills them in for you.
 */
export function AddressAutocomplete({
  value,
  onChange,
  onVerifiedChange,
  autoFocus,
}: {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  onVerifiedChange?: (verified: AddressSuggestion | null) => void;
  autoFocus?: boolean;
}) {
  const lookup = useServerFn(searchAddresses);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState<AddressSuggestion | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced lookup on the full line the user has typed so far.
  useEffect(() => {
    const q = [value.street, value.city, [value.state, value.zip].filter(Boolean).join(" ")]
      .filter((p) => p && p.trim())
      .join(", ")
      .trim();
    if (verified && verified.street === value.street) return;
    if (q.replace(/\s/g, "").length < 6) {
      setSuggestions([]);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await lookup({ data: { query: q } });
        if (!alive) return;
        setSuggestions(res.suggestions);
        setError(res.error ?? (res.suggestions.length === 0 ? "No match found — check the address or enter it manually." : null));
        setOpen(true);
      } catch {
        if (alive) setError("Address lookup is unavailable right now.");
      } finally {
        if (alive) setLoading(false);
      }
    }, 500);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [value.street, value.city, value.state, value.zip, verified, lookup]);

  // Close the dropdown on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function setVerifiedAddress(s: AddressSuggestion | null) {
    setVerified(s);
    onVerifiedChange?.(s);
  }

  function pick(s: AddressSuggestion) {
    onChange({ street: s.street, city: s.city, state: s.state, zip: s.zip });
    setVerifiedAddress(s);
    setOpen(false);
    setSuggestions([]);
    setError(null);
  }

  return (
    <div className="space-y-2">
      <div ref={boxRef} className="relative">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className={`${inputCls} pl-9 pr-9`}
            placeholder="Start typing your street address"
            autoComplete="street-address"
            autoFocus={autoFocus}
            value={value.street}
            onChange={(e) => {
              setVerifiedAddress(null);
              onChange({ ...value, street: e.target.value });
            }}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
          {!loading && verified && (
            <Check className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-growth" />
          )}
        </div>

        {open && suggestions.length > 0 && (
          <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
            {suggestions.map((s) => (
              <li key={s.label}>
                <button
                  type="button"
                  onClick={() => pick(s)}
                  className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-secondary"
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0">{s.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-[1fr_4.5rem_6.5rem] gap-2">
        <input
          className={inputCls}
          placeholder="City"
          autoComplete="address-level2"
          value={value.city}
          onChange={(e) => {
            setVerifiedAddress(null);
            onChange({ ...value, city: e.target.value });
          }}
        />
        <input
          className={inputCls}
          placeholder="ST"
          maxLength={2}
          autoComplete="address-level1"
          value={value.state}
          onChange={(e) => {
            setVerifiedAddress(null);
            onChange({ ...value, state: e.target.value.toUpperCase() });
          }}
        />
        <input
          className={inputCls}
          placeholder="ZIP"
          inputMode="numeric"
          maxLength={10}
          autoComplete="postal-code"
          value={value.zip}
          onChange={(e) => {
            setVerifiedAddress(null);
            onChange({ ...value, zip: e.target.value });
          }}
        />
      </div>

      {verified ? (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-growth">
            <Check className="h-3.5 w-3.5" /> Address verified — {verified.label}
          </p>
          {verified.lat != null && verified.lon != null && (
            <AddressMapPreview lat={verified.lat} lon={verified.lon} label={verified.label} />
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {error ?? "Pick a suggestion to verify your home on the map. City and state (or ZIP) are required to match property records."}
        </p>
      )}
    </div>
  );
}
