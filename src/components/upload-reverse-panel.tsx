import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { getUploadReverseResults, approveUploadReverseSearch, confirmUploadReverseMatch } from "@/lib/upload-reverse.functions";
import { useLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";

export function UploadReversePanel({ batchId }: { batchId: string }) {
  const { language } = useLanguage();
  const L = (en: string, es: string) => language === "es" ? es : en;
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [property, setProperty] = useState<{ id: string; address: string } | null>(null);
  const qc = useQueryClient();
  const read = useServerFn(getUploadReverseResults);
  const approve = useServerFn(approveUploadReverseSearch);
  const confirm = useServerFn(confirmUploadReverseMatch);
  const key = ["upload-reverse", batchId];
  const { data, error } = useQuery({ queryKey: key, queryFn: () => read({ data: { batchId } }), retry: false });
  const refresh = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["upload-results", batchId] }); };
  const search = useMutation({ mutationFn: () => approve({ data: { batchId, selectedIds: selected, maxLookups: selected.length, maxCostCents: selected.length * 30 } }),
    onSuccess: () => { setSelected([]); setConfirming(false); refresh(); }, onError: (e) => { toast.error(e.message); refresh(); } });
  const match = useMutation({ mutationFn: (propertyId: string) => confirm({ data: { propertyId } }),
    onSuccess: (r) => { toast.success(r.status === "waiting_capacity" ? L("Match kept — waiting for capacity", "Coincidencia guardada — esperando capacidad")
      : r.status === "already_in_book" ? L("Property already in your book", "Propiedad ya en tu cartera")
      : L("Home added — property spending remains unapproved", "Casa agregada — gasto pendiente de aprobación")); setProperty(null); refresh(); },
    onError: (e) => toast.error(e.message) });
  if (error) return <p className="mt-4 text-sm text-destructive">{L("Couldn't load owner-search results.", "No se pudieron cargar los resultados.")}</p>;
  if (!data?.enabled) return null;
  const dollars = (n: number) => `$${(n / 100).toFixed(2)}`;
  const status = (s: string) => ({ matched: L("Matched", "Coincidencia"), no_match: L("No match", "Sin coincidencia"),
    needs_review: L("Needs review", "Requiere revisión"), provider_error: L("Uncertain — held, no retry", "Incierto — retenido, sin reintento"),
    pending: L("Pending — do not retry", "Pendiente — no reintentar"), reserved: L("Reserved — held", "Reservado — retenido"),
    waiting_capacity: L("Waiting for capacity", "Esperando capacidad"), added: L("Added — enrichment approval separate", "Agregado — aprobación separada"),
    already_in_book: L("Already in book", "Ya en tu cartera") }[s] ?? s);
  return <div className="mt-5 border-t border-border pt-5">
    <h3 className="flex items-center gap-2 font-semibold"><Search className="size-4" />{L("Find owned properties", "Buscar propiedades de contactos")}</h3>
    <ul className="mt-3 divide-y divide-border">
      {data.contacts.map((c) => <li key={c.id} className="py-3 text-sm">
        <div className="flex items-start gap-3">
          <Checkbox id={`reverse-${c.id}`} aria-label={L(`Select ${c.name}`, `Seleccionar ${c.name}`)}
            checked={selected.includes(c.id)} disabled={!c.eligible || search.isPending || (!selected.includes(c.id) && selected.length >= 10)}
            onCheckedChange={(checked) => setSelected((v) => checked ? [...v, c.id] : v.filter((id) => id !== c.id))} />
          <div className="min-w-0 flex-1"><label htmlFor={`reverse-${c.id}`} className="font-medium">{c.name}</label>
            <p className="text-xs text-muted-foreground">{c.search ? status(c.search.status) : c.reason ?? L("Ready for owner search", "Listo para búsqueda")}</p>
            {c.search && <>
              <p className="mt-1 text-xs text-muted-foreground">{c.search.estimatedCents === null ? L("Cost uncertain; reserved up to $0.30", "Costo incierto; reservado hasta $0.30")
                : L(`Estimated search cost: ${dollars(c.search.estimatedCents)} · not billing-confirmed`, `Costo estimado: ${dollars(c.search.estimatedCents)} · no confirmado`)}</p>
              {(c.search.persons as any[]).map((p, i) => <div key={i} className="mt-2 text-xs">
                <p className="font-medium">{p.fullName ?? L("Identity uncertain", "Identidad incierta")}</p>
                <ul className="text-muted-foreground">{[p.property?.fullAddress, ...(p.addresses ?? []).map((a: any) => a.fullAddress)]
                  .filter((a, index, all) => a && all.indexOf(a) === index).map((a) => <li key={a}>{a}</li>)}</ul>
              </div>)}
              {c.search.properties.map((p: { id: string; address: string; status: string }) => <div key={p.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
                <span className="min-w-0 break-words">{p.address}<span className="block text-xs text-muted-foreground">{status(p.status)}</span></span>
                {["needs_review", "waiting_capacity"].includes(p.status) && <Button size="sm" variant="outline" disabled={match.isPending}
                  onClick={() => setProperty({ id: p.id, address: p.address })}>{p.status === "waiting_capacity" ? L("Check capacity", "Ver capacidad") : L("Review match", "Revisar coincidencia")}</Button>}
              </div>)}
            </>}
          </div>
        </div>
      </li>)}
    </ul>
    <Button className="mt-3" disabled={!selected.length || search.isPending} onClick={() => setConfirming(true)}>
      <Search className="mr-2 size-4" />{L(`Review ${selected.length} searches · up to ${dollars(selected.length * 30)}`, `Revisar ${selected.length} búsquedas · hasta ${dollars(selected.length * 30)}`)}
    </Button>
    <AlertDialog open={confirming} onOpenChange={setConfirming}><AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{L("Approve owner-search batch?", "¿Aprobar búsquedas de propietarios?")}</AlertDialogTitle>
        <AlertDialogDescription>{L(`${selected.length} searches. Maximum estimated cost ${dollars(selected.length * 30)}: up to 3 returned people per search at $0.10 per person. This is separate from property enrichment; no property lookup is approved. Billing is not provider-confirmed. Uncertain outcomes stay held without retries.`,
          `${selected.length} búsquedas. Costo máximo estimado ${dollars(selected.length * 30)}: hasta 3 personas por búsqueda a $0.10 cada una. Separado del enriquecimiento; no se aprueban búsquedas de propiedades. Facturación no confirmada. Resultados inciertos retenidos sin reintento.`)}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel disabled={search.isPending}>{L("Cancel", "Cancelar")}</AlertDialogCancel>
        <AlertDialogAction disabled={search.isPending} onClick={(e) => { e.preventDefault(); search.mutate(); }}>{L("Approve searches", "Aprobar búsquedas")}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
    <AlertDialog open={!!property} onOpenChange={(v) => { if (!v) setProperty(null); }}><AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{L("Confirm this property association?", "¿Confirmar esta propiedad?")}</AlertDialogTitle>
        <AlertDialogDescription>{property?.address}<br />{L("Confirm only after reviewing identity and ownership. Duplicate properties will not be added. Without capacity, the match stays waiting. Any paid property enrichment needs another approval.",
          "Confirma solo tras revisar identidad y propiedad. No se agregarán duplicados. Sin capacidad, la coincidencia espera. El enriquecimiento pagado requiere otra aprobación.")}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel>{L("Cancel", "Cancelar")}</AlertDialogCancel>
        <AlertDialogAction disabled={match.isPending} onClick={(e) => { e.preventDefault(); if (property) match.mutate(property.id); }}>{L("Confirm association", "Confirmar asociación")}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </div>;
}