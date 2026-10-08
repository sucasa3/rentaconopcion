import { useEffect, useState } from "react";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BusinessShell } from "@/components/business-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { getBusinessOverview } from "@/lib/business.functions";
import { listPlans, startCheckout, syncSubscription, getBillingState, activateComped } from "@/lib/billing.functions";

export const Route = createFileRoute("/_authenticated/lender/billing")({
  head: () => ({
    meta: [
      { title: "Plan & Billing — SuCasa" },
      {
        name: "description",
        content: "Choose your SuCasa plan, pay securely and activate your team instantly.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    checkout: typeof s['checkout'] === "string" ? (s['checkout'] as string) : undefined,
  }),
  component: BillingPage,
});

function money(cents: number | null, custom: string): string {
  if (cents == null) return custom;
  return `$${(cents / 100).toLocaleString()}`;
}

function BillingPage() {
  const search = useSearch({ from: "/_authenticated/lender/billing" });
  const qc = useQueryClient();
  const overviewFn = useServerFn(getBusinessOverview);
  const plansFn = useServerFn(listPlans);
  const stateFn = useServerFn(getBillingState);
  const checkoutFn = useServerFn(startCheckout);
  const syncFn = useServerFn(syncSubscription);
  const compFn = useServerFn(activateComped);
  const [busy, setBusy] = useState<string | null>(null);
  const t = useT();
  // The complimentary-activation shortcut is shown to platform admins only (the server also refuses others).
  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
      return Boolean(data);
    },
    staleTime: 300_000,
  });

  const { data: overview } = useQuery({
    queryKey: ["business-overview", "lender"],
    queryFn: () => overviewFn({ data: { orgType: "lender" } }),
    staleTime: 60_000,
  });
  const orgId = (overview as any)?.org?.id ?? (overview as any)?.orgs?.[0]?.id ?? null;

  const { data: plans } = useQuery({ queryKey: ["plans"], queryFn: () => plansFn({}) });
  const { data: state } = useQuery({
    queryKey: ["billing-state", orgId],
    queryFn: () => stateFn({ data: { orgId } }),
    enabled: Boolean(orgId),
  });

  // Coming back from a completed checkout: confirm with the payment provider
  // right away so the account activates without waiting for a callback.
  useEffect(() => {
    if (search.checkout !== "success" || !orgId) return;
    syncFn({ data: { orgId } })
      .then((r: any) => {
        if (r.activated) toast.success(t("bill.toast.paid"));
        qc.invalidateQueries({ queryKey: ["billing-state", orgId] });
      })
      .catch((e: Error) => toast.error(billErr(e, "bill.toast.sync_failed")));
  }, [search.checkout, orgId, syncFn, qc]);

  // Server messages are mapped to translated text; raw English never reaches the toast.
  const billErr = (e: unknown, fallback: string) => {
    const m = e instanceof Error ? e.message : "";
    if (m.includes("PLAN_NOT_AVAILABLE")) return t("bill.toast.plan_unavailable");
    if (m.startsWith("Forbidden")) return t("bill.toast.forbidden");
    if (m.includes("no payment price")) return t("bill.toast.no_price");
    return t(fallback as any);
  };

  const buy = async (planKey: string) => {
    if (!orgId) return;
    setBusy(planKey);
    try {
      const { url } = await checkoutFn({
        data: { orgId, planKey, returnUrl: `${window.location.origin}/lender/billing` },
      });
      if (url) window.location.href = url;
    } catch (e) {
      toast.error(billErr(e, "bill.toast.checkout_failed"));
    } finally {
      setBusy(null);
    }
  };

  // Platform admins only: activate this organization without payment, for
  // demo and internal accounts. Non-admins get a clear refusal.
  const comp = async (planKey: string) => {
    if (!orgId) return;
    setBusy(`comp:${planKey}`);
    try {
      await compFn({ data: { orgId, planKey } });
      toast.success(t("bill.toast.comped"));
      qc.invalidateQueries({ queryKey: ["billing-state", orgId] });
    } catch (e) {
      toast.error(billErr(e, "bill.toast.comp_failed"));
    } finally {
      setBusy(null);
    }
  };

  const status = (state as any)?.subscription_status ?? "none";
  const known = ["active", "trialing", "past_due", "canceled", "comped", "none"];
  const statusLabel = known.includes(status) ? t(`bill.st.${status}` as any) : status;
  const planKey = (state as any)?.plan_key as string | undefined;
  const planName = planKey
    ? ((state as any)?.plan_name ?? (plans ?? []).find((p: any) => p.key === planKey)?.name ?? planKey)
    : null;

  return (
    <BusinessShell kind="lender" bookId={null} isManager>
      <main className="px-4 py-6 sm:px-5 sm:py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("bill.title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t("bill.lede")}
          </p>
          <p className="text-muted-foreground text-xs mt-1">
            {t("bill.commit")}
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("bill.status")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant={status === "active" ? "default" : "secondary"}>
              {statusLabel}
            </Badge>
            {planName && <span>{t("bill.plan", { name: planName })}</span>}
            <span>{t("bill.profiles", { count: ((state as any)?.profile_allowance ?? 0).toLocaleString() })}</span>
            <span>{t("bill.sponsored", { count: (state as any)?.sponsored_allocation ?? 0 })}</span>
            {(state as any)?.current_period_end && (
              <span className="text-muted-foreground">
                {t("bill.renews", { date: new Date((state as any).current_period_end).toLocaleDateString() })}
              </span>
            )}
            <Button asChild size="sm" variant="outline" className="ml-auto">
              <a href="/lender/capacity">{t("bill.capacity")}</a>
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(plans ?? [])
            .filter((p: any) => p.audience !== "agent")
            .map((p: any) => (
            <Card key={p.key} className="flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{p.name}</CardTitle>
                <p className="text-2xl font-semibold">{money(p.price_cents, t("bill.custom"))}</p>
                {p.positioning && (
                  <p className="text-muted-foreground text-sm">{p.positioning}</p>
                )}
              </CardHeader>
              <CardContent className="mt-auto space-y-3 text-sm">
                <ul className="text-muted-foreground space-y-1">
                  <li>{t("pub.lpricing.profiles", { count: (p.profile_allowance ?? 0).toLocaleString() })}</li>
                  <li>
                    {p.team_enabled
                      ? t("plan.seats_team", { count: p.seat_limit ?? 0 })
                      : t("plan.seats_solo")}{" "}
                    · {t("pub.lpricing.collabs", { count: p.sponsored_allocation ?? 0 })}
                  </li>
                </ul>
                {p.team_enabled && (
                  <p className="text-xs text-muted-foreground">{t("plan.team_invite")}</p>
                )}
                <Button
                  className="w-full"
                  disabled={!p.purchasable || busy === p.key || !orgId}
                  onClick={() => buy(p.key)}
                >
                  {p.purchasable
                    ? busy === p.key
                      ? t("bill.opening")
                      : t("bill.choose")
                    : t("bill.contact")}
                </Button>
                {!p.purchasable && (
                  <p className="text-muted-foreground text-xs">
                    {t("bill.not_self_serve")}
                  </p>
                )}
                {p.purchasable && isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                    disabled={busy === `comp:${p.key}` || !orgId}
                    onClick={() => comp(p.key)}
                  >
                    {busy === `comp:${p.key}` ? t("bill.activating") : t("bill.comp")}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="text-muted-foreground text-xs">{t("plan.team_note")}</p>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("bill.more")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>{t("bill.addon_profiles")}</p>
            <p>{t("bill.addon_agents")}</p>
            <p className="text-xs">
              {t("bill.addon_note")}
            </p>
          </CardContent>
        </Card>

        <p className="text-muted-foreground text-xs">
          {t("bill.changes")}
        </p>
      </div>
      </main>
    </BusinessShell>
  );
}

