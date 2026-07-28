import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ClipboardList, Clock } from "lucide-react";
import { listInspectionFindings } from "@/lib/inspection.functions";

const URGENCY_ORDER: Record<string, number> = {
  immediate: 0,
  "12_months": 1,
  "1_3_years": 2,
  monitor: 3,
};

const URGENCY_LABEL: Record<string, string> = {
  immediate: "Immediate",
  "12_months": "Within 12 mo",
  "1_3_years": "1–3 years",
  monitor: "Monitor",
};

const CONDITION_STYLE: Record<string, string> = {
  good: "bg-emerald-100 text-emerald-800",
  fair: "bg-amber-100 text-amber-800",
  poor: "bg-orange-100 text-orange-800",
  end_of_life: "bg-red-100 text-red-800",
};

function urgencyIcon(u: string | null) {
  if (u === "immediate") return <AlertTriangle className="h-3.5 w-3.5 text-red-600" />;
  if (u === "12_months") return <Clock className="h-3.5 w-3.5 text-amber-600" />;
  return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
}

type Props = { userId?: string; onRequestService?: (category: string) => void };

export function InspectionFindingsPanel({ userId, onRequestService }: Props) {
  const listFn = useServerFn(listInspectionFindings);
  const { data: findings = [], isLoading } = useQuery({
    queryKey: ["inspection-findings", userId ?? "self"],
    queryFn: () => listFn({ data: userId ? { userId } : {} }),
  });

  if (isLoading) return null;
  if (!findings || findings.length === 0) return null;

  const sorted = [...findings].sort(
    (a: any, b: any) =>
      (URGENCY_ORDER[a.urgency ?? "monitor"] ?? 99) -
      (URGENCY_ORDER[b.urgency ?? "monitor"] ?? 99),
  );

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">Inspection findings</h2>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-primary">
          AI analyzed
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Extracted from your uploaded inspection report. Sorted by urgency.
      </p>

      <ul className="mt-4 space-y-3">
        {sorted.map((f: any) => (
          <li key={f.id} className="rounded-2xl border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold capitalize">
                {String(f.system).replace(/_/g, " ")}
              </span>
              {f.condition && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CONDITION_STYLE[f.condition] ?? "bg-muted text-foreground"}`}
                >
                  {String(f.condition).replace(/_/g, " ")}
                </span>
              )}
              {f.urgency && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
                  {urgencyIcon(f.urgency)} {URGENCY_LABEL[f.urgency] ?? f.urgency}
                </span>
              )}
              {typeof f.remaining_life_years === "number" && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
                  ~{f.remaining_life_years}y life
                </span>
              )}
            </div>

            {f.recommended_action && (
              <p className="mt-2 text-sm">{f.recommended_action}</p>
            )}

            {Array.isArray(f.defects) && f.defects.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                {f.defects.map((d: string, i: number) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}

            {f.source_excerpt && (
              <p className="mt-2 text-[11px] italic text-muted-foreground">
                &ldquo;{f.source_excerpt}&rdquo;
              </p>
            )}

            {f.recommended_category && onRequestService && (
              <button
                onClick={() => onRequestService(f.recommended_category)}
                className="mt-3 inline-flex items-center rounded-full gradient-brand px-3 py-1 text-xs font-semibold text-white"
              >
                Request {f.recommended_category}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
