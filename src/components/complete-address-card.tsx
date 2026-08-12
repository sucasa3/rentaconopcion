import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";

const inputCls =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

/**
 * Shown when a profile has a street address but no city/state/ZIP — property
 * records can't be matched without them, so we ask for the missing pieces
 * instead of failing silently.
 */
export function CompleteAddressCard({ compact = false }: { compact?: boolean }) {
  const queryClient = useQueryClient();
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("address, city, state, zip")
        .eq("id", u.user.id)
        .maybeSingle();
      if (!alive || !p) return;
      setStreet((p.address ?? "").replace(/[.,\s]+$/, ""));
      setCity(p.city ?? "");
      setState(p.state ?? "");
      setZip(p.zip ?? "");
    })();
    return () => {
      alive = false;
    };
  }, []);

  const valid = street.trim().length > 2 && ((city.trim() && state.trim()) || zip.trim());

  async function save() {
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Please sign in again.");
      const { error } = await supabase
        .from("profiles")
        .update({
          address: street.trim(),
          city: city.trim() || null,
          state: state.trim().toUpperCase() || null,
          zip: zip.trim() || null,
        })
        .eq("id", u.user.id);
      if (error) throw new Error(error.message);
      toast.success("Address saved — pulling your property records");
      await queryClient.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={`rounded-3xl border border-border bg-card shadow-soft ${compact ? "p-4" : "p-6"}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-full bg-primary/10 p-2 text-primary">
          <MapPin className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Finish your address</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            We have your street, but we need the city and state (or ZIP) to match your home to
            property records for value, equity and property details.
          </p>

          <div className="mt-4 space-y-2">
            <AddressAutocomplete
              value={{ street, city, state, zip }}
              onChange={(v) => {
                setStreet(v.street);
                setCity(v.city);
                setState(v.state);
                setZip(v.zip);
              }}
            />

            <button
              onClick={save}
              disabled={!valid || saving}
              className="inline-flex items-center gap-2 rounded-full gradient-brand px-4 py-2.5 text-sm font-semibold text-white shadow-soft disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save address
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
