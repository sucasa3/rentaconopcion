/**
 * Inspection findings → proposed maintenance-plan actions.
 *
 * Pure and shared by the homeowner review screen and the server approval path,
 * so both compute identical proposals. Deadlines are relative to the
 * inspection date (never "today"), and only when the inspector stated an
 * urgency; nothing here invents deadlines, diagnoses or completed repairs.
 */

export type ReportFinding = {
  system: string;
  condition?: string | null;
  urgency?: string | null;
  defects?: string[] | null;
  recommended_action?: string | null;
  recommended_category?: string | null;
  source_pages?: number[] | null;
};

export type ExistingAction = {
  action_key: string;
  title: string;
  urgency: string;
  due_by: string | null;
  status: string;
};

export type MaintenanceProposal = {
  key: string;
  title: string;
  why: string | null;
  system: string;
  serviceCategory: string | null;
  /** Inspector's stated urgency, or null when the report stated none. */
  urgency: string | null;
  dueBy: string | null;
  sourcePages: number[];
  needsConfirmation: boolean;
  /** new = will create a task; update = open task exists with material changes; same = open task already matches; kept = completed/dismissed task preserved. */
  kind: "new" | "update" | "same" | "kept";
  existing: { title: string; urgency: string; dueBy: string | null; status: string } | null;
};

const MONTHS: Record<string, number> = { immediate: 1, "12_months": 12, "1_3_years": 36 };
const STALE_MONTHS = 12;

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function addMonths(isoDate: string, m: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + m);
  return d.toISOString().slice(0, 10);
}

export function actionKey(system: string, title: string): string {
  return `inspection:${slug(`${system}-${title}`)}`;
}

export function proposeMaintenanceActions(
  findings: ReportFinding[],
  inspectionDate: string | null,
  existing: ExistingAction[] = [],
  now: Date = new Date(),
): MaintenanceProposal[] {
  const today = now.toISOString().slice(0, 10);
  const staleCutoff = addMonths(today, -STALE_MONTHS);
  const byKey = new Map(existing.map((e) => [e.action_key, e]));
  const seen = new Set<string>();
  const out: MaintenanceProposal[] = [];
  for (const f of findings) {
    const defects = (f.defects ?? []).filter(Boolean);
    if (!f.recommended_action && !defects.length) continue;
    const system = String(f.system || "general");
    const title = (f.recommended_action || `Address ${system.replace(/_/g, " ")} issues`).slice(0, 200);
    const key = actionKey(system, title);
    if (seen.has(key)) continue;
    seen.add(key);
    const urgency = f.urgency && (f.urgency in MONTHS || f.urgency === "monitor") ? f.urgency : null;
    const months = urgency ? MONTHS[urgency] : undefined;
    const dueBy = inspectionDate && months ? addMonths(inspectionDate, months) : null;
    const needsConfirmation =
      !inspectionDate || inspectionDate < staleCutoff || (dueBy != null && dueBy < today);
    const prev = byKey.get(key) ?? null;
    let kind: MaintenanceProposal["kind"] = "new";
    if (prev) {
      if (prev.status !== "open") kind = "kept";
      else if ((urgency ?? prev.urgency) === prev.urgency && (dueBy ?? prev.due_by) === prev.due_by) kind = "same";
      else kind = "update";
    }
    out.push({
      key,
      title,
      why: defects.length ? defects.slice(0, 2).join("; ").slice(0, 300) : null,
      system,
      serviceCategory: f.recommended_category ?? null,
      urgency,
      dueBy,
      sourcePages: (f.source_pages ?? []).filter((p) => Number.isInteger(p)),
      needsConfirmation,
      kind,
      existing: prev ? { title: prev.title, urgency: prev.urgency, dueBy: prev.due_by, status: prev.status } : null,
    });
  }
  return out.slice(0, 12);
}
