import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { listMyPortfolios } from "@/lib/lender.functions";
import { listCampaigns, getOrgCampaignState, setCampaignActivation } from "@/lib/campaigns.functions";
import { Mail, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/lender/campaigns")({
  head: () => ({
    meta: [
      { title: "Homeowner Campaigns — SuCasa" },
      { name: "description", content: "Turn on branded homeowner campaigns for your client portfolios." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LenderCampaigns,
});

function LenderCampaigns() {
  const qc = useQueryClient();
  const portfoliosFn = useServerFn(listMyPortfolios);
  const campaignsFn = useServerFn(listCampaigns);
  const stateFn = useServerFn(getOrgCampaignState);
  const toggleFn = useServerFn(setCampaignActivation);

  const [orgId, setOrgId] = useState("");

  const { data: mine } = useQuery({ queryKey: ["lender-portfolios"], queryFn: () => portfoliosFn() });
  const { data: campaigns } = useQuery({ queryKey: ["campaigns"], queryFn: () => campaignsFn() });

  useEffect(() => {
    if (!orgId && mine?.orgs?.length) setOrgId(mine.orgs[0].id);
  }, [mine, orgId]);

  const { data: state } = useQuery({
    queryKey: ["org-campaign-state", orgId],
    queryFn: () => stateFn({ data: { orgId } }),
    enabled: !!orgId,
  });

  const toggle = useMutation({
    mutationFn: (v: { campaignId: string; active: boolean }) =>
      toggleFn({ data: { orgId, campaignId: v.campaignId, active: v.active } }),
    onSuccess: () => {
      toast.success("Campaign updated");
      qc.invalidateQueries({ queryKey: ["org-campaign-state", orgId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const activeMap = new Map((state?.activations ?? []).map((a) => [a.campaign_id, a.active]));

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 px-5 py-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <div>
            <Link to="/lender" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3 w-3" /> Back to portfolios
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Homeowner campaigns</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Personalized, data-driven messages sent to your clients under your brand.
            </p>
          </div>

          {(mine?.orgs?.length ?? 0) > 1 && (
            <select
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              className="rounded-full border border-border bg-background px-4 py-2 text-sm"
            >
              {mine?.orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}

          <div className="grid gap-3">
            {(campaigns ?? []).map((c) => {
              const on = !!activeMap.get(c.id);
              return (
                <div
                  key={c.id}
                  className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-border bg-card p-5 shadow-soft"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Mail className="h-4 w-4" />
                      </span>
                      <p className="text-sm font-semibold">{c.name}</p>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{c.description}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">{c.cadence}</p>
                  </div>
                  <button
                    onClick={() => toggle.mutate({ campaignId: c.id, active: !on })}
                    disabled={toggle.isPending || !orgId}
                    className={`rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50 ${
                      on ? "gradient-brand text-white" : "border border-border hover:bg-muted"
                    }`}
                  >
                    {on ? "On" : "Off"}
                  </button>
                </div>
              );
            })}
          </div>

          {!!state?.sends?.length && (
            <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
              <h2 className="text-base font-semibold">Recent messages</h2>
              <ul className="mt-4 space-y-1 text-xs">
                {state.sends.slice(0, 15).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2">
                    <span className="truncate">
                      {s.recipient_name ?? s.recipient_email} · {s.subject}
                    </span>
                    <span className={s.status === "sent" ? "text-growth" : "text-muted-foreground"}>{s.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
