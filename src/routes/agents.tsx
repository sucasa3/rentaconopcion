import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight, Check, ChevronRight, Database, Home, Lightbulb, LockKeyhole,
  MessageCircle, ShieldCheck, Sparkles, TrendingUp, UserRoundCheck, Wrench,
} from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { getAgentAttribution } from "@/lib/agent-funnel.client";
import { recordPublicAgentEvent } from "@/lib/agent-funnel.functions";

export const Route = createFileRoute("/agents")({
  head: () => ({
    meta: [
      { title: "SuCasa for Agents — Your Database, Prioritized" },
      { name: "description", content: "Know which homeowner relationships deserve attention, why now, what to say, and what to do next. Start with 100 Home Profiles free." },
      { property: "og:title", content: "SuCasa for Agents — Your Database, Prioritized" },
      { property: "og:description", content: "Turn your existing homeowner database into a prioritized relationship engine." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "index,follow" },
    ],
    links: [{ rel: "canonical", href: "https://sucasa.com/agents" }],
  }),
  component: AgentsLandingPage,
});

type PublicAction = "agent_start_clicked" | "agent_deck_viewed" | "agent_pricing_clicked" | "agent_signin_clicked";

function AgentsLandingPage() {
  const record = useServerFn(recordPublicAgentEvent);
  const track = (action: PublicAction) => {
    void record({ data: { action, ...getAgentAttribution() } });
  };
  useEffect(() => {
    void record({ data: { action: "agent_landing_view", ...getAgentAttribution() } });
  }, [record]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <SiteHeader />
      <main>
        <section className="relative border-b border-border bg-surface">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 pb-10 pt-10 md:grid-cols-[minmax(0,1fr)_minmax(360px,0.78fr)] md:items-center md:pb-16 md:pt-16">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-status-opportunity">SuCasa for real-estate agents</p>
              <h1 className="mt-3 max-w-3xl text-[2.45rem] font-semibold leading-[1.04] sm:text-5xl lg:text-6xl">
                You already have the relationships. Let’s make them worth more.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                SuCasa helps you know who deserves attention, why now, what you could say, and what to do next—using the homeowner relationships already in your database.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button asChild size="lg" className="min-h-12 bg-sucasa-orange text-sucasa-orange-foreground hover:bg-sucasa-orange/90">
                  <Link to="/agent-start" search={{ source: "agents-hero" }} onClick={() => track("agent_start_clicked")}>Get 100 Home Profiles Free <ArrowRight /></Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="min-h-12">
                  <Link to="/agents/deck" onClick={() => track("agent_deck_viewed")}>View presentation</Link>
                </Button>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">No credit card required. Create your agent account and start with up to 100 Home Profiles.</p>
              <Link to="/agent-start" search={{ source: "agents-signin" }} onClick={() => track("agent_signin_clicked")} className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary">Already have an account? Sign in <ChevronRight className="h-4 w-4" /></Link>
            </div>
            <AgentTodayPreview />
          </div>
        </section>

        <section className="border-b border-border bg-background py-14 sm:py-20">
          <div className="mx-auto max-w-6xl px-5">
            <SectionIntro eyebrow="From storage to action" title="A database is storage. SuCasa makes it a relationship engine." copy="Instead of treating every contact the same, SuCasa organizes useful changes and context into a calm list of conversations worth considering." />
            <div className="mt-9 grid gap-5 md:grid-cols-2">
              <Comparison title="The old way" icon={<Database />} items={["Hundreds or thousands of names", "No clear priority", "No timely reason to reconnect", "Another list waiting to be worked"]} />
              <Comparison accent title="With SuCasa" icon={<Sparkles />} items={["A prioritized work list", "Relevant homeowner changes", "Supporting context", "A suggested conversation and next action"]} />
            </div>
            <p className="mt-6 text-sm text-muted-foreground">SuCasa surfaces signals and reasons to reconnect. It does not predict homeowner intent or guarantee a transaction.</p>
          </div>
        </section>

        <section className="bg-sucasa-navy py-14 text-primary-foreground sm:py-20">
          <div className="mx-auto max-w-6xl px-5">
            <p className="text-sm font-semibold text-sucasa-orange">One recommendation. Four useful answers.</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-semibold sm:text-4xl">Know why the conversation matters before you reach out.</h2>
            <div className="mt-9 grid gap-4 lg:grid-cols-4">
              {[
                ["01", "Who deserves attention?", "Jordan Lee", UserRoundCheck],
                ["02", "Why now?", "A recent permit and updated home facts create a useful reason to reconnect.", Lightbulb],
                ["03", "What could I say?", "Ask how the project is going and offer a fresh home-value conversation.", MessageCircle],
                ["04", "What should I do next?", "Review the supporting facts, then call or draft a personal note.", ArrowRight],
              ].map(([n, title, copy, Icon]) => (
                <article key={String(n)} className="rounded-lg border border-primary-foreground/20 bg-primary-foreground/10 p-5">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4"><span className="text-xs font-semibold text-primary-foreground/60">{n}</span><Icon className="h-5 w-5 shrink-0 text-sucasa-orange" /></div>
                  <h3 className="mt-7 font-semibold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-primary-foreground/70">{copy}</p>
                </article>
              ))}
            </div>
            <p className="mt-5 text-xs text-primary-foreground/60">Illustrative demo only. Jordan Lee and all displayed details are fictional.</p>
          </div>
        </section>

        <section className="border-b border-border bg-background py-14 sm:py-20">
          <div className="mx-auto max-w-6xl px-5">
            <SectionIntro eyebrow="Presence beats prospecting" title="Stay useful enough to become the first call." copy="Homeownership creates questions long before a transaction. SuCasa helps you stay relevant with practical context—not manufactured urgency." />
            <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              {[[Home,"Value"],[TrendingUp,"Equity"],[Wrench,"Maintenance"],[Sparkles,"Improvements"],[Lightbulb,"Financing needs"],[Home,"Property changes"],[ArrowRight,"Moves"],[UserRoundCheck,"Referrals"]].map(([Icon,label]) => (
                <div key={String(label)} className="rounded-lg border border-border bg-card p-4"><Icon className="h-5 w-5 text-intelligence-accent" /><p className="mt-4 text-sm font-semibold">{label}</p></div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-surface py-14 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-9 px-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <SectionIntro eyebrow="Built around trust" title="Your relationships remain yours." copy="SuCasa helps you coordinate around the home without quietly changing who can see homeowner information." />
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                [ShieldCheck,"You stay in control","The agent remains responsible for their professional relationships."],
                [UserRoundCheck,"Homeowners choose","Homeowners retain their own choices, permissions, and consent."],
                [LockKeyhole,"No automatic access","Creating or uploading a Home Profile does not give a lender, provider, sponsor, or other professional access."],
                [Database,"Your database is not sold","Professional visibility follows SuCasa’s existing relationship, role, permission, consent, and access rules."],
              ].map(([Icon,title,copy]) => (
                <article key={String(title)} className="rounded-lg border border-border bg-card p-5"><Icon className="h-6 w-6 text-status-positive" /><h3 className="mt-5 font-semibold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy}</p></article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-background py-14 sm:py-20">
          <div className="mx-auto max-w-6xl px-5">
            <SectionIntro eyebrow="How it starts" title="Enter your workspace first. Import when you’re ready." copy="SuCasa uses one reusable Home Record and the existing fact system to organize homeowner context and prioritize relationship activity." />
            <ol className="mt-9 grid gap-4 md:grid-cols-3">
              {[
                ["1","Create your agent account","Add your name and brokerage or team. No credit card."],
                ["2","Enter your workspace","See a clearly labeled onboarding state before adding any homeowners."],
                ["3","Bring your database","Import a CSV or add homeowners individually. SuCasa begins organizing Home Profiles and useful signals."],
              ].map(([n,title,copy]) => <li key={n} className="rounded-lg border border-border bg-card p-5"><span className="grid h-9 w-9 place-items-center rounded-full bg-primary font-semibold text-primary-foreground">{n}</span><h3 className="mt-5 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy}</p></li>)}
            </ol>
          </div>
        </section>

        <section className="bg-sucasa-navy py-14 text-center text-primary-foreground sm:py-20">
          <div className="mx-auto max-w-3xl px-5">
            <p className="text-sm font-semibold text-sucasa-orange">The SuCasa agent offer</p>
            <h2 className="mt-3 text-3xl font-semibold sm:text-5xl">Start with up to 100 Home Profiles free.</h2>
            <p className="mx-auto mt-4 max-w-xl text-primary-foreground/70">Turn the homeowner relationships you already earned into a focused weekly rhythm. No credit card required.</p>
            <Button asChild size="lg" className="mt-7 min-h-12 bg-sucasa-orange text-sucasa-orange-foreground hover:bg-sucasa-orange/90">
              <Link to="/agent-start" search={{ source: "agents-final" }} onClick={() => track("agent_start_clicked")}>Get 100 Home Profiles Free <ArrowRight /></Link>
            </Button>
            <div className="mt-5 flex flex-wrap justify-center gap-5 text-sm"><Link to="/pricing" onClick={() => track("agent_pricing_clicked")} className="font-semibold underline underline-offset-4">View additional capacity</Link><Link to="/agent-start" search={{ source: "agents-signin" }} onClick={() => track("agent_signin_clicked")} className="font-semibold underline underline-offset-4">Already have an account? Sign in</Link></div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function SectionIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <div className="max-w-3xl"><p className="text-sm font-semibold text-status-opportunity">{eyebrow}</p><h2 className="mt-2 text-3xl font-semibold sm:text-4xl">{title}</h2><p className="mt-4 text-base leading-relaxed text-muted-foreground">{copy}</p></div>;
}

function Comparison({ title, icon, items, accent = false }: { title: string; icon: React.ReactNode; items: string[]; accent?: boolean }) {
  return <article className={`rounded-lg border bg-card p-5 sm:p-6 ${accent ? "border-surface-intelligence-border" : "border-border"}`}><div className="flex items-center gap-3"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${accent ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{icon}</span><h3 className="text-lg font-semibold">{title}</h3></div><ul className="mt-5 space-y-3">{items.map((item) => <li key={item} className="flex gap-3 text-sm text-muted-foreground"><Check className={`mt-0.5 h-4 w-4 shrink-0 ${accent ? "text-status-positive" : "text-muted-foreground"}`} />{item}</li>)}</ul></article>;
}

function AgentTodayPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[430px] md:mx-0 md:justify-self-end">
      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted-foreground"><span>AGENT TODAY</span><span className="rounded-full bg-secondary px-2 py-1">ILLUSTRATIVE DEMO</span></div>
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-elevated">
        <div className="border-b border-border bg-primary px-5 py-4 text-primary-foreground"><p className="text-xs text-primary-foreground/70">Good morning, Alex</p><p className="mt-1 text-xl font-semibold">Your best move today</p></div>
        <div className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold text-status-opportunity">RELATIONSHIP MOMENT</p><h2 className="mt-1 truncate text-xl font-semibold">Jordan Lee</h2><p className="mt-1 text-xs text-muted-foreground">Fictional homeowner · demo record</p></div><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">JL</span></div>
          <div className="mt-5 border-l-2 border-sucasa-orange pl-3"><p className="text-xs font-semibold text-muted-foreground">WHY NOW</p><p className="mt-1 text-sm leading-relaxed">A recent permit and updated property facts create a useful reason to check in.</p></div>
          <div className="mt-4 rounded-md bg-surface-intelligence p-3"><p className="text-xs font-semibold text-surface-intelligence-foreground">WHAT YOU COULD SAY</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">“How is the project going? I can share a fresh look at your home’s current picture.”</p></div>
          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"><p className="min-w-0 text-sm font-semibold">Next: review the facts, then call</p><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sucasa-orange text-sucasa-orange-foreground"><ArrowRight className="h-4 w-4" /></span></div>
        </div>
      </div>
    </div>
  );
}
