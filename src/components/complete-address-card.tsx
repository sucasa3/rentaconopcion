import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { AddressAutocomplete, type AddressValue } from "@/components/address-autocomplete";
import { Button } from "@/components/ui/button";


/**
 * Shown when a profile has a street address but no city/state/ZIP — property
 * records can't be matched without them, so we ask for the missing pieces
 * instead of failing silently.
 */
export function CompleteAddressCard({
  compact = false,
  mode = "complete",
}: {
  compact?: boolean;
  mode?: "complete" | "edit";
}) {

  const queryClient = useQueryClient();
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(!compact);

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
      className={`rounded-2xl border border-surface-intelligence-border bg-surface-intelligence shadow-soft ${compact ? "p-3.5" : "p-6"}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-xl bg-card p-2 text-intelligence-accent shadow-soft">
          <MapPin className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-h-10 items-center gap-2">
            <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">
            {mode === "edit" ? "Verify your home address" : "Finish your address"}
          </h2>
              {compact && !expanded ? <p className="truncate text-xs text-muted-foreground">Connect value, equity and property records.</p> : null}
            </div>
            {compact ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-expanded={expanded}
                onClick={() => setExpanded((current) => !current)}
                className="min-h-11 shrink-0 px-2 text-action-primary"
              >
                {expanded ? "Close" : "Finish"}
                <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
              </Button>
            ) : null}
          </div>
          {expanded ? <>
          <p className={`${compact ? "text-xs leading-snug" : "text-sm"} mt-1 text-muted-foreground`}>
            {mode === "edit"
              ? "Search for your address and confirm it on the map so we match the right property records."
              : "We have your street, but we need the city and state (or ZIP) to match your home to property records for value, equity and property details."}
          </p>


          <div className={`${compact ? "mt-3" : "mt-4"} space-y-2`}>
            <AddressAutocomplete
              value={{ street, city, state, zip }}
              onChange={(v: AddressValue) => {
                setStreet(v.street);
                setCity(v.city);
                setState(v.state);
                setZip(v.zip);
              }}
            />

            <Button
              onClick={save}
              disabled={!valid || saving}
              className="min-h-11 rounded-xl bg-action-primary px-4 text-sm font-semibold text-action-primary-foreground shadow-soft"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save address
            </Button>
          </div>
          </> : null}
        </div>
      </div>
    </div>
  );
}
