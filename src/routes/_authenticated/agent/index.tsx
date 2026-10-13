import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BusinessShell } from "@/components/business-shell";
import { AgentToday } from "@/components/agent-today";
import { AgentContinuationCard } from "@/components/agent-continuation-card";
import { DailyReadPreference } from "@/components/daily-read-preference";

import { getBusinessOverview } from "@/lib/business.functions";
import { getMyAgentOnboarding } from "@/lib/agent-discovery.functions";
import { Link } from "@tanstack/react-router";
import { Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/agent/")({
  head: () => ({
    meta: [
      { title: "Today — SuCasa for agents" },
      {
        name: "description",
        content:
          "Who deserves your attention today, why now, and what to say — from your own book of homeowners.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AgentHome,
});

function AgentHome() {
  const overviewFn = useServerFn(getBusinessOverview);
  const { data } = useQuery({
    queryKey: ["business-overview", "agent"],
    queryFn: () => overviewFn({ data: { orgType: "agent" } }),
    staleTime: 60_000,
  });

  const orgId = (data as any)?.org?.id ?? (data as any)?.orgs?.[0]?.id ?? null;
  const t = useT();
  const onboardingFn = useServerFn(getMyAgentOnboarding);
  const { data: ob } = useQuery({
    queryKey: ["agent-onboarding"],
    queryFn: () => onboardingFn(),
    staleTime: 30_000,
  });
  const unclaimed = Boolean(ob?.needsClaim && ob.portfolioId);

  return (
    <BusinessShell kind="agent" bookId={data?.books?.[0]?.id ?? null} isManager={data?.isManager}>
      {unclaimed && ob?.portfolioId ? (
        <div className="px-4 pt-4 sm:px-5">
          <section className="rounded-3xl border border-primary/30 bg-surface-intelligence p-4 shadow-soft sm:p-5" aria-labelledby="unlock-free-100">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-status-positive">
              <Sparkles className="h-3.5 w-3.5" /> {t("adisc.welcome.eyebrow")}
            </p>
            <h2 id="unlock-free-100" className="mt-1 text-lg font-semibold">{t("adisc.banner.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("adisc.banner.body")}</p>
            <Button asChild className="mt-3 min-h-11 w-full sm:w-auto">
              <Link to="/agent/discovery/$id" params={{ id: ob.portfolioId }}>
                {t("adisc.banner.cta")} <ArrowRight />
              </Link>
            </Button>
          </section>
        </div>
      ) : orgId && ob ? (
        <div className="px-4 pt-4 sm:px-5">
          <AgentContinuationCard orgId={orgId} />
        </div>
      ) : null}
      <AgentToday />
      {orgId && (
        <div className="px-4 pb-6 sm:px-5">
          <DailyReadPreference orgId={orgId} audience="agent" />
        </div>
      )}
    </BusinessShell>
  );
}

