import type { ReactNode } from "react";
import {
  ArrowRight,
  Database,
  Cpu,
  Network,
  CheckCircle2,
  XCircle,
  Sparkles,
} from "lucide-react";
import { SlideLayout, DeckCard, NumberedPoint } from "@/components/deck/slide-layout";
import {
  AppFrame,
  AgentWeekScreen,
  LenderBookScreen,
  HomeRecordScreen,
} from "@/components/deck/product-frames";

export type Slide = { id: string; title: string; render: () => ReactNode };

function Bullets({ items, tone = "light" }: { items: string[]; tone?: "light" | "dark" }) {
  return (
    <ul className="space-y-5">
      {items.map((b) => (
        <li key={b} className="flex items-start gap-4">
          <Sparkles
            className={`mt-2 h-7 w-7 shrink-0 ${tone === "light" ? "text-primary" : "text-white/80"}`}
          />
          <span className="slide-body-lg">{b}</span>
        </li>
      ))}
    </ul>
  );
}

export const LENDER_SLIDES: Slide[] = [
  {
    id: "cover",
    title: "SuCasa for lenders",
    render: () => (
      <div className="slide-content gradient-brand flex flex-col justify-center px-[130px] text-white">
        <p className="slide-kicker font-semibold text-white/80">Lender partnership</p>
        <h1 className="slide-title-lg mt-8 max-w-[1500px] font-semibold">
          Your agents already have the customers. We tell them who to call.
        </h1>
        <p className="slide-body-lg mt-10 max-w-[1200px] text-white/80">
          SuCasa turns an agent&apos;s dormant homeowner database into a live stream of financing
          conversations — without taking the relationship away from the agent.
        </p>
        <div className="slide-footer mt-16 text-white/70">SuCasa · Lender Partnership</div>
      </div>
    ),
  },
  {
    id: "problem",
    title: "The problem",
    render: () => (
      <SlideLayout
        kicker="The problem"
        title="Databases full of homeowners. No idea which ones matter today."
        lead="Every agent partner you have is sitting on hundreds of past clients. The CRM stores them. Nothing tells anyone when a home becomes a mortgage conversation."
      >
        <div className="grid grid-cols-3 gap-8">
          <DeckCard>
            <p className="slide-subtitle font-semibold">Stored</p>
            <p className="slide-body mt-4 text-muted-foreground">
              Names, phone numbers and closing dates sitting in a CRM.
            </p>
          </DeckCard>
          <DeckCard>
            <p className="slide-subtitle font-semibold">Silent</p>
            <p className="slide-body mt-4 text-muted-foreground">
              No signal when rates move, equity builds, or the home starts aging.
            </p>
          </DeckCard>
          <DeckCard>
            <p className="slide-subtitle font-semibold">Spent elsewhere</p>
            <p className="slide-body mt-4 text-muted-foreground">
              So the budget goes to buying new leads instead of activating existing ones.
            </p>
          </DeckCard>
        </div>
      </SlideLayout>
    ),
  },
  {
    id: "thesis",
    title: "What SuCasa is",
    render: () => (
      <SlideLayout
        tone="dark"
        kicker="What we are"
        title="An intelligence layer around the physical home."
        lead="One reusable Home Record per property. One engine that reads it. One network that acts on it."
      >
        <div className="grid grid-cols-3 gap-8">
          {[
            { icon: <Database className="h-12 w-12" />, t: "Home Record", d: "Property, financial position, condition and homeowner behavior — stored once per address." },
            { icon: <Cpu className="h-12 w-12" />, t: "Intelligence", d: "A signal engine that reads every record and says what deserves attention this week." },
            { icon: <Network className="h-12 w-12" />, t: "Network", d: "Routes each signal to the right party: the agent, the lender, or a trusted pro." },
          ].map((c) => (
            <DeckCard key={c.t} tone="dark">
              <div className="text-white/80">{c.icon}</div>
              <p className="slide-subtitle mt-7 font-semibold">{c.t}</p>
              <p className="slide-body mt-4 text-white/75">{c.d}</p>
            </DeckCard>
          ))}
        </div>
      </SlideLayout>
    ),
  },
  {
    id: "record",
    title: "Home Record",
    render: () => (
      <SlideLayout
        kicker="Storage"
        title="One property, one Home Record."
        lead="Homeowner, agent and lender all read the same record. We never buy the same property data twice."
      >
        <div className="grid grid-cols-[1fr_auto] items-center gap-16">
          <div className="space-y-6">
            <Bullets
              items={[
                "Property record, valuation, tax and permit history",
                "Mortgage position, equity and cash-out headroom",
                "System ages, inspection findings and completed work",
                "What the homeowner actually does inside the app",
              ]}
            />
            <DeckCard className="mt-4">
              <p className="slide-body text-muted-foreground">
                Addresses are validated before we spend a data call, known misses are suppressed,
                and enrichment runs continuously in the background — so an uploaded book fills in on
                its own.
              </p>
            </DeckCard>
          </div>
          <AppFrame label="Homeowner app — the same record, their view" scale={0.86} height={640}>
            <HomeRecordScreen />
          </AppFrame>
        </div>
      </SlideLayout>
    ),
  },
  {
    id: "agent",
    title: "The agent experience",
    render: () => (
      <SlideLayout
        kicker="The agent experience"
        title="Maria gets a weekly assistant, not a database."
        lead="Three to five homeowners worth a conversation, each with the reason and the opening line."
      >
        <div className="grid grid-cols-[auto_1fr] items-center gap-16">
          <AppFrame label="Live product — agent dashboard" scale={0.86} height={640}>
            <AgentWeekScreen />
          </AppFrame>
          <div className="space-y-8">
            <Bullets
              items={[
                "Every card names the homeowner, the signal, and the next step",
                "Financing signals surface the lender partner automatically",
                "Condition signals route to trusted service pros",
                "The agent keeps the relationship — always",
              ]}
            />
          </div>
        </div>
      </SlideLayout>
    ),
  },
  {
    id: "lender",
    title: "The lender view",
    render: () => (
      <SlideLayout
        kicker="The lender view"
        title="Your LOs see financing signals as they appear."
        lead="Refinance reviews, equity and cash-out headroom, move-up activity — inside the books your agents opted in."
      >
        <div className="grid grid-cols-[1fr_auto] items-center gap-16">
          <div className="space-y-8">
            <Bullets
              items={[
                "Portfolio import by CSV or CRM export, enriched automatically",
                "Opportunities ranked by strength and confidence",
                "Co-branded campaigns that the agent approves before anything sends",
                "Never a lead marketplace — the agent's audience stays the agent's",
              ]}
            />
          </div>
          <AppFrame label="Live product — MLO book" scale={0.86} height={640}>
            <LenderBookScreen />
          </AppFrame>
        </div>
      </SlideLayout>
    ),
  },
  {
    id: "flywheel",
    title: "The flywheel",
    render: () => (
      <SlideLayout
        tone="dark"
        kicker="How it compounds"
        title="Invite → Enrich → Signal → Prompt → Close the loop."
      >
        <div className="grid grid-cols-5 gap-6">
          {[
            ["Invite", "Agent invites past clients to their Home Profile."],
            ["Enrich", "SuCasa builds the Home Record automatically."],
            ["Signal", "The engine flags what changed and why it matters."],
            ["Prompt", "The agent gets the conversation; the lender gets the financing."],
            ["Learn", "Outcomes write back and sharpen the next signal."],
          ].map(([t, d], i) => (
            <DeckCard key={t} tone="dark" className="relative">
              <p className="slide-kicker text-white/60">Step {i + 1}</p>
              <p className="slide-subtitle mt-5 font-semibold">{t}</p>
              <p className="slide-body mt-4 text-white/75">{d}</p>
            </DeckCard>
          ))}
        </div>
        <p className="slide-body-lg mt-12 text-white/75">
          Every cycle makes the record richer, the signals sharper, and the agent more dependent on
          the intelligence — not on any single campaign.
        </p>
      </SlideLayout>
    ),
  },
  {
    id: "value",
    title: "What the lender gets",
    render: () => (
      <SlideLayout
        kicker="What you get"
        title="Distribution, retention and a lower cost per funded loan."
      >
        <div className="grid grid-cols-2 gap-8">
          <NumberedPoint
            n="1"
            title="Activate agent databases you already have access to"
            body="No new relationships required. We work inside the ones your loan officers already earned."
          />
          <NumberedPoint
            n="2"
            title="Financing opportunities with a reason attached"
            body="Not a scored list. A named homeowner, a specific change, and a suggested conversation."
          />
          <NumberedPoint
            n="3"
            title="A reason for agents to keep choosing your LOs"
            body="SuCasa makes the agent's database more valuable, and your LO is the one who brought it."
          />
          <NumberedPoint
            n="4"
            title="Measurable economics"
            body="Cost per qualified opportunity and cost per funded loan, tracked from day one of the pilot."
          />
        </div>
      </SlideLayout>
    ),
  },
  {
    id: "isnot",
    title: "Is / is not",
    render: () => (
      <SlideLayout kicker="Setting the frame" title="What SuCasa is — and is not.">
        <div className="grid grid-cols-2 gap-10">
          <DeckCard>
            <p className="slide-subtitle font-semibold text-growth">SuCasa is</p>
            <ul className="mt-7 space-y-5">
              {[
                "An intelligence layer around the home",
                "A database activation tool",
                "A way to surface opportunities",
                "A lender distribution and retention tool",
                "A router connecting the right party to the right moment",
              ].map((t) => (
                <li key={t} className="flex items-start gap-4">
                  <CheckCircle2 className="mt-1 h-8 w-8 shrink-0 text-growth" />
                  <span className="slide-body">{t}</span>
                </li>
              ))}
            </ul>
          </DeckCard>
          <DeckCard>
            <p className="slide-subtitle font-semibold text-muted-foreground">SuCasa is not</p>
            <ul className="mt-7 space-y-5">
              {[
                "A replacement for the agent",
                "A system that takes ownership of agent relationships",
                "A promise that every signal becomes a loan",
                "Another lead marketplace",
                "A requirement that every opportunity goes to one lender",
              ].map((t) => (
                <li key={t} className="flex items-start gap-4">
                  <XCircle className="mt-1 h-8 w-8 shrink-0 text-muted-foreground" />
                  <span className="slide-body text-muted-foreground">{t}</span>
                </li>
              ))}
            </ul>
          </DeckCard>
        </div>
      </SlideLayout>
    ),
  },
  {
    id: "objections",
    title: "Objections",
    render: () => (
      <SlideLayout kicker="Expect these" title="Objections, answered.">
        <div className="grid grid-cols-2 gap-8">
          {[
            ["“We already have a CRM.”", "The CRM stores relationships. SuCasa adds home intelligence and tells you which relationships deserve attention right now."],
            ["“Our LOs already have databases.”", "That's exactly the point — we activate the database you already have instead of buying another one."],
            ["“Agents own these customers.”", "Correct, and that's a foundational rule of the product. We create lender value without owning the relationship."],
            ["“How do we know it generates loans?”", "You don't have to believe a projection. Run a measured 90-day pilot and let the data decide."],
          ].map(([q, a]) => (
            <DeckCard key={q}>
              <p className="slide-body-lg font-semibold">{q}</p>
              <p className="slide-body mt-4 text-muted-foreground">{a}</p>
            </DeckCard>
          ))}
        </div>
      </SlideLayout>
    ),
  },
  {
    id: "pilot",
    title: "The 90-day pilot",
    render: () => (
      <SlideLayout
        tone="dark"
        kicker="The proposal"
        title="A 90-day agent database activation pilot."
        lead="A controlled test, not a strategic commitment."
      >
        <div className="grid grid-cols-3 gap-7">
          {[
            ["Participants", "10–25 loan officers and their agent partners."],
            ["Database", "Each participant contributes a defined set of existing homeowner relationships."],
            ["Activation", "SuCasa enriches Home Records and identifies relevant signals."],
            ["Engagement", "Agents receive actionable opportunities and recommended follow-up."],
            ["Lender role", "Loan officers step in when a financing need emerges."],
            ["Measurement", "Activation, engagement, opportunities, applications, funded loans, economics."],
          ].map(([t, d]) => (
            <DeckCard key={t} tone="dark">
              <p className="slide-subtitle font-semibold">{t}</p>
              <p className="slide-body mt-4 text-white/75">{d}</p>
            </DeckCard>
          ))}
        </div>
      </SlideLayout>
    ),
  },
  {
    id: "metrics",
    title: "Success metrics",
    render: () => (
      <SlideLayout kicker="What gets measured" title="Pilot success metrics.">
        <div className="grid grid-cols-3 gap-x-12 gap-y-6">
          {[
            "Agent adoption rate",
            "Homeowners activated",
            "Home Records enriched",
            "Actionable opportunities identified",
            "Agent follow-up conversations",
            "Mortgage referrals",
            "Applications",
            "Funded loans",
            "Incremental contribution",
            "Cost per qualified opportunity",
            "Cost per funded loan",
            "Agent and LO retention",
          ].map((m) => (
            <div key={m} className="flex items-center gap-4 border-b border-border/60 pb-5">
              <CheckCircle2 className="h-8 w-8 shrink-0 text-primary" />
              <span className="slide-body-lg">{m}</span>
            </div>
          ))}
        </div>
      </SlideLayout>
    ),
  },
  {
    id: "vision",
    title: "Strategic vision",
    render: () => (
      <SlideLayout
        kicker="The long game"
        title="Home → Data → Intelligence → Opportunity → Partner → Action."
        lead="A persistent Home Record that understands the property, its financial position, the homeowner's intent, and the services that become relevant over time."
      >
        <div className="flex items-center justify-between gap-4">
          {["Home", "Data", "Intelligence", "Opportunity", "Partner", "Action"].map((s, i, arr) => (
            <div key={s} className="flex items-center gap-4">
              <div className="grid h-[150px] w-[210px] place-items-center rounded-[30px] border border-border/70 bg-card/90 px-4 text-center shadow-soft">
                <span className="slide-body-lg font-semibold">{s}</span>
              </div>
              {i < arr.length - 1 && <ArrowRight className="h-9 w-9 text-primary" />}
            </div>
          ))}
        </div>
        <p className="slide-body-lg mt-14 max-w-[1500px] text-muted-foreground">
          The lender provides distribution, agent relationships and financing expertise. SuCasa
          provides intelligence and routing. Agents keep their customers. Homeowners get something
          genuinely useful about their home.
        </p>
      </SlideLayout>
    ),
  },
  {
    id: "ask",
    title: "The ask",
    render: () => (
      <SlideLayout
        tone="brand"
        kicker="The ask"
        title="Pick a small group and let us prove the economics together."
        footer="SuCasa · Lender Partnership"
      >
        <div className="grid grid-cols-3 gap-7">
          {[
            "Select a pilot group of loan officers and agents",
            "Define the database size and eligibility rules",
            "Agree on the success metrics",
            "Establish the workflow for opportunities",
            "Run the pilot for about 90 days",
            "Review the economics and decide whether to scale",
          ].map((t, i) => (
            <NumberedPoint key={t} n={i + 1} title={t} body="" tone="brand" />
          ))}
        </div>
      </SlideLayout>
    ),
  },
];
