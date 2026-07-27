import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, ArrowRight } from "lucide-react";
import { getMyHomeIntel } from "@/lib/property-intel.functions";

type Suggestion = { category: string; title: string; why: string; urgency: "high" | "medium" | "low" };

function suggestFor(intel: any): Suggestion[] {
  const out: Suggestion[] = [];
  if (!intel?.ok) return out;
  const year = intel.detail?.yearBuilt as number | undefined;
  const now = new Date().getFullYear();
  const age = year ? now - year : null;

  if (age != null && age >= 15) {
    out.push({
      category: "roofing",
      title: "Roof inspection",
      why: `Home is ${age} years old — most roofs need review after 15–20 years.`,
      urgency: age >= 20 ? "high" : "medium",
    });
  }
  if (age != null && age >= 10) {
    out.push({
      category: "hvac",
      title: "HVAC service",
      why: `Systems over 10 years lose efficiency — a tune-up extends life.`,
      urgency: "medium",
    });
  }
  if (age != null && age >= 25) {
    out.push({
      category: "electrical",
      title: "Electrical panel check",
      why: `Panels in ${age}-year-old homes may need modernization.`,
      urgency: "medium",
    });
  }
  if (age != null && age >= 20) {
    out.push({
      category: "plumbing",
      title: "Water heater review",
      why: `Water heaters typically last 10–15 years.`,
      urgency: "medium",
    });
  }
  // Refi signal → mortgage lender
  if (intel.equity?.refiSignal === "strong" || intel.equity?.refiSignal === "possible") {
    out.push({
      category: "mortgage-lender",
      title: "Talk to a mortgage lender",
      why: `You may qualify to refinance or tap equity.`,
      urgency: "high",
    });
  }
  return out.slice(0, 4);
}

export function SuggestedServicesPanel() {
  const fetchIntel = useServerFn(getMyHomeIntel);
  const { data: intel } = useQuery({
    queryKey: ["home-intel-suggest"],
    queryFn: () =>
      fetchIntel({ data: { classes: ["detail"], revenueSource: "dashboard_suggest" } }),
    staleTime: 10 * 60_000,
  });

  const suggestions = suggestFor(intel);

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Suggested for your home</h2>
          <p className="text-xs text-muted-foreground">Based on your home's age & equity.</p>
        </div>
        <Sparkles className="h-4 w-4 text-primary" />
      </div>
      {suggestions.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Add your address and inspection report to unlock personalized recommendations.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {suggestions.map((s) => (
            <li
              key={s.title}
              className="flex items-start justify-between gap-3 rounded-2xl border border-border p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{s.title}</p>
                  <UrgencyPill urgency={s.urgency} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{s.why}</p>
              </div>
              <Link
                to="/request"
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
              >
                Request <ArrowRight className="h-3 w-3" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UrgencyPill({ urgency }: { urgency: Suggestion["urgency"] }) {
  const map = {
    high: "bg-destructive/10 text-destructive",
    medium: "bg-accent text-accent-foreground",
    low: "bg-secondary text-secondary-foreground",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${map[urgency]}`}>
      {urgency}
    </span>
  );
}
