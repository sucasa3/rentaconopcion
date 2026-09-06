import { useEffect, useState } from "react";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BusinessShell } from "@/components/business-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getBusinessOverview } from "@/lib/business.functions";
import { listPlans, startCheckout, syncSubscription, getBillingState } from "@/lib/billing.functions";

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

function money(cents: number | null): string {
  if (cents == null) return "Custom";
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
  const [busy, setBusy] = useState<string | null>(null);

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
        if (r.activated) toast.success("Payment received — your account is active.");
        qc.invalidateQueries({ queryKey: ["billing-state", orgId] });
      })
      .catch((e: Error) => toast.error(e.message));
  }, [search.checkout, orgId, syncFn, qc]);

  const buy = async (planKey: string) => {
    if (!orgId) return;
    setBusy(planKey);
    try {
      const { url } = await checkoutFn({
        data: { orgId, planKey, returnUrl: `${window.location.origin}/lender/billing` },
      });
      if (url) window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start checkout");
    } finally {
      setBusy(null);
    }
  };

  const status = (state as any)?.subscription_status ?? "none";
  const activeLabel: Record<string, string> = {
    active: "Active",
    trialing: "Trial",
    past_due: "Payment failed — retrying",
    canceled: "Cancelled",
    none: "No plan yet",
  };

  return (
    <BusinessShell kind="lender" bookId={null} isManager>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Plan &amp; billing</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Every plan includes the full SuCasa intelligence platform. Choose the plan based on the
            size of your homeowner database and agent network.
          </p>
          <p className="text-muted-foreground text-xs mt-1">
            90-day initial commitment. Month-to-month after that.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Current status</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant={status === "active" ? "default" : "secondary"}>
              {activeLabel[status] ?? status}
            </Badge>
            {(state as any)?.plan_key && <span>Plan: {(state as any).plan_key}</span>}
            <span>Home Profiles: {(state as any)?.profile_allowance ?? 0}</span>
            <span>Sponsored agents: {(state as any)?.sponsored_allocation ?? 0}</span>
            {(state as any)?.current_period_end && (
              <span className="text-muted-foreground">
                Renews {new Date((state as any).current_period_end).toLocaleDateString()}
              </span>
            )}
            <Button asChild size="sm" variant="outline" className="ml-auto">
              <a href="/lender/capacity">Manage capacity</a>
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
                <p className="text-2xl font-semibold">{money(p.price_cents)}</p>
                {p.positioning && (
                  <p className="text-muted-foreground text-sm">{p.positioning}</p>
                )}
              </CardHeader>
              <CardContent className="mt-auto space-y-3 text-sm">
                <ul className="text-muted-foreground space-y-1">
                  <li>{(p.profile_allowance ?? 0).toLocaleString()} Home Profiles</li>
                  <li>Up to {p.sponsored_allocation ?? 0} sponsored agents</li>
                </ul>
                <Button
                  className="w-full"
                  disabled={!p.purchasable || busy === p.key || !orgId}
                  onClick={() => buy(p.key)}
                >
                  {p.purchasable
                    ? busy === p.key
                      ? "Opening checkout…"
                      : "Choose this plan"
                    : "Contact us"}
                </Button>
                {!p.purchasable && (
                  <p className="text-muted-foreground text-xs">
                    This plan isn&apos;t set up for self-serve payment yet.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Need more room?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>+500 Home Profiles — $49/month</p>
            <p>+5 Sponsored Agents — $29/month</p>
            <p className="text-xs">
              Add-ons are coming to self-serve checkout. Ask us to add capacity in the meantime.
            </p>
          </CardContent>
        </Card>

        <p className="text-muted-foreground text-xs">
          Upgrades take effect immediately. Downgrades take effect at your next billing date, and
          we&apos;ll tell you exactly what to archive or reassign first if you&apos;re over the
          smaller plan&apos;s limits. Your homeowner records are never deleted.
        </p>
      </div>
    </BusinessShell>
  );
}

