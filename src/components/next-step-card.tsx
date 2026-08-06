import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, BookOpen, Star, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getRecommendedPros } from "@/lib/pros.functions";
import type { TimelineItem } from "@/lib/maintenance-rules";

/** Maintenance category → service request category slug. */
const CATEGORY_SLUG: Record<string, string> = {
  Roofing: "roofing",
  HVAC: "hvac",
  Plumbing: "plumbing",
  Windows: "handyman",
  Electrical: "electrical",
  Exterior: "painting",
};

type Guide = { what: string; steps: string[]; diy: string; cost: string };

const GUIDES: Record<string, Guide> = {
  roof: {
    what: "A roof at or past its expected life can let water in long before you see a stain on the ceiling.",
    steps: [
      "Walk the perimeter and look for curling, cracked or missing shingles.",
      "Check gutters for shingle granules — a sign the surface is wearing out.",
      "Look in the attic after rain for damp sheathing or daylight through the deck.",
      "Book a licensed roofer for a written inspection with photos before deciding repair vs. replace.",
    ],
    diy: "Visual checks from the ground are fine. Never walk the roof yourself.",
    cost: "Inspections are often free or $150–$400; repairs vary widely by pitch and material.",
  },
  hvac: {
    what: "Systems past 15 years lose efficiency, run longer and are more likely to fail in peak season.",
    steps: [
      "Replace the air filter and note the model year on the outdoor unit's label.",
      "Listen for short cycling, hard starts or new noises.",
      "Compare summer/winter bills year over year — a jump usually means lost efficiency.",
      "Schedule a tune-up and ask for a repair-vs-replace estimate with efficiency numbers.",
    ],
    diy: "Filter changes and clearing debris around the outdoor unit are homeowner tasks.",
    cost: "Tune-ups typically $90–$200; replacement quotes should always be compared across pros.",
  },
  water_heater: {
    what: "Tank heaters average 10 years. Most fail by leaking, which can flood a finished space.",
    steps: [
      "Find the serial number on the tank label to confirm its age.",
      "Look for rust at the base, moisture on the pan or discolored hot water.",
      "Flush sediment once a year if the manufacturer allows it.",
      "Get a quote for a like-for-like tank and a tankless option so you can compare.",
    ],
    diy: "Flushing is doable; any gas or venting work should go to a licensed plumber.",
    cost: "Flush service $100–$200; replacement typically $1,200–$3,500 installed.",
  },
  windows: {
    what: "Failing seals and old frames drive up energy bills and let moisture into the wall.",
    steps: [
      "Check for fogging between panes — that means the seal has failed.",
      "Feel for drafts around frames on a cold or windy day.",
      "Note which rooms are hardest to keep comfortable.",
      "Ask a pro to price full replacement vs. sash/seal repair for the worst windows only.",
    ],
    diy: "Re-caulking and weather-stripping are easy wins before any replacement.",
    cost: "Caulk and weather-strip under $60; replacements $450–$1,200 per window.",
  },
  electrical: {
    what: "Older panels can be undersized for today's loads, and some brands are known fire risks.",
    steps: [
      "Photograph the panel label — brand, amperage and year.",
      "Note any breakers that trip repeatedly, warm covers or burning smell (call immediately).",
      "List planned additions: EV charger, heat pump, hot tub, ADU.",
      "Book a licensed electrician for a panel evaluation and load calculation.",
    ],
    diy: "None. Never open or work inside a panel yourself.",
    cost: "Evaluations $100–$250; panel upgrades commonly $1,800–$4,500.",
  },
  siding: {
    what: "Paint and siding are the home's weather barrier — once it fails, repairs get structural.",
    steps: [
      "Look for peeling paint, soft trim, gaps at joints and caulk that has pulled away.",
      "Probe suspect trim with a screwdriver; softness means rot.",
      "Prioritize the sun- and rain-facing elevations first.",
      "Get quotes that separate carpentry repair from paint so you can phase the work.",
    ],
    diy: "Washing and spot-caulking are homeowner-friendly; ladder work is not.",
    cost: "Spot repairs a few hundred dollars; full exterior paint $4,000–$12,000.",
  },
};

function fallbackGuide(item: TimelineItem): Guide {
  return {
    what: `${item.label} is projected to reach the end of its expected life around ${item.expectedYear}.`,
    steps: [
      "Confirm the install date on the equipment label or your records.",
      "Look for visible wear, leaks or performance changes.",
      "Get two written quotes so you can compare scope and price.",
    ],
    diy: "Inspect visually; leave repairs to a licensed pro.",
    cost: "Ask each pro for a line-item estimate.",
  };
}

export function NextStepCard({ item }: { item: TimelineItem }) {
  const [open, setOpen] = useState(false);
  const slug = CATEGORY_SLUG[item.category] ?? "handyman";
  const guide = GUIDES[item.key] ?? fallbackGuide(item);

  const fetchPros = useServerFn(getRecommendedPros);
  const { data: pros } = useQuery({
    queryKey: ["recommended-pros", item.category],
    queryFn: () => fetchPros({ data: { category: item.category, limit: 2 } }),
    staleTime: 10 * 60_000,
  });
  const pro = pros?.[0];

  return (
    <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
        Your next suggested step
      </p>
      <p className="mt-1 text-sm font-semibold">
        {item.status === "overdue"
          ? `${item.label} is ${Math.abs(item.yearsLeft)} yr past its expected life`
          : `${item.label} is nearing end of life (~${item.yearsLeft} yr left)`}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{guide.what}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-semibold hover:bg-secondary"
        >
          <BookOpen className="h-3.5 w-3.5" /> How to handle this
        </button>
        <Link
          to="/request"
          search={{ category: slug }}
          className="inline-flex items-center gap-1.5 rounded-full gradient-brand px-3.5 py-2 text-xs font-semibold text-white shadow-soft"
        >
          Get quotes <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {pro && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-sm font-medium">
              {pro.businessName}
              {pro.isFoundingPartner && (
                <span className="inline-flex items-center gap-1 rounded-full bg-growth/15 px-2 py-0.5 text-[10px] font-semibold text-growth">
                  <ShieldCheck className="h-3 w-3" /> Founding partner
                </span>
              )}
            </p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              {pro.rating != null && (
                <>
                  <Star className="h-3 w-3 fill-current text-amber-500" />
                  {pro.rating} · {pro.reviewsCount} reviews ·{" "}
                </>
              )}
              {pro.serviceArea ?? pro.category}
            </p>
          </div>
          <Link
            to="/request"
            search={{ category: slug }}
            className="shrink-0 rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold hover:bg-secondary"
          >
            Request this pro
          </Link>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{item.label} — what to do</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">{guide.what}</p>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Steps</p>
              <ol className="mt-1.5 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
                {guide.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </div>
            <div className="rounded-xl border border-border p-3 text-xs text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">DIY vs. pro:</span> {guide.diy}
              </p>
              <p className="mt-1">
                <span className="font-semibold text-foreground">Typical cost:</span> {guide.cost}
              </p>
            </div>
            <Link
              to="/request"
              search={{ category: slug }}
              onClick={() => setOpen(false)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full gradient-brand px-4 py-2.5 text-sm font-semibold text-white shadow-soft"
            >
              Get quotes from a SuCasa pro <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="text-[11px] text-muted-foreground">
              Estimates are general guidance from standard component lifespans — your pro's
              inspection is the final word.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
