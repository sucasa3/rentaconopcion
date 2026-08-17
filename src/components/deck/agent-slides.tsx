import type { ReactNode } from "react";
import logoAsset from "@/assets/sucasa-logo.png.asset.json";
import type { Slide } from "@/components/deck/lender-slides";
import { AppFrame, AgentWeekScreen } from "@/components/deck/product-frames";
import {
  BigStat,
  ContactField,
  DarkSlide,
  Eyebrow,
  Glass,
  HomeownerCard,
  SignalChip,
} from "@/components/deck/agent-frames";

const ACCENT = "text-[oklch(0.82_0.14_165)]";

function Headline({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`slide-title deck-rise font-semibold tracking-tight ${className}`}>{children}</h2>
  );
}

function Cinematic({
  lines,
  after,
  note,
  page,
}: {
  lines: string[];
  after?: string[];
  note?: string;
  page?: string;
}) {
  return (
    <DarkSlide page={page}>
      <div className="flex h-full flex-col justify-center">
        <div>
          {lines.map((l, i) => (
            <p
              key={l}
              className="slide-title-lg deck-rise font-semibold tracking-tight"
              style={{ animationDelay: `${i * 140}ms` }}
            >
              {l}
            </p>
          ))}
        </div>
        {after && (
          <div className="mt-14">
            {after.map((l, i) => (
              <p
                key={l}
                className={`slide-title-lg deck-rise font-semibold tracking-tight ${ACCENT}`}
                style={{ animationDelay: `${700 + i * 140}ms` }}
              >
                {l}
              </p>
            ))}
          </div>
        )}
        {note && <p className="slide-body-lg deck-fade mt-14 max-w-[1150px] text-white/55">{note}</p>}
      </div>
    </DarkSlide>
  );
}

const HIGHLIGHT = [4, 9, 17, 23, 31, 38, 46, 52, 61, 68, 74, 83, 91, 97, 104, 112];

export const AGENT_SLIDES: Slide[] = [
  {
    id: "cover",
    title: "You already have the relationships",
    render: () => (
      <DarkSlide footer={null}>
        <div className="relative flex h-full flex-col justify-center">
          <div className="pointer-events-none absolute inset-x-0 top-[40px] opacity-30">
            <ContactField count={96} columns={16} activeIndexes={[3, 11, 27, 42, 58, 71, 88]} />
          </div>
          <div className="relative">
            <img src={logoAsset.url} alt="SuCasa" className="h-[52px] w-auto opacity-90" />
            <p className="slide-title-lg deck-rise mt-12 font-semibold tracking-tight">
              You already have
            </p>
            <p
              className="slide-title-lg deck-rise font-semibold tracking-tight"
              style={{ animationDelay: "140ms" }}
            >
              the relationships.
            </p>
            <p
              className={`slide-title-lg deck-rise mt-10 font-semibold tracking-tight ${ACCENT}`}
              style={{ animationDelay: "760ms" }}
            >
              Let's make them worth more.
            </p>
            <p className="slide-body-lg deck-fade mt-12 max-w-[1150px] text-white/55">
              SuCasa for agents · Database → intelligence → opportunity
            </p>
          </div>
        </div>
      </DarkSlide>
    ),
  },
  {
    id: "before-after",
    title: "Before and after",
    render: () => (
      <DarkSlide page="02">
        <Eyebrow>The shift</Eyebrow>
        <Headline className="mt-6">A database is storage. This is an engine.</Headline>
        <div className="mt-14 grid grid-cols-2 gap-10">
          <Glass className="p-10">
            <SignalChip tone="muted">Before</SignalChip>
            <p className="slide-subtitle mt-8 font-semibold">Thousands of names</p>
            <div className="slide-body mt-6 space-y-3 text-white/55">
              <p>Static. Silent. Forgotten.</p>
              <p>Everyone looks the same on the list.</p>
              <p>So you call no one — or you call everyone.</p>
            </div>
          </Glass>
          <Glass accent className="p-10">
            <SignalChip>After</SignalChip>
            <p className="slide-subtitle mt-8 font-semibold">An intelligent relationship engine</p>
            <div className="slide-body mt-6 space-y-3 text-white/72">
              <p>Who to call. Why to call.</p>
              <p>What to say. What to do next.</p>
              <p>How to stay relevant between transactions.</p>
            </div>
          </Glass>
        </div>
      </DarkSlide>
    ),
  },
  {
    id: "thousand",
    title: "1,000 homeowners → 37 conversations",
    render: () => (
      <DarkSlide page="03">
        <div className="grid h-full grid-cols-[1.15fr_0.85fr] items-center gap-16">
          <div>
            <Eyebrow>Illustrative example</Eyebrow>
            <p className="slide-title deck-rise mt-6 font-semibold tracking-tight">
              1,000 homeowners.
            </p>
            <p
              className={`slide-title deck-rise font-semibold tracking-tight ${ACCENT}`}
              style={{ animationDelay: "600ms" }}
            >
              37 priority conversations.
            </p>
            <p className="slide-body-lg deck-fade mt-10 max-w-[840px] text-white/60">
              Stop calling everyone. Start calling the right people.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <SignalChip>Equity</SignalChip>
              <SignalChip tone="blue">Property</SignalChip>
              <SignalChip tone="amber">Mortgage</SignalChip>
              <SignalChip tone="blue">Move</SignalChip>
              <SignalChip tone="amber">Investment</SignalChip>
              <SignalChip>Home improvement</SignalChip>
            </div>
            <p className="slide-caption mt-10 text-white/40">
              Illustrative example — not a guaranteed conversion rate.
            </p>
          </div>
          <div>
            <ContactField count={112} columns={8} activeIndexes={HIGHLIGHT} dimRest />
          </div>
        </div>
      </DarkSlide>
    ),
  },
  {
    id: "who",
    title: "Who do I call?",
    render: () => (
      <DarkSlide page="04">
        <div className="flex items-end justify-between">
          <div>
            <Eyebrow>Who do I call?</Eyebrow>
            <Headline className="mt-6">Today's opportunities</Headline>
          </div>
          <p className="slide-caption max-w-[560px] text-right text-white/45">
            Signals surface possibilities worth a conversation — never a prediction of intent.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-3 gap-8">
          <HomeownerCard
            className="deck-lift"
            style={{ animationDelay: "0ms" }}
            name="Maria R."
            property="Suburban single-family · 6 yrs owned"
            signal="Move-up"
            why="Significant equity plus property characteristics may indicate a possible move-up conversation."
            action="Start a conversation."
          />
          <HomeownerCard
            className="deck-lift"
            style={{ animationDelay: "160ms" }}
            tone="blue"
            name="The Okafors"
            property="Townhome · rate above today's market"
            signal="Financing"
            why="Their current financing appears above market — potentially worth a review together."
            action="Offer a quick rate check."
          />
          <HomeownerCard
            className="deck-lift"
            style={{ animationDelay: "320ms" }}
            tone="amber"
            name="J. Whitfield"
            property="Starter home · systems aging"
            signal="Systems"
            why="Key systems are near typical service life — a natural reason to check in and help."
            action="Offer help lining up the work."
          />
        </div>
      </DarkSlide>
    ),
  },
  {
    id: "why",
    title: "Why do I call?",
    render: () => (
      <DarkSlide page="05">
        <div className="grid h-full grid-cols-[0.9fr_1.1fr] items-center gap-16">
          <div>
            <p className="slide-title deck-rise font-semibold tracking-tight">
              Every good conversation
            </p>
            <p
              className={`slide-title deck-rise font-semibold tracking-tight ${ACCENT}`}
              style={{ animationDelay: "180ms" }}
            >
              starts with a reason.
            </p>
            <p className="slide-body-lg deck-fade mt-10 max-w-[720px] text-white/55">
              SuCasa doesn't just tell you who to call. It helps you understand why.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-6">
            {[
              ["Equity", "accent", "\u201cYour equity picture has changed. Want to see it?\u201d"],
              ["Move", "blue", "\u201cHow are you feeling about the house long term?\u201d"],
              ["Financing", "amber", "\u201cWorth a quick look at your current terms?\u201d"],
              ["Property", "blue", "\u201cValues on your street have shifted. Curious?\u201d"],
              ["Investment", "accent", "\u201cEver thought about a second property?\u201d"],
              ["Home improvement", "amber", "\u201cWant help lining up that work?\u201d"],
            ].map(([label, tone, line], i) => (
              <Glass
                key={label}
                className="deck-flow p-7"
                style={{ animationDelay: `${i * 130}ms` }}
              >
                <SignalChip tone={tone as "accent" | "blue" | "amber"}>{label}</SignalChip>
                <p className="slide-body mt-5 text-white/72">{line}</p>
              </Glass>
            ))}
          </div>
        </div>
      </DarkSlide>
    ),
  },
  {
    id: "say",
    title: "What do I say?",
    render: () => (
      <DarkSlide page="06">
        <Eyebrow>What do I say?</Eyebrow>
        <Headline className="mt-6">
          Don't just tell me who to call. Help me start the conversation.
        </Headline>
        <div className="mt-12 grid grid-cols-[1fr_auto_1.1fr] items-center gap-10">
          <HomeownerCard
            className="deck-lift"
            name="Maria R."
            property="123 Oakline Dr · owned 6 years"
            signal="Equity"
            why="Homeowner appears to have substantial equity relative to their original purchase."
          />
          <div className={`slide-title font-semibold ${ACCENT} deck-glow`}>→</div>
          <Glass accent className="deck-lift p-10" style={{ animationDelay: "420ms" }}>
            <SignalChip>Conversation idea</SignalChip>
            <p className="slide-body-lg mt-7 text-white/85">
              “Hey Maria, I was thinking about your home and wanted to check in. How are you feeling
              about the house and your plans for the next couple of years?”
            </p>
            <p className="slide-caption mt-7 text-white/45">
              Drafted for you. Edited by you. Sent as you.
            </p>
          </Glass>
        </div>
      </DarkSlide>
    ),
  },
  {
    id: "product",
    title: "Your week, prioritized",
    render: () => (
      <DarkSlide page="07">
        <div className="grid h-full grid-cols-[1fr_auto] items-center gap-20">
          <div>
            <Eyebrow>The product</Eyebrow>
            <Headline className="mt-6">Know who to call.</Headline>
            <p className="slide-body-lg mt-8 space-y-2 text-white/60">
              Know why. Know what to say. Know what to do next.
            </p>
            <div className="mt-12 grid grid-cols-2 gap-6">
              {[
                ["Prioritized", "A short list, refreshed weekly — not a spreadsheet."],
                ["Explained", "Every name arrives with the reason behind it."],
                ["Actionable", "One suggested next step per homeowner."],
                ["Yours", "Your brand, your voice, your relationship."],
              ].map(([t, d]) => (
                <Glass key={t} className="p-7">
                  <p className="slide-body-lg font-semibold">{t}</p>
                  <p className="slide-body mt-3 text-white/55">{d}</p>
                </Glass>
              ))}
            </div>
          </div>
          <div className="deck-lift">
            <AppFrame label="Agent · this week" scale={1.0}>
              <AgentWeekScreen />
            </AppFrame>
          </div>
        </div>
      </DarkSlide>
    ),
  },
  {
    id: "product-live",
    title: "Real product, not a mockup",
    render: () => (
      <DarkSlide page="08">
        <div className="grid h-full grid-cols-[auto_1fr] items-center gap-20">
          <div className="deck-lift">
            <AppFrame scale={1.05}>
              <AgentWeekScreen />
            </AppFrame>
          </div>
          <div>
            <Eyebrow>Live in the product</Eyebrow>
            <Headline className="mt-6">This is the actual screen.</Headline>
            <p className="slide-body-lg mt-8 max-w-[820px] text-white/60">
              Your homeowners, the signal behind each one, and the suggested next move — on your
              phone, every week.
            </p>
            <div className="mt-12 flex gap-14">
              <BigStat value="742" label="Homeowners in your database" tone="white" />
              <BigStat value="35" label="Worth a call this week" />
            </div>
            <p className="slide-caption mt-10 text-white/40">
              Illustrative figures from a demo portfolio.
            </p>
          </div>
        </div>
      </DarkSlide>
    ),
  },
  {
    id: "journey",
    title: "The homeowner journey",
    render: () => (
      <DarkSlide page="09">
        <Eyebrow>Seven years, not one day</Eyebrow>
        <Headline className="mt-6">The transaction ends. The relationship doesn't.</Headline>
        <div className="mt-16 flex items-stretch gap-4">
          {[
            ["Year 1", "Buy"],
            ["Year 2", "Home value"],
            ["Year 3", "Equity"],
            ["Year 4", "Improvements"],
            ["Year 5", "Financing"],
            ["Year 6", "Move"],
            ["Year 7", "Sell"],
          ].map(([y, l], i) => (
            <div key={y} className="flex flex-1 items-center gap-4">
              <Glass
                accent={i === 6}
                className="deck-flow w-full px-5 py-9 text-center"
                style={{ animationDelay: `${i * 150}ms` }}
              >
                <p className="slide-chrome font-semibold uppercase tracking-[0.14em] text-white/40">
                  {y}
                </p>
                <p className="slide-body-lg mt-4 font-semibold">{l}</p>
              </Glass>
              {i < 6 && <span className={`slide-subtitle ${ACCENT} opacity-60`}>›</span>}
            </div>
          ))}
        </div>
        <div className="mt-14 h-[3px] w-full rounded-full bg-gradient-to-r from-[oklch(0.7_0.14_255)] to-[oklch(0.78_0.14_165)] opacity-70" />
        <p className="slide-body-lg mt-10 max-w-[1200px] text-white/55">
          Most agents show up at year 1 and year 7. SuCasa keeps you present for everything in
          between.
        </p>
      </DarkSlide>
    ),
  },
  {
    id: "first-call",
    title: "Become the first call",
    render: () => (
      <Cinematic
        page="10"
        lines={["When something changes", "with their home…"]}
        after={["“I should call my agent.”"]}
        note="Presence beats prospecting. Be the name they already trust when the moment arrives."
      />
    ),
  },
  {
    id: "home-team",
    title: "The homeowner's home team",
    render: () => (
      <DarkSlide page="11">
        <Eyebrow>The home team</Eyebrow>
        <Headline className="mt-6">You stay the quarterback.</Headline>
        <div className="mt-8 grid grid-cols-[1fr_auto] items-center gap-16">
          <div className="grid grid-cols-3 gap-6">
            {["Lender", "Insurance", "Home services", "Contractors", "Inspection", "Title"].map(
              (p, i) => (
                <Glass
                  key={p}
                  className="deck-flow px-6 py-8 text-center"
                  style={{ animationDelay: `${300 + i * 110}ms` }}
                >
                  <p className="slide-body font-semibold text-white/75">{p}</p>
                </Glass>
              ),
            )}
          </div>
          <div className="relative grid h-[520px] w-[520px] place-items-center">
            <div className="deck-orbit absolute inset-0 rounded-full border border-dashed border-white/12" />
            <div className="absolute inset-[70px] rounded-full border border-white/8" />
            <div className="relative grid h-[300px] w-[300px] place-items-center rounded-full border border-[oklch(0.78_0.14_165_/_0.5)] bg-[oklch(0.78_0.14_165_/_0.1)] text-center">
              <div>
                <p className="slide-chrome font-semibold uppercase tracking-[0.16em] text-white/45">
                  At the center
                </p>
                <p className="slide-subtitle mt-3 font-semibold">Homeowner</p>
                <p className={`slide-body mt-4 font-semibold ${ACCENT}`}>You, the agent</p>
              </div>
            </div>
          </div>
        </div>
        <p className="slide-body-lg mt-8 max-w-[1150px] text-white/55">
          SuCasa routes the right resource at the right moment — and every introduction still comes
          from you.
        </p>
      </DarkSlide>
    ),
  },
  {
    id: "ltv",
    title: "One relationship, multiple opportunities",
    render: () => (
      <DarkSlide page="12">
        <Eyebrow>Lifetime value</Eyebrow>
        <Headline className="mt-6">One relationship. Multiple opportunities.</Headline>
        <p className="slide-body-lg mt-6 max-w-[1200px] text-white/55">
          Increase the lifetime value of the relationships you already have.
        </p>
        <div className="mt-12 grid grid-cols-[auto_1fr] items-center gap-16">
          <Glass accent className="grid h-[300px] w-[300px] place-items-center text-center">
            <div>
              <p className="slide-chrome font-semibold uppercase tracking-[0.16em] text-white/45">
                One
              </p>
              <p className="slide-subtitle mt-3 font-semibold">Homeowner</p>
            </div>
          </Glass>
          <div className="grid grid-cols-4 gap-5">
            {["Buy", "Sell", "Equity", "Financing", "Invest", "Improve", "Refer", "Repeat"].map(
              (b, i) => (
                <Glass
                  key={b}
                  className="deck-flow px-6 py-8 text-center"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <p className="slide-body-lg font-semibold">{b}</p>
                </Glass>
              ),
            )}
          </div>
        </div>
      </DarkSlide>
    ),
  },
  {
    id: "flywheel",
    title: "The agent flywheel",
    render: () => (
      <DarkSlide page="13">
        <div className="grid h-full grid-cols-[0.85fr_1.15fr] items-center gap-16">
          <div>
            <Eyebrow>Compounding</Eyebrow>
            <Headline className="mt-6">It gets faster.</Headline>
            <p className="slide-body-lg mt-8 max-w-[700px] text-white/55">
              Every conversation adds intelligence. Every closing adds homeowners.
            </p>
          </div>
          <div className="relative grid h-[760px] place-items-center">
            <div className="deck-orbit-fast absolute h-[520px] w-[520px] rounded-full border-2 border-dashed border-[oklch(0.78_0.14_165_/_0.35)]" />
            {[
              "More homeowners",
              "More intelligence",
              "More conversations",
              "More value",
              "More trust",
              "More referrals",
              "More transactions",
            ].map((step, i, arr) => {
              const angle = (i / arr.length) * 2 * Math.PI - Math.PI / 2;
              return (
                <div
                  key={step}
                  className="absolute"
                  style={{
                    transform: `translate(${Math.cos(angle) * 300}px, ${Math.sin(angle) * 300}px)`,
                  }}
                >
                  <Glass
                    className="deck-flow px-7 py-5"
                    style={{ animationDelay: `${i * 160}ms` }}
                  >
                    <p className="slide-body whitespace-nowrap font-semibold">{step}</p>
                  </Glass>
                </div>
              );
            })}
            <div className={`slide-subtitle font-semibold ${ACCENT} deck-glow`}>Flywheel</div>
          </div>
        </div>
      </DarkSlide>
    ),
  },
  {
    id: "start",
    title: "How you start",
    render: () => (
      <DarkSlide page="14">
        <Eyebrow>How you start</Eyebrow>
        <Headline className="mt-6">Three steps. Your database stays yours.</Headline>
        <div className="mt-16 grid grid-cols-3 gap-10">
          {[
            ["01", "Bring your database", "Upload a CSV or sync your CRM export. Nothing is shared or resold."],
            ["02", "We build the Home Record", "Each contact becomes a living property, financial and condition profile."],
            ["03", "You get a weekly short list", "Who to call, why, and a suggested opening — in your voice."],
          ].map(([n, t, d], i) => (
            <Glass
              key={n}
              className="deck-lift p-10"
              accent={i === 2}
              style={{ animationDelay: `${i * 180}ms` }}
            >
              <p className={`slide-title font-semibold ${ACCENT}`}>{n}</p>
              <p className="slide-subtitle mt-6 font-semibold">{t}</p>
              <p className="slide-body mt-5 text-white/60">{d}</p>
            </Glass>
          ))}
        </div>
      </DarkSlide>
    ),
  },
  {
    id: "close",
    title: "What if your database became your greatest source of business?",
    render: () => (
      <DarkSlide footer={null}>
        <div className="relative flex h-full flex-col justify-center">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 opacity-30">
            <ContactField count={64} columns={16} activeIndexes={[5, 18, 27, 41, 55]} />
          </div>
          <div className="relative">
            <p className="slide-title-lg deck-rise font-semibold tracking-tight">
              What if your database
            </p>
            <p
              className="slide-title-lg deck-rise font-semibold tracking-tight"
              style={{ animationDelay: "140ms" }}
            >
              became your greatest
            </p>
            <p
              className={`slide-title-lg deck-rise font-semibold tracking-tight ${ACCENT}`}
              style={{ animationDelay: "280ms" }}
            >
              source of business?
            </p>
            <p className="slide-body-lg deck-fade mt-14 max-w-[1150px] text-white/60">
              You already have the homeowners. SuCasa helps you turn relationships into
              opportunities.
            </p>
            <img src={logoAsset.url} alt="SuCasa" className="mt-16 h-[56px] w-auto opacity-90" />
          </div>
        </div>
      </DarkSlide>
    ),
  },
];
