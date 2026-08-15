import type { ReactNode } from "react";
import {
  ArrowRight,
  ArrowDown,
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

/** Horizontal chain of steps with arrows between them. */
function FlowRow({
  steps,
  tone = "light",
}: {
  steps: string[];
  tone?: "light" | "dark" | "brand";
}) {
  const skin =
    tone === "light"
      ? "border-border/70 bg-card/90 shadow-soft"
      : "border-white/15 bg-white/10 backdrop-blur";
  const arrow = tone === "light" ? "text-primary" : "text-white/70";
  return (
    <div className="flex items-stretch justify-between gap-3">
      {steps.map((s, i) => (
        <div key={s} className="flex flex-1 items-center gap-3">
          <div
            className={`grid min-h-[140px] w-full place-items-center rounded-[28px] border px-4 text-center ${skin}`}
          >
            <span className="slide-body font-semibold">{s}</span>
          </div>
          {i < steps.length - 1 && <ArrowRight className={`h-8 w-8 shrink-0 ${arrow}`} />}
        </div>
      ))}
    </div>
  );
}

/** Vertical chain used where the story reads top-to-bottom. */
function FlowColumn({
  steps,
  tone = "light",
}: {
  steps: { t: string; d?: string }[];
  tone?: "light" | "dark" | "brand";
}) {
  const skin =
    tone === "light"
      ? "border-border/70 bg-card/90 shadow-soft"
      : "border-white/15 bg-white/10 backdrop-blur";
  const arrow = tone === "light" ? "text-primary" : "text-white/70";
  const muted = tone === "light" ? "text-muted-foreground" : "text-white/70";
  return (
    <div className="flex flex-col items-center">
      {steps.map((s, i) => (
        <div key={s.t} className="flex w-full flex-col items-center">
          <div className={`w-full rounded-[26px] border px-8 py-5 text-center ${skin}`}>
            <span className="slide-body font-semibold">{s.t}</span>
            {s.d && <span className={`slide-caption ml-3 ${muted}`}>{s.d}</span>}
          </div>
          {i < steps.length - 1 && <ArrowDown className={`my-2 h-7 w-7 ${arrow}`} />}
        </div>
      ))}
    </div>
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
          Your agents already have the customers. SuCasa helps them identify who to call — and why.
        </h1>
        <p className="slide-body-lg mt-10 max-w-[1250px] text-white/80">
          Turn existing agent databases into qualified homeowner conversations and mortgage
          opportunities — without taking the relationship away from the agent.
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
        lead="Agents don't have a contact problem. They have a prioritization problem."
      >
        <div className="grid grid-cols-[1fr_auto] items-center gap-14">
          <div className="grid grid-cols-3 gap-8">
            <DeckCard>
              <p className="slide-subtitle font-semibold">Stored</p>
              <p className="slide-body mt-4 text-muted-foreground">
                Names, numbers and closing dates sitting quietly in a CRM.
              </p>
            </DeckCard>
            <DeckCard>
              <p className="slide-subtitle font-semibold">Silent</p>
              <p className="slide-body mt-4 text-muted-foreground">
                Nothing says when equity builds, circumstances change, or a home starts aging.
              </p>
            </DeckCard>
            <DeckCard>
              <p className="slide-subtitle font-semibold">Spent elsewhere</p>
              <p className="slide-body mt-4 text-muted-foreground">
                So budget goes to buying new leads instead of activating existing ones.
              </p>
            </DeckCard>
          </div>
          <DeckCard className="w-[430px] text-center">
            <p className="slide-kicker text-primary">Typical agent book</p>
            <p className="mt-4 text-[92px] font-semibold leading-none">500–10,000</p>
            <p className="slide-body mt-5 text-muted-foreground">
              homeowners they already know — and no way to tell which have a reason to talk today.
            </p>
          </DeckCard>
        </div>
      </SlideLayout>
    ),
  },
  {
    id: "why-lenders",
    title: "The opportunity for lenders",
    render: () => (
      <SlideLayout
        tone="dark"
        kicker="Why this matters to you"
        title="The opportunity for lenders."
        lead="Your loan officers don't need more random leads. They need more opportunities from the agents they already know."
      >
        <FlowColumn
          tone="dark"
          steps={[
            { t: "Agent database", d: "homeowners the agent already earned" },
            { t: "SuCasa identifies homeowner signals" },
            { t: "Agent receives a reason to engage" },
            { t: "Conversation happens" },
            { t: "A financing need emerges" },
            { t: "Your loan officer gets the opportunity" },
          ]}
        />
      </SlideLayout>
    ),
  },
  {
    id: "thesis",
    title: "What SuCasa does",
    render: () => (
      <SlideLayout
        kicker="What we do"
        title="We turn a static contact database into a living opportunity map."
        lead="Data becomes intelligence. Intelligence becomes an action the agent can take this week."
      >
        <div className="grid grid-cols-3 gap-8">
          {[
            {
              icon: <Database className="h-12 w-12" />,
              t: "Data",
              d: "Property, equity and ownership context assembled once per address — plus financing context where available.",
            },
            {
              icon: <Cpu className="h-12 w-12" />,
              t: "Intelligence",
              d: "A signal engine that reads every record and surfaces the homeowners whose circumstances changed.",
            },
            {
              icon: <Network className="h-12 w-12" />,
              t: "Action",
              d: "Each signal is routed to the right party: the agent to talk, the lender to finance, a pro to service.",
            },
          ].map((c) => (
            <DeckCard key={c.t}>
              <div className="text-primary">{c.icon}</div>
              <p className="slide-subtitle mt-7 font-semibold">{c.t}</p>
              <p className="slide-body mt-4 text-muted-foreground">{c.d}</p>
            </DeckCard>
          ))}
        </div>
        <p className="slide-body-lg mt-12 text-muted-foreground">
          Not another database. The intelligence layer between the agent's database and the next
          homeowner conversation.
        </p>
      </SlideLayout>
    ),
  },
  {
    id: "focus",
    title: "37 out of 1,000",
    render: () => (
      <SlideLayout
        tone="brand"
        kicker="Illustrative example"
        title="An agent has 1,000 homeowners. Which ones matter this week?"
      >
        <div className="grid grid-cols-2 items-center gap-16">
          <DeckCard tone="brand" className="text-center">
            <p className="slide-kicker text-white/70">Without SuCasa</p>
            <p className="mt-6 text-[130px] font-semibold leading-none">1,000</p>
            <p className="slide-body-lg mt-6 text-white/80">names sitting in a CRM</p>
          </DeckCard>
          <DeckCard tone="brand" className="text-center">
            <p className="slide-kicker text-white/70">With SuCasa</p>
            <p className="mt-6 text-[130px] font-semibold leading-none">37</p>
            <p className="slide-body-lg mt-6 text-white/80">
              homeowners worth a conversation right now — each with the reason attached
            </p>
          </DeckCard>
        </div>
        <p className="slide-body-lg mt-12 text-white/80">
          The value isn't giving the agent more contacts. It's telling the agent where to focus.
          <span className="slide-caption ml-3 text-white/60">
            37 is illustrative, not a guaranteed result.
          </span>
        </p>
      </SlideLayout>
    ),
  },
  {
    id: "signal",
    title: "What a signal is",
    render: () => (
      <SlideLayout
        kicker="The core mechanic"
        title="A signal isn't data. It's a reason to have a conversation."
        lead="Illustrative example — SuCasa surfaces circumstances, it does not predict intent."
      >
        <div className="grid grid-cols-3 gap-8">
          <DeckCard>
            <p className="slide-kicker text-primary">Signal</p>
            <p className="slide-body-lg mt-5 font-semibold">
              Significant equity and property circumstances that may indicate a potential move.
            </p>
          </DeckCard>
          <DeckCard>
            <p className="slide-kicker text-primary">Agent prompt</p>
            <p className="slide-body-lg mt-5 font-semibold">
              “Reach out to check whether their housing plans have changed.”
            </p>
          </DeckCard>
          <DeckCard>
            <p className="slide-kicker text-primary">Potential outcome</p>
            <p className="slide-body-lg mt-5 font-semibold">
              Move → new purchase → financing need → lender opportunity.
            </p>
          </DeckCard>
        </div>
        <p className="slide-body-lg mt-12 text-muted-foreground">
          Every card an agent sees names the homeowner, the change, and the next step — so the call
          gets made.
        </p>
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
          <AppFrame label="Live product — agent dashboard" scale={0.8} height={600}>
            <AgentWeekScreen />
          </AppFrame>
          <div className="space-y-8">
            <Bullets
              items={[
                "Every card names the homeowner, the signal, and the next step",
                "Financing signals surface your loan officer automatically",
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
    title: "Signals into mortgage opportunities",
    render: () => (
      <SlideLayout
        kicker="Your side of the product"
        title="Turn homeowner signals into mortgage opportunities."
        lead="When a homeowner's circumstances create a potential financing conversation, the agent has a reason to engage — and your loan officer can become part of that conversation."
      >
        <div className="grid grid-cols-[1fr_auto] items-center gap-16">
          <div className="space-y-8">
            <Bullets
              items={[
                "Agent books imported by CSV or CRM export, enriched automatically",
                "Opportunities ranked by strength and confidence, with the reason attached",
                "Co-branded outreach the agent approves before anything sends",
                "Complements your existing systems — SuCasa is not an LOS or a lead marketplace",
              ]}
            />
          </div>
          <AppFrame label="Live product — MLO book" scale={0.8} height={600}>
            <LenderBookScreen />
          </AppFrame>
        </div>
      </SlideLayout>
    ),
  },
  {
    id: "record",
    title: "Home Record",
    render: () => (
      <SlideLayout
        kicker="What powers it"
        title="One property, one Home Record."
        lead="Homeowner, agent and lender all read the same record — so the same intelligence serves every side of the transaction."
      >
        <div className="grid grid-cols-[1fr_auto] items-center gap-16">
          <div className="space-y-6">
            <Bullets
              items={[
                "Property record, valuation, tax and permit history",
                "Equity position and financing context where available",
                "System ages, inspection findings and completed work",
                "What the homeowner actually does inside the app",
              ]}
            />
            <DeckCard className="mt-4">
              <p className="slide-body text-muted-foreground">
                Enrichment runs continuously in the background, so an uploaded agent book fills in
                on its own — no work for the loan officer.
              </p>
            </DeckCard>
          </div>
          <AppFrame label="Homeowner app — the same record, their view" scale={0.8} height={600}>
            <HomeRecordScreen />
          </AppFrame>
        </div>
      </SlideLayout>
    ),
  },
  {
    id: "flywheel",
    title: "The Agent + Lender Flywheel",
    render: () => (
      <SlideLayout
        tone="dark"
        kicker="How it compounds"
        title="The Agent + Lender Flywheel."
        lead="SuCasa doesn't just generate opportunities — it strengthens the agent-lender relationship that produces them."
      >
        <div className="grid grid-cols-4 gap-6">
          {[
            ["Lender supports agents", "You bring SuCasa to the agents your LOs already work with."],
            ["Agents activate databases", "Past clients become live Home Records."],
            ["SuCasa finds opportunities", "Signals identify who deserves attention now."],
            ["Better conversations", "Agents call with a reason, not a check-in."],
            ["Needs get uncovered", "Move, renovate, refinance, buy again."],
            ["Referrals reach the lender", "Your LO is introduced when financing is relevant."],
            ["Lender helps the homeowner", "A funded loan and a closed transaction."],
            ["Agent keeps choosing you", "The relationship gets stickier every cycle."],
          ].map(([t, d], i) => (
            <DeckCard key={t} tone="dark">
              <p className="slide-kicker text-white/60">{i + 1}</p>
              <p className="slide-body-lg mt-4 font-semibold">{t}</p>
              <p className="slide-caption mt-3 text-white/70">{d}</p>
            </DeckCard>
          ))}
        </div>
      </SlideLayout>
    ),
  },
  {
    id: "loop",
    title: "Invite → Close the loop",
    render: () => (
      <SlideLayout
        kicker="How the system runs"
        title="Invite → Enrich → Signal → Prompt → Connect → Close the loop."
      >
        <div className="grid grid-cols-3 gap-8">
          {[
            ["Invite", "Agents bring the homeowner relationships they already own."],
            ["Enrich", "SuCasa adds property and home intelligence automatically."],
            ["Signal", "Relevant homeowner circumstances are identified."],
            ["Prompt", "The agent receives a reason to engage, with the words to use."],
            ["Connect", "Your loan officer joins the conversation when financing is relevant."],
            ["Close the loop", "Outcomes are tracked and measured — and sharpen the next signal."],
          ].map(([t, d], i) => (
            <NumberedPoint key={t} n={i + 1} title={t} body={d} />
          ))}
        </div>
      </SlideLayout>
    ),
  },
  {
    id: "value",
    title: "What your loan officers get",
    render: () => (
      <SlideLayout
        kicker="What you get"
        title="What SuCasa can give your loan officers."
      >
        <div className="grid grid-cols-3 gap-8">
          {[
            ["More agent engagement", "Agents finally have reasons to communicate with their database."],
            ["More homeowner conversations", "Focus on relevant homeowners instead of blindly calling everyone."],
            ["More financing conversations", "Signals surface situations where financing may become relevant."],
            ["More referral opportunities", "Your LO is introduced when a legitimate financing need emerges."],
            ["More measurable ROI", "Track agent database → opportunity → referral → application → funded loan."],
            ["A stickier agent relationship", "Designed to help your LOs be the partner who made the database valuable."],
          ].map(([t, d]) => (
            <DeckCard key={t}>
              <p className="slide-subtitle font-semibold">{t}</p>
              <p className="slide-body mt-4 text-muted-foreground">{d}</p>
            </DeckCard>
          ))}
        </div>
      </SlideLayout>
    ),
  },
  {
    id: "economics",
    title: "Illustrative economics",
    render: () => (
      <SlideLayout
        tone="dark"
        kicker="Illustrative example — not a projection"
        title="What happens if we create just a few additional opportunities?"
        lead="100 agents × 1,000 contacts each = 100,000 homeowners already inside your network's reach."
      >
        <FlowRow
          tone="dark"
          steps={[
            "100,000 homeowners",
            "Relevant signals",
            "Qualified conversations",
            "Mortgage opportunities",
            "Applications",
            "Funded loans",
          ]}
        />
        <p className="slide-body-lg mt-12 text-white/75">
          We're not inventing conversion rates. The point is simpler: even a small lift in
          opportunity creation across an agent network you already have could be economically
          meaningful — and it's testable.
        </p>
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
                "The intelligence layer between an agent's database and the next conversation",
                "A database activation tool for agents you already work with",
                "A way to surface mortgage opportunities with a reason attached",
                "A lender distribution and retention tool",
                "Measurable, from signal to funded loan",
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
                "Another CRM or another lead provider",
                "Another marketing platform or an LOS replacement",
                "A system that takes ownership of agent relationships",
                "A promise that every signal becomes a loan",
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
            ["“We already have a CRM.”", "The CRM stores relationships. SuCasa tells your agents which relationships deserve attention right now."],
            ["“Our LOs already have databases.”", "Exactly the point — we activate the databases you already have instead of buying another list."],
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
        kicker="A proof-of-economics experiment"
        title="Let's prove the economics together."
        lead="Don't take our word for it. Let's test whether SuCasa creates incremental mortgage opportunities from the agents you already work with."
      >
        <div className="grid grid-cols-3 gap-7">
          {[
            ["1 · Activate", "Select a controlled group of loan officers and their agent partners."],
            ["2 · Connect", "Import and activate the participating agent databases."],
            ["3 · Enrich", "Apply homeowner and property intelligence to every record."],
            ["4 · Identify", "Surface relevant signals and prioritized opportunities."],
            ["5 · Engage", "Give agents reasons and prompts to start conversations."],
            ["6 · Measure", "Opportunities, referrals, applications, funded loans, incremental production, ROI."],
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
      <SlideLayout
        kicker="What gets measured"
        title="Every step from agent database to funded loan."
      >
        <div className="grid grid-cols-3 gap-x-12 gap-y-6">
          {[
            "Agent adoption rate",
            "Homeowners activated",
            "Home Records enriched",
            "Opportunities identified",
            "Agent follow-up conversations",
            "Mortgage referrals",
            "Applications",
            "Funded loans",
            "Incremental production",
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
    id: "ask",
    title: "The ask",
    render: () => (
      <SlideLayout
        tone="brand"
        kicker="The ask"
        title="Let's prove one thing."
        lead="Can SuCasa help your agents create more qualified mortgage opportunities?"
        footer="SuCasa · Lender Partnership"
      >
        <div className="grid grid-cols-3 gap-7">
          {[
            "90 days",
            "A defined group of agents and loan officers",
            "Existing databases",
            "Measurable signals",
            "Tracked referrals",
            "Measured funded loans",
          ].map((t, i) => (
            <NumberedPoint key={t} n={i + 1} title={t} body="" tone="brand" />
          ))}
        </div>
        <p className="slide-body-lg mt-12 font-semibold text-white">
          If we can prove incremental funded business, we have a scalable partnership.
        </p>
      </SlideLayout>
    ),
  },
];
