import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getUploadResults, approveUploadSpend } from "@/lib/mixed-upload.functions";
import { useLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Results of one upload: every row's outcome, plus the batch spending approval. */
export function UploadResultsPanel({ batchId, onDone }: { batchId: string; onDone?: () => void }) {
  const { language } = useLanguage();
  const L = (en: string, es: string) => (language === "es" ? es : en);
  const qc = useQueryClient();
  const resultsFn = useServerFn(getUploadResults);
  const approveFn = useServerFn(approveUploadSpend);
  const [confirming, setConfirming] = useState(false);
  const [showRows, setShowRows] = useState(false);
  const key = ["upload-results", batchId];
  const { data, isLoading, error } = useQuery({ queryKey: key, queryFn: () => resultsFn({ data: { batchId } }) });

  const approve = useMutation({
    mutationFn: (v: { maxLookups: number; maxCostCents: number }) => approveFn({ data: { batchId, ...v } }),
    onSuccess: (r) => {
      toast.success(L(
        `Approved ${r.paid_lookups} paid lookup${r.paid_lookups === 1 ? "" : "s"} (up to ${money(r.max_cost_cents)}) · ${r.cached_reuse} saved record${r.cached_reuse === 1 ? "" : "s"} reused free`,
        `Aprobadas ${r.paid_lookups} búsquedas pagadas (hasta ${money(r.max_cost_cents)}) · ${r.cached_reuse} registros guardados sin costo`,
      ));
      setConfirming(false);
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <div className="rounded-3xl border border-border bg-card p-5 text-sm text-muted-foreground">{L("Loading upload results…", "Cargando resultados…")}</div>;
  if (error || !data) return <div className="rounded-3xl border border-border bg-card p-5 text-sm text-destructive">{L("Couldn't load upload results.", "No se pudieron cargar los resultados.")}</div>;

  const c = data.counts;
  const n = (k: string) => c[k] ?? 0;
  const added = n("added_cached") + n("added_needs_lookup");
  const lines: { label: string; value: number; hint?: string }[] = [
    { label: L("Added with saved property records", "Agregados con registros guardados"), value: n("added_cached"), hint: L("No lookup cost", "Sin costo") },
    { label: L("Added, waiting for spending approval", "Agregados, esperando aprobación de gasto"), value: data.spend.paidLookupsWaiting },
    { label: L("Added, lookup already approved", "Agregados, búsqueda aprobada"), value: Math.max(n("added_needs_lookup") - data.spend.paidLookupsWaiting, 0) },
    { label: L("Kept as contact only (no address)", "Guardados solo como contacto (sin dirección)"), value: n("contact_only"), hint: L("Uses no Home Profile capacity", "No usa capacidad") },
    { label: L("Waiting for capacity", "Esperando capacidad"), value: n("waiting_capacity"), hint: L("Kept, added when room opens", "Guardados para después") },
    { label: L("Already in your book", "Ya están en tu cartera"), value: n("already_uploaded") },
    { label: L("Repeated in this file", "Repetidos en este archivo"), value: n("duplicate_in_file") },
    { label: L("Opted out — not added", "Pidieron no ser contactados"), value: n("suppressed") },
    { label: L("Not usable (no name, address, phone or email)", "No utilizables"), value: n("unusable") },
  ];
  const paid = data.spend.paidLookupsWaiting;
  const saved = data.spend.savedRecordsWaiting;
  const maxCents = paid * data.spend.unitCents;

  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-6" aria-label={L("Upload results", "Resultados de la carga")}>
      <h2 className="text-lg font-semibold tracking-tight">{L("Upload results", "Resultados de la carga")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {L(`${data.totalRows} rows read · ${added} homes added · every row accounted for below.`,
           `${data.totalRows} filas leídas · ${added} casas agregadas · cada fila aparece abajo.`)}
      </p>

      <ul className="mt-4 divide-y divide-border">
        {lines.filter((l) => l.value > 0).map((l) => (
          <li key={l.label} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span>{l.label}{l.hint && <span className="ml-2 text-xs text-muted-foreground">{l.hint}</span>}</span>
            <span className="font-semibold tabular-nums">{l.value}</span>
          </li>
        ))}
      </ul>

      {(paid > 0 || saved > 0) && (
        <div className="mt-4 rounded-2xl bg-secondary p-4 text-sm">
          <p className="font-medium">
            {paid > 0
              ? L(`${paid} home${paid === 1 ? "" : "s"} need a paid property lookup — up to ${money(maxCents)}.`,
                  `${paid} casa(s) necesitan una búsqueda pagada — hasta ${money(maxCents)}.`)
              : L("No paid lookups needed.", "No se necesitan búsquedas pagadas.")}
          </p>
          {saved > 0 && <p className="mt-1 text-muted-foreground">{L(`${saved} saved record${saved === 1 ? "" : "s"} will be reused at no cost.`, `${saved} registro(s) guardado(s) se reutilizarán sin costo.`)}</p>}
          <Button className="mt-3" onClick={() => setConfirming(true)} disabled={approve.isPending}>
            {paid > 0 ? L("Review and approve lookups", "Revisar y aprobar búsquedas") : L("Use saved records", "Usar registros guardados")}
          </Button>
        </div>
      )}
      {data.approvedAt && paid === 0 && saved === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">{L(`${data.approvedLookups} paid lookup(s) approved for this upload.`, `${data.approvedLookups} búsqueda(s) aprobada(s).`)}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setShowRows((v) => !v)}>
          {showRows ? L("Hide row details", "Ocultar filas") : L("See every row", "Ver cada fila")}
        </Button>
        {onDone && <Button variant="ghost" size="sm" onClick={onDone}>{L("Go to my book", "Ir a mi cartera")}</Button>}
      </div>
      {showRows && (
        <ol className="mt-3 max-h-80 overflow-auto rounded-2xl border border-border text-xs">
          {data.rows.map((r) => (
            <li key={r.row} className="flex justify-between gap-3 border-b border-border px-3 py-1.5 last:border-0">
              <span className="truncate">#{r.row} {r.name ?? "—"}{r.address ? ` · ${r.address}` : ""}</span>
              <span className="shrink-0 text-muted-foreground">{outcomeLabel(r.outcome, r.waitingForApproval, L)}</span>
            </li>
          ))}
        </ol>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{L("Approve this upload's lookups?", "¿Aprobar las búsquedas de esta carga?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {L(`Paid lookups: ${paid}. Maximum cost: ${money(maxCents)} (${money(data.spend.unitCents)} each, estimated). Saved records reused free: ${saved}. Nothing beyond this limit will run.`,
                 `Búsquedas pagadas: ${paid}. Costo máximo: ${money(maxCents)} (${money(data.spend.unitCents)} c/u, estimado). Registros guardados sin costo: ${saved}. Nada más allá de este límite se ejecutará.`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{L("Cancel", "Cancelar")}</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); approve.mutate({ maxLookups: paid, maxCostCents: maxCents }); }} disabled={approve.isPending}>
              {approve.isPending ? L("Approving…", "Aprobando…") : L(`Approve up to ${money(maxCents)}`, `Aprobar hasta ${money(maxCents)}`)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function outcomeLabel(o: string, waiting: boolean, L: (en: string, es: string) => string) {
  switch (o) {
    case "added_cached": return L("Added · saved record", "Agregado · registro guardado");
    case "added_needs_lookup": return waiting ? L("Added · waiting for approval", "Agregado · esperando aprobación") : L("Added · lookup approved", "Agregado · aprobado");
    case "contact_only": return L("Contact only", "Solo contacto");
    case "waiting_capacity": return L("Waiting for capacity", "Esperando capacidad");
    case "already_uploaded": return L("Already in your book", "Ya en tu cartera");
    case "duplicate_in_file": return L("Repeated in file", "Repetido");
    case "suppressed": return L("Opted out", "Excluido");
    default: return L("Not usable", "No utilizable");
  }
}
