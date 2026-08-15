import type { ReactNode } from "react";
import {
  Users,
  UserCheck,
  Sparkles,
  Megaphone,
  Wallet,
  TrendingUp,
  Home,
  Wrench,
} from "lucide-react";
import { StatCard, SignalCard, StatusPill, ScoreRing } from "@/components/ui-kit";

/**
 * Real SuCasa product UI, rendered at its native mobile width inside the deck
 * and scaled up so a room can read it. These are the same components the
 * shipped dashboards use — not redrawn screenshots.
 */
export function AppFrame({
  children,
  label,
  width = 420,
  height = 720,
  scale = 1.15,
}: {
  children: ReactNode;
  label?: string;
  width?: number;
  height?: number;
  scale?: number;
}) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="overflow-hidden rounded-[46px] border-[10px] border-[oklch(0.28_0.02_255)] bg-background shadow-elevated"
        style={{ width: width * scale, height: height * scale }}
      >
        <div
          className="origin-top-left overflow-hidden bg-background"
          style={{ width, height, transform: `scale(${scale})` }}
        >
          {children}
        </div>
      </div>
      {label && <p className="slide-caption text-muted-foreground">{label}</p>}
    </div>
  );
}

export function AgentWeekScreen() {
  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">
          Maria · 742 homeowners
        </p>
        <h3 className="mt-1 text-2xl font-semibold tracking-tight">This week</h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Homeowners" value={742} icon={<Users className="h-4 w-4" />} />
        <StatCard
          label="Worth a call"
          value={35}
          tone="attention"
          icon={<Sparkles className="h-4 w-4" />}
        />
      </div>
      <SignalCard
        icon={<Wallet className="h-5 w-5" />}
        name="The Alvarez family"
        signal="Rate 7.1% · est. equity $186K"
        action="Send a rate check."
        pill={<StatusPill tone="attention">Refinance review</StatusPill>}
        actionLabel="View homeowner"
        onAction={() => {}}
      />
      <SignalCard
        icon={<Home className="h-5 w-5" />}
        name="J. Whitfield"
        signal="8 years in home · value up 34%"
        action="Share what their home could sell for."
        pill={<StatusPill tone="attention">Move-up</StatusPill>}
        actionLabel="View homeowner"
        onAction={() => {}}
      />
      <SignalCard
        icon={<Wrench className="h-5 w-5" />}
        name="D. Okafor"
        signal="HVAC past expected life · roof at 19 yrs"
        action="Offer help lining up the work."
        pill={<StatusPill tone="muted">Home condition</StatusPill>}
        actionLabel="View homeowner"
        onAction={() => {}}
      />
    </div>
  );
}

export function LenderBookScreen() {
  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">
          Pilot lender · MLO view
        </p>
        <h3 className="mt-1 text-2xl font-semibold tracking-tight">Your book</h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Homeowners" value={661} icon={<Users className="h-4 w-4" />} />
        <StatCard
          label="Activated"
          value={214}
          tone="growth"
          icon={<UserCheck className="h-4 w-4" />}
        />
        <StatCard
          label="Opportunities"
          value={1473}
          tone="attention"
          icon={<Sparkles className="h-4 w-4" />}
        />
        <StatCard label="Campaigns" value={3} tone="info" icon={<Megaphone className="h-4 w-4" />} />
      </div>
      <SignalCard
        icon={<TrendingUp className="h-5 w-5" />}
        name="R. Chen"
        signal="Equity crossed $250K · cash-out headroom $92K"
        action="Offer a line-of-credit conversation."
        pill={<StatusPill tone="attention">Equity</StatusPill>}
        actionLabel="View homeowner"
        onAction={() => {}}
      />
      <SignalCard
        icon={<Wallet className="h-5 w-5" />}
        name="The Brennans"
        signal="Rate 6.9% vs today's market"
        action="Send a rate check."
        pill={<StatusPill tone="attention">Refinance review</StatusPill>}
        actionLabel="View homeowner"
        onAction={() => {}}
      />
    </div>
  );
}

export function HomeRecordScreen() {
  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">
          Homeowner view
        </p>
        <h3 className="mt-1 text-2xl font-semibold tracking-tight">Your home</h3>
      </div>
      <div className="flex items-center gap-4 rounded-3xl border border-border/70 bg-card p-4 shadow-soft">
        <ScoreRing value={78} label="Home score" />
        <div>
          <p className="font-semibold">Home score</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Systems, inspections and records — one number the homeowner can act on.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Est. value" value="$612K" icon={<Home className="h-4 w-4" />} />
        <StatCard
          label="Equity"
          value="$248K"
          tone="growth"
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>
      <SignalCard
        icon={<Wrench className="h-5 w-5" />}
        name="Water heater"
        signal="12 years old — past typical service life"
        action="Get help scheduling replacement."
        pill={<StatusPill tone="attention">Due</StatusPill>}
        actionLabel="Request service"
        onAction={() => {}}
      />
    </div>
  );
}
