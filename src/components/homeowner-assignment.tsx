import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/lib/i18n";
import { listMyPortfolios } from "@/lib/lender.functions";
import { assignHomeowners } from "@/lib/lead-assignment.functions";

export function HomeownerAssignment({ portfolioId, orgId, clients }: {
  portfolioId: string; orgId: string;
  clients: { id: string; full_name: string; address: string | null }[];
}) {
  const { language } = useLanguage();
  const L = (en: string, es: string) => language === "es" ? es : en;
  const list = useServerFn(listMyPortfolios);
  const assign = useServerFn(assignHomeowners);
  const qc = useQueryClient();
  const { data: roster } = useQuery({ queryKey: ["lender-portfolios"], queryFn: () => list() });
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState("");
  const [search, setSearch] = useState("");
  const members = (roster?.members ?? []).filter((m: any) => m.org_id === orgId &&
    roster?.portfolios.some((p: any) => p.lender_org_id === orgId && p.assigned_user_id === m.user_id && p.id !== portfolioId));
  const canAssign = roster?.isTeamManager && roster.orgs.some((o: any) => o.id === orgId && ["owner", "admin", "manager"].includes(o.role));
  const rows = useMemo(() => clients.filter(c => `${c.full_name} ${c.address ?? ""}`.toLowerCase().includes(search.toLowerCase())), [clients, search]);
  const mutation = useMutation({
    mutationFn: () => assign({ data: { sourcePortfolioId: portfolioId, clientIds: selected, targetUserId: target } }),
    onSuccess: async (result) => {
      toast.success(L(`${result.assigned} homeowners assigned`, `Se asignaron ${result.assigned} propietarios`));
      setSelected([]); setTarget(""); setOpen(false);
      await Promise.all(["lender-portfolio", "lender-portfolios", "business-overview", "lender-workspace", "lender-today", "business-funnel"].map(key => qc.invalidateQueries({ queryKey: [key] })));
    },
    onError: (error) => toast.error(L("Nothing was moved. Refresh or check the destination book.", "No se movió ningún propietario. Actualiza o revisa la cartera de destino."), { description: error.message }),
  });
  if (!canAssign) return null;
  return <>
    <Button variant="outline" onClick={() => { setSelected([]); setSearch(""); setTarget(""); setOpen(true); }} disabled={!clients.length || !members.length}>
      <UserRoundPlus />{L("Assign to team member", "Asignar a un miembro del equipo")}
    </Button>
    <Dialog open={open} onOpenChange={value => { if (!mutation.isPending) setOpen(value); }}>
      <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-lg">
        <DialogTitle>{L("Assign homeowners", "Asignar propietarios")}</DialogTitle>
        <DialogDescription>{L("Move selected homeowners into a team member’s personal book. Existing information stays intact; consent and contact permissions do not change.", "Mueve los propietarios seleccionados a la cartera personal de un miembro del equipo. Su información se conserva; el consentimiento y los permisos de contacto no cambian.")}</DialogDescription>
        <label className="grid gap-1 text-sm font-medium">
          {L("Assign to", "Asignar a")}
          <select aria-label={L("Assign to", "Asignar a")} className="h-10 w-full rounded-md border border-input bg-background px-3 text-foreground" value={target} onChange={e => setTarget(e.target.value)} disabled={mutation.isPending}>
            <option value="">{L("Choose a team member", "Elige un miembro del equipo")}</option>
            {members.map((m: any) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
          </select>
        </label>
        <input aria-label={L("Search homeowners", "Buscar propietarios")} placeholder={L("Search homeowners", "Buscar propietarios")} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>{L(`${selected.length} selected`, `${selected.length} seleccionados`)}</span>
          <Button variant="ghost" size="sm" disabled={mutation.isPending} onClick={() => setSelected(rows.slice(0,500).map(c => c.id))}>{L("Select matching", "Seleccionar resultados")}</Button>
          <Button variant="ghost" size="sm" disabled={mutation.isPending} onClick={() => setSelected([])}>{L("Clear", "Limpiar")}</Button>
        </div>
        <div className="max-h-64 overflow-y-auto divide-y divide-border rounded-md border border-border">
          {rows.map(c => <label key={c.id} className="flex cursor-pointer items-center gap-3 p-3">
            <input type="checkbox" aria-label={c.full_name} checked={selected.includes(c.id)} disabled={mutation.isPending || (!selected.includes(c.id) && selected.length >= 500)} onChange={e => setSelected(prev => e.target.checked ? [...prev,c.id] : prev.filter(id => id !== c.id))} className="h-4 w-4 shrink-0 accent-primary" />
            <span className="min-w-0 text-sm"><span className="block break-words font-medium">{c.full_name}</span><span className="block break-words text-xs text-muted-foreground">{c.address}</span></span>
          </label>)}
          {!rows.length && <p className="p-3 text-sm text-muted-foreground">{L("No matching homeowners", "No se encontraron propietarios")}</p>}
        </div>
        <Button disabled={!target || !selected.length || mutation.isPending} onClick={() => mutation.mutate()} className="h-auto min-h-10 whitespace-normal">
          <UserRoundPlus />{mutation.isPending ? L("Assigning…", "Asignando…") : L(`Confirm assignment (${selected.length})`, `Confirmar asignación (${selected.length})`)}
        </Button>
      </DialogContent>
    </Dialog>
  </>;
}