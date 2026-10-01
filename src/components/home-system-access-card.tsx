import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/lib/i18n";
import {
  getMyHomeSystemState,
  listHomeSystemAccess,
  setHomeSystemAccess,
} from "@/lib/home-maintenance.functions";
import { HomeSystemHistory } from "@/components/home-system-history";

/** Homeowner-only control: which agent team may view/update home systems. Default off. */
export function HomeSystemAccessCard() {
  const t = useT();
  const qc = useQueryClient();
  const listFn = useServerFn(listHomeSystemAccess);
  const setFn = useServerFn(setHomeSystemAccess);
  const stateFn = useServerFn(getMyHomeSystemState);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: options } = useQuery({
    queryKey: ["home-system-access"],
    queryFn: () => listFn(),
  });
  const { data: state } = useQuery({
    queryKey: ["home-system-state"],
    queryFn: () => stateFn(),
  });

  async function toggle(orgId: string, orgName: string, enabled: boolean) {
    setBusy(orgId);
    try {
      const res = await setFn({ data: { orgId, enabled } });
      if (!res.ok) throw new Error();
      qc.setQueryData(["home-system-access"], (prev: typeof options) =>
        prev?.map((o) => (o.orgId === orgId ? { ...o, enabled } : o)),
      );
      toast.success(t(enabled ? "hs.access.saved_on" : "hs.access.saved_off", { org: orgName }));
      await qc.invalidateQueries({ queryKey: ["home-system-access"] });
    } catch {
      toast.error(t("hs.save_failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" /> {t("hs.access.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("hs.access.desc")}</p>
        {options && options.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">{t("hs.access.none")}</p>
        )}
        <ul className="mt-3 space-y-3">
          {(options ?? []).map((o) => (
            <li key={o.orgId} className="flex items-start justify-between gap-3">
              <label htmlFor={`hsa-${o.orgId}`} className="min-w-0 text-sm">
                <span className="font-medium">{t("hs.access.toggle", { org: o.orgName })}</span>
                <span className="block text-xs text-muted-foreground">
                  {t("hs.access.members", { count: o.memberCount })}
                  {o.enabled && o.grantedAt
                    ? ` · ${t("hs.access.on_since", { date: new Date(o.grantedAt).toLocaleDateString() })}`
                    : ""}
                </span>
                {!o.connected && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {t("hs.access.needs_connection")}
                  </span>
                )}
              </label>
              <Switch
                id={`hsa-${o.orgId}`}
                checked={o.enabled && o.connected}
                disabled={busy === o.orgId || (!o.connected && !o.enabled)}
                onCheckedChange={(v) => toggle(o.orgId, o.orgName, v)}
                className="mt-1 shrink-0"
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h2 className="text-base font-semibold">{t("hs.history.title")}</h2>
        <div className="mt-2">
          <HomeSystemHistory items={state?.history ?? []} />
        </div>
      </section>
    </div>
  );
}
