import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Database,
  Handshake,
  Lightbulb,
  Loader2,
  LockKeyhole,
  MessageCircle,
  Network,
  ShieldCheck,
  Target,
  TrendingUp,
  UserRoundCheck,
  XCircle,
} from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getAgentAttribution } from "@/lib/agent-funnel";
import { recordPublicAgentEvent } from "@/lib/agent-funnel.functions";


export const Route = createFileRoute("/lenders/")({
  head: () => ({
    meta: [
      { title: "SuCasa for Lenders — Activate the Agents You Already Have" },
      {
        name: "description",
        content:
          "SuCasa helps your agent partners find meaningful reasons to reconnect with the homeowners they already know — so financing conversations start earlier, with the agent keeping the relationship.",
      },
      { property: "og:title", content: "SuCasa for Lenders — Activate the Agents You Already Have" },
      {
        property: "og:description",
        content:
          "Signals, context, and reasons to have a conversation. Not lead lists, not predictions, not anyone's database.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "index,follow" },
    ],
    links: [{ rel: "canonical", href: "https://sucasa.com/lenders" }],
  }),
  component: LendersLandingPage,
});

type PublicAction =
  | "lender_pilot_clicked"
  | "lender_deck_viewed"
  | "lender_pricing_clicked"
  | "lender_signin_clicked"
  | "lender_discovery_cta_clicked";

function LendersLandingPage() {
  const record = useServerFn(recordPublicAgentEvent);
  const track = (action: PublicAction) => {
    void record({ data: { action, ...getAgentAttribution() } });
  };
  useEffect(() => {
    void record({ data: { action: "lender_landing_view", ...getAgentAttribution() } });
  }, [record]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="relative border-b border-border bg-surface">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 pb-10 pt-10 md:grid-cols-[minmax(0,1fr)_minmax(360px,0.78fr)] md:items-center md:pb-16 md:pt-16">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-status-opportunity">SuCasa for mortgage lenders</p>
              <h1 className="mt-3 max-w-3xl text-[2.45rem] font-semibold leading-[1.04] sm:text-5xl lg:text-6xl">
                Your past-client database already has opportunities inside it.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Upload up to 100 past clients. SuCasa reads the public property record for each home
                and shows you which of those relationships is worth a call today — and the reason
                why. Free, no card, no contract.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button
                  asChild
                  size="lg"
                  className="min-h-12 bg-sucasa-orange text-sucasa-orange-foreground hover:bg-sucasa-orange/90"
                >
                  <Link
                    to="/lender-start"
                    search={{ source: "lenders_hero" }}
                    onClick={() => track("lender_discovery_cta_clicked")}
                  >
                    Discover opportunities in my database <ArrowRight />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="min-h-12">
                  <Link to="/lenders/deck" onClick={() => track("lender_deck_viewed")}>
                    See how SuCasa works
                  </Link>
                </Button>
              </div>

              <p className="mt-3 text-sm text-muted-foreground">
                No homeowner is contacted, and uploading a list creates no access to anyone.
              </p>
              <Link
                to="/auth"
                onClick={() => track("lender_signin_clicked")}
                className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
              >
                Already a loan officer on SuCasa? Sign in <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <LoanOfficerPreview />
          </div>
        </section>

        {/* How Discovery works */}
        <section className="border-b border-border bg-background py-14 sm:py-20">
          <div className="mx-auto max-w-6xl px-5">
            <SectionIntro
              eyebrow="How it works"
              title="Three steps, about ten minutes."
              copy="Nothing to install, nobody to call, and no homeowner hears from us."
            />
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                [
                  "1. Sign in with your email",
                  "One link to your inbox. No password, no company forms, no billing.",
                ],
                [
                  "2. Upload up to 100 past clients",
                  "A CSV or Excel export from your CRM. Rows without a usable address, and repeats of the same property, don't count against your 100.",
                ],
                [
                  "3. See who's worth a call",
                  "A count of the opportunities we found, why each one exists, and your top five unlocked in full.",
                ],
              ].map(([t, d]) => (
                <div key={t} className="rounded-2xl border border-border bg-card p-5">
                  <p className="text-sm font-semibold text-foreground">{t}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{d}</p>
                </div>
              ))}
            </div>
            <Button
              asChild
              size="lg"
              className="mt-8 min-h-12 bg-sucasa-orange text-sucasa-orange-foreground hover:bg-sucasa-orange/90"
            >
              <Link
                to="/lender-start"
                search={{ source: "lenders_how_it_works" }}
                onClick={() => track("lender_discovery_cta_clicked")}
              >
                Discover opportunities in my database <ArrowRight />
              </Link>
            </Button>
          </div>
        </section>

        {/* The problem */}
        <section className="border-b border-border bg-background py-14 sm:py-20">
          <div className="mx-auto max-w-6xl px-5">
            <SectionIntro
              eyebrow="The problem"
              title="Databases full of homeowners. No idea which ones matter today."
              copy="Agents don't have a contact problem. They have a prioritization problem — so budget goes to buying new leads instead of activating the relationships they already earned."
            />
            <div className="mt-9 grid gap-5 md:grid-cols-2">
              <Comparison
                title="A typical agent book"
                icon={<Database />}
                items={[
                  "Hundreds to thousands of past clients",
                  "Names, numbers, and a closing date",
                  "Nothing says when circumstances change",
                  "Nothing says who is worth a call this week",
                ]}
              />
              <Comparison
                accent
                title="The same book on SuCasa"
                icon={<Target />}
                items={[
                  "A short, prioritized list of conversations worth considering",
                  "The reason attached to each one",
                  "Home and equity context assembled once per address",
                  "A suggested opening and a next step",
                ]}
              />
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              SuCasa surfaces signals and reasons to reconnect. It does not predict who will sell,
              refinance, move, or transact, and it does not sell lead lists.
            </p>
          </div>
        </section>

        {/* The SuCasa flow */}
        <section className="bg-sucasa-navy py-14 text-primary-foreground sm:py-20">
          <div className="mx-auto max-w-6xl px-5">
            <p className="text-sm font-semibold text-sucasa-orange">The SuCasa flow</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-semibold sm:text-4xl">
              From an agent's existing database to a financing conversation.
            </h2>
            <ol className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["01", "Agent database", "Homeowners the agent already earned — no new lead buy."],
                ["02", "Home intelligence", "Property, valuation, equity, and home context assembled once per address."],
                ["03", "Signals", "Relevant homeowner circumstances are surfaced, with the reason attached."],
                ["04", "The agent reaches out", "A reason to reconnect and words to use, not a manufactured check-in."],
                ["05", "A conversation happens", "Sometimes a financing need is part of it."],
                ["06", "Your loan officer joins", "When financing is relevant and the homeowner's permissions allow it."],
              ].map(([n, title, copy]) => (
                <li key={n} className="rounded-lg border border-primary-foreground/20 bg-primary-foreground/10 p-5">
                  <span className="text-xs font-semibold text-primary-foreground/60">{n}</span>
                  <h3 className="mt-5 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-primary-foreground/70">{copy}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Focus, not volume */}
        <section className="border-b border-border bg-background py-14 sm:py-20">
          <div className="mx-auto max-w-6xl px-5">
            <SectionIntro
              eyebrow="Focus, not volume"
              title="The value isn't more contacts. It's knowing where to focus."
              copy="An agent with a thousand homeowners doesn't need a longer list. They need the short list, with the reason attached."
            />
            <div className="mt-9 grid gap-4 sm:grid-cols-2">
              <article className="rounded-lg border border-border bg-card p-6">
                <p className="text-sm font-semibold text-muted-foreground">Without SuCasa</p>
                <p className="mt-3 text-5xl font-semibold sm:text-6xl">1,000</p>
                <p className="mt-3 text-sm text-muted-foreground">names sitting quietly in a CRM</p>
              </article>
              <article className="rounded-lg border border-surface-intelligence-border bg-surface-intelligence p-6">
                <p className="text-sm font-semibold text-surface-intelligence-foreground">With SuCasa</p>
                <p className="mt-3 text-5xl font-semibold sm:text-6xl">37</p>
                <p className="mt-3 text-sm text-muted-foreground">
                  homeowners worth a conversation right now, each with the reason attached
                </p>
              </article>
            </div>
            <p className="mt-5 text-xs text-muted-foreground">
              Illustrative example only. 37 is not a guaranteed or projected result.
            </p>
          </div>
        </section>

        {/* What a loan officer actually receives */}
        <section className="bg-surface py-14 sm:py-20">
          <div className="mx-auto max-w-6xl px-5">
            <SectionIntro
              eyebrow="What a loan officer actually receives"
              title="A prioritized book, not a lead feed."
              copy="Your loan officers see the homeowners they legitimately have visibility into, with the context that makes a conversation useful."
            />
            <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { Icon: TrendingUp, title: "Equity and value context", copy: "Estimated value and equity position assembled from property intelligence, where available." },
                { Icon: Cpu, title: "Mortgage-age context", copy: "How long a loan has been in place, where the record supports it." },
                { Icon: Lightbulb, title: "Reasons to reconnect", copy: "Annual review moments, home changes, and other circumstances worth a conversation." },
                { Icon: MessageCircle, title: "Suggested language", copy: "A starting point for the conversation the agent or officer is about to have." },
                { Icon: Handshake, title: "Co-branded outreach", copy: "Campaigns the agent approves before anything sends." },
                { Icon: Network, title: "Measurable throughput", copy: "Signal to conversation to referral to application to funded loan." },
              ].map(({ Icon, title, copy }) => (
                <article key={title} className="rounded-lg border border-border bg-card p-5">
                  <Icon className="h-6 w-6 text-intelligence-accent" />
                  <h3 className="mt-5 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy}</p>
                </article>
              ))}
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              SuCasa complements your existing systems. It is not a CRM, a lead marketplace, or an
              LOS replacement.
            </p>
          </div>
        </section>

        {/* Agent + lender flywheel */}
        <section className="border-y border-border bg-background py-14 sm:py-20">
          <div className="mx-auto max-w-6xl px-5">
            <SectionIntro
              eyebrow="Agent + lender flywheel"
              title="It strengthens the agent relationship that produces the business."
              copy="Every cycle makes the agent partnership more valuable — because you're the partner who made their database worth something."
            />
            <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Lender supports agents", "You bring SuCasa to the agents your officers already know."],
                ["Agents activate databases", "Past clients become living home records."],
                ["SuCasa surfaces signals", "Who deserves attention now, and why."],
                ["Better conversations", "The agent calls with a reason."],
                ["Needs surface naturally", "Move, renovate, refinance, buy again."],
                ["Referrals reach your officer", "When financing is relevant and permitted."],
                ["The homeowner gets helped", "A funded loan, a closed transaction."],
                ["The agent keeps choosing you", "The partnership gets stickier each cycle."],
              ].map(([title, copy], i) => (
                <article key={title} className="rounded-lg border border-border bg-card p-5">
                  <span className="text-xs font-semibold text-status-opportunity">{i + 1}</span>
                  <h3 className="mt-4 text-sm font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Trust, privacy, and permissions */}
        <section className="bg-surface py-14 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-9 px-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <SectionIntro
              eyebrow="Trust, privacy, and permissions"
              title="One home. Multiple private relationships. Homeowner-controlled sharing."
              copy="This is the part we will not bend to make a workflow easier. Participating in SuCasa does not hand anyone another party's customers."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  Icon: UserRoundCheck,
                  title: "The relationship stays with the agent",
                  copy: "SuCasa never takes ownership of an agent's homeowner relationships.",
                },
                {
                  Icon: LockKeyhole,
                  title: "No automatic access to a database",
                  copy: "A lender does not receive an agent's homeowners because the agent joined SuCasa, or because your officer partners with that agent.",
                },
                {
                  Icon: ShieldCheck,
                  title: "The homeowner is the authority",
                  copy: "Homeowner-level information reaches a lender only where the applicable homeowner permission exists. Uploading someone is not consent.",
                },
                {
                  Icon: Database,
                  title: "Shared home facts are not shared customers",
                  copy: "Property intelligence about a home is independent of any professional's private client records, notes, and activity, which stay inside their own workspace.",
                },
              ].map(({ Icon, title, copy }) => (
                <article key={title} className="rounded-lg border border-border bg-card p-5">
                  <Icon className="h-6 w-6 text-status-positive" />
                  <h3 className="mt-5 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Is / Is not */}
        <section className="border-y border-border bg-background py-14 sm:py-20">
          <div className="mx-auto max-w-6xl px-5">
            <SectionIntro
              eyebrow="Setting the frame"
              title="What SuCasa is — and is not."
              copy="Better to know before the first call than after the pilot."
            />
            <div className="mt-9 grid gap-5 md:grid-cols-2">
              <article className="rounded-lg border border-border bg-card p-5 sm:p-6">
                <h3 className="text-lg font-semibold text-status-positive">SuCasa is</h3>
                <ul className="mt-5 space-y-3">
                  {[
                    "The intelligence layer between an agent's database and the next conversation",
                    "A database activation tool for the agents you already work with",
                    "A way to surface financing conversations with a reason attached",
                    "A lender distribution and retention tool",
                    "Measurable, from signal to funded loan",
                  ].map((t) => (
                    <li key={t} className="flex gap-3 text-sm text-muted-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-status-positive" />
                      {t}
                    </li>
                  ))}
                </ul>
              </article>
              <article className="rounded-lg border border-border bg-card p-5 sm:p-6">
                <h3 className="text-lg font-semibold text-muted-foreground">SuCasa is not</h3>
                <ul className="mt-5 space-y-3">
                  {[
                    "Another CRM, lead provider, or marketing platform",
                    "An LOS replacement",
                    "A system that takes ownership of agent relationships",
                    "A way to receive an agent's database or their homeowners",
                    "A promise that every signal becomes a loan",
                    "A prediction of who will sell, refinance, or move",
                  ].map((t) => (
                    <li key={t} className="flex gap-3 text-sm text-muted-foreground">
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      {t}
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
        </section>

        {/* Pilot CTA */}
        <section className="bg-sucasa-navy py-14 text-center text-primary-foreground sm:py-20">
          <div className="mx-auto max-w-3xl px-5">
            <p className="text-sm font-semibold text-sucasa-orange">The 90-day pilot</p>
            <h2 className="mt-3 text-3xl font-semibold sm:text-5xl">Let's prove the economics together.</h2>
            <p className="mx-auto mt-4 max-w-xl text-primary-foreground/70">
              A defined group of loan officers and their agent partners, existing databases, real
              signals, tracked referrals, measured funded loans.
            </p>
            <div className="mx-auto mt-7 grid max-w-2xl gap-3 text-left sm:grid-cols-3">
              {[
                ["Activate", "A controlled group of officers and agents."],
                ["Engage", "Agents get reasons and prompts to reconnect."],
                ["Measure", "Opportunities, referrals, applications, funded loans, ROI."],
              ].map(([t, d]) => (
                <div key={t} className="rounded-lg border border-primary-foreground/20 bg-primary-foreground/10 p-4">
                  <p className="text-sm font-semibold">{t}</p>
                  <p className="mt-2 text-sm text-primary-foreground/70">{d}</p>
                </div>
              ))}
            </div>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="min-h-12 bg-sucasa-orange text-sucasa-orange-foreground hover:bg-sucasa-orange/90"
              >
                <Link
                  to="/lender-start"
                  search={{ source: "lenders_pilot" }}
                  onClick={() => track("lender_discovery_cta_clicked")}
                >
                  Discover opportunities in my database <ArrowRight />
                </Link>
              </Button>
              <PilotRequestDialog onOpen={() => track("lender_pilot_clicked")}>
                <Button size="lg" variant="outline" className="min-h-12 bg-transparent">
                  Talk to us about a team pilot
                </Button>
              </PilotRequestDialog>
            </div>


            <div className="mt-5 flex flex-wrap justify-center gap-5 text-sm">
              <Link
                to="/lenders/deck"
                onClick={() => track("lender_deck_viewed")}
                className="font-semibold underline underline-offset-4"
              >
                View presentation
              </Link>
              <Link
                to="/pricing"
                onClick={() => track("lender_pricing_clicked")}
                className="font-semibold underline underline-offset-4"
              >
                Lender plans
              </Link>
              <Link
                to="/auth"
                onClick={() => track("lender_signin_clicked")}
                className="font-semibold underline underline-offset-4"
              >
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function SectionIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <div className="max-w-3xl">
      <p className="text-sm font-semibold text-status-opportunity">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">{title}</h2>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground">{copy}</p>
    </div>
  );
}

function Comparison({
  title,
  icon,
  items,
  accent = false,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
  accent?: boolean;
}) {
  return (
    <article
      className={`rounded-lg border bg-card p-5 sm:p-6 ${accent ? "border-surface-intelligence-border" : "border-border"}`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${accent ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
        >
          {icon}
        </span>
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      <ul className="mt-5 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm text-muted-foreground">
            <Check
              className={`mt-0.5 h-4 w-4 shrink-0 ${accent ? "text-status-positive" : "text-muted-foreground"}`}
            />
            {item}
          </li>
        ))}
      </ul>
    </article>
  );
}

/** Fictional loan-officer book card. Every value here is invented for illustration. */
function LoanOfficerPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[430px] md:mx-0 md:justify-self-end">
      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted-foreground">
        <span>LOAN OFFICER BOOK</span>
        <span className="rounded-full bg-secondary px-2 py-1">ILLUSTRATIVE DEMO</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-elevated">
        <div className="border-b border-border bg-primary px-5 py-4 text-primary-foreground">
          <p className="text-xs text-primary-foreground/70">Good morning, Maria</p>
          <p className="mt-1 text-xl font-semibold">Worth a conversation today</p>
        </div>
        <div className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-status-opportunity">ANNUAL REVIEW MOMENT</p>
              <h2 className="mt-1 truncate text-xl font-semibold">Riley Ortega</h2>
              <p className="mt-1 text-xs text-muted-foreground">Fictional homeowner · demo record</p>
            </div>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              RO
            </span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Est. value</p>
              <p className="mt-1 text-sm font-semibold">$486,000</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Est. equity</p>
              <p className="mt-1 text-sm font-semibold">$179,000</p>
            </div>
          </div>
          <div className="mt-4 border-l-2 border-sucasa-orange pl-3">
            <p className="text-xs font-semibold text-muted-foreground">WHY NOW</p>
            <p className="mt-1 text-sm leading-relaxed">
              The loan has been in place about six years and the home's estimated equity position has
              moved — a reasonable moment for a review conversation.
            </p>
          </div>
          <div className="mt-4 rounded-md bg-surface-intelligence p-3">
            <p className="text-xs font-semibold text-surface-intelligence-foreground">
              WHAT YOU COULD SAY
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              “It's been a few years — want to walk through where your home and your loan stand
              today?”
            </p>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Shown only where the homeowner's permissions allow it. All figures fictional.
          </p>
        </div>
      </div>
    </div>
  );
}

function PilotRequestDialog({
  children,
  onOpen,
}: {
  children: ReactNode;
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [loanOfficers, setLoanOfficers] = useState("");
  const [markets, setMarkets] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const attribution = getAgentAttribution();
    try {
      const response = await fetch("/api/public/lenders/pilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          company: company.trim(),
          loanOfficers: loanOfficers.trim() || undefined,
          markets: markets.trim() || undefined,
          message: message.trim() || undefined,
          visitId: attribution.visitId,
        }),
      });
      if (!response.ok) throw new Error("Request failed");
      setDone(true);
    } catch {
      setError("We couldn't send your request. Please try again or email us directly at info@sucasa.com.");
    } finally {
      setBusy(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) onOpen?.();
    if (!nextOpen && done) {
      setDone(false);
      setName("");
      setEmail("");
      setCompany("");
      setLoanOfficers("");
      setMarkets("");
      setMessage("");
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Talk to us about a pilot</DialogTitle>
          <DialogDescription>
            Tell us a little about your team. We will reply within one business day.
          </DialogDescription>
        </DialogHeader>
        {done ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-status-positive" />
            <p className="mt-4 font-semibold">Request sent</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Our team will reach out to schedule your demo.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="pilot-name">Full name</Label>
              <Input
                id="pilot-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jordan Lee"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pilot-email">Work email</Label>
              <Input
                id="pilot-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jordan@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pilot-company">Lender / company</Label>
              <Input
                id="pilot-company"
                required
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Example Mortgage"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pilot-officers">Loan officers</Label>
                <Input
                  id="pilot-officers"
                  value={loanOfficers}
                  onChange={(e) => setLoanOfficers(e.target.value)}
                  placeholder="e.g. 12"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pilot-markets">Markets</Label>
                <Input
                  id="pilot-markets"
                  value={markets}
                  onChange={(e) => setMarkets(e.target.value)}
                  placeholder="e.g. Dallas-Fort Worth"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pilot-message">What are you hoping to solve? (optional)</Label>
              <Textarea
                id="pilot-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="We want our loan officers to stay top-of-mind with the agent partners who already refer business..."
                rows={4}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              type="submit"
              className="w-full bg-sucasa-orange text-sucasa-orange-foreground hover:bg-sucasa-orange/90"
              disabled={busy}
            >
              {busy ? <Loader2 className="animate-spin" /> : "Send pilot request"}
              {!busy && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              You can also email us directly at{" "}
              <a href="mailto:info@sucasa.com" className="text-primary underline">
                info@sucasa.com
              </a>
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

