import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Link2, UserCheck, Wrench, Copy } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { createClaimLink, getClaimStatus } from "@/lib/homeowner-claim.functions";

const STATE: Record<string, string> = {
  none: "No invitation yet",
  link_copied: "Link created — not claimed yet (we don't know if it was sent)",
  expired: "Link expired — not claimed",
  replaced: "Older link replaced",
  claimed: "Claimed by homeowner",
};
const CONN: Record<string, string> = {
  accepted: "Connected with you",
  declined: "Declined connection",
  conflict: "Already linked to another account — not changed",
};

export function HomeownerInviteCard({ clientId, panel = false }: { clientId: string; panel?: boolean }) {
  const { language } = useLanguage();
  const es = panel && language === "es";
  const label = (en: string, spanish: string) => es ? spanish : en;
  const qc = useQueryClient();
  const statusFn = useServerFn(getClaimStatus);
  const createFn = useServerFn(createClaimLink);
  const [copied, setCopied] = useState<string | null>(null);
  const { data: s, isLoading, error } = useQuery({ queryKey: ["claim-status", clientId], queryFn: () => statusFn({ data: { clientId } }) });
  const create = useMutation({
    mutationFn: () => createFn({ data: { clientId, origin: window.location.origin } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["claim-status", clientId] }),
  });
  const copy = async (text: string, label: string) => { await navigator.clipboard.writeText(text); setCopied(label); };

  return (
    <div className={panel ? "space-y-2" : "rounded-xl border border-border p-4 space-y-3"}>
      <p className="text-sm font-medium">{label("Homeowner invitation", "Invitación al propietario")}</p>
      {panel && (isLoading ? <p className="text-sm text-muted-foreground">{label("Loading status…", "Cargando estado…")}</p> : error ? <p className="text-sm text-destructive">{label("Invitation status unavailable.", "Estado de invitación no disponible.")}</p> : <div className="flex flex-wrap gap-2" aria-label={label("Connection status", "Estado de conexión")}>
        {([
          [label("Claimed", "Reclamado"), s?.state === "claimed", UserCheck],
          [label("Connected", "Conectado"), s?.connection === "accepted", Link2],
          [label("Activated", "Activado"), Boolean(s?.activated), Wrench],
        ] as const).map(([text, complete, Icon]) => <Badge key={text} variant="outline" className={complete ? "gap-1.5 border-status-positive/30 bg-status-positive/10 py-1 text-foreground" : "gap-1.5 bg-muted py-1 text-foreground"} aria-label={`${text}: ${complete ? label("complete", "completo") : label("pending", "pendiente")}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" />{text}{complete ? <CheckCircle2 className="h-3.5 w-3.5 text-status-positive" aria-hidden="true" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}</Badge>)}
      </div>)}
      {(!panel || (s?.state !== "claimed" && !isLoading && !error)) && <p className="text-sm text-muted-foreground">{es ? ({none: "Aún no hay invitación", link_copied: "Enlace creado — aún no reclamado", expired: "Enlace vencido — no reclamado", replaced: "Enlace anterior reemplazado", claimed: "Reclamado por el propietario"}[s?.state ?? "none"]) : STATE[s?.state ?? "none"]}</p>}
      {s?.connection && (!panel || s.connection !== "accepted") && <p className="text-sm">{label("Connection", "Conexión")}: {es ? ({accepted: "Conectado contigo", declined: "Conexión rechazada", conflict: "Ya está vinculado a otra cuenta — sin cambios"}[s.connection]) : CONN[s.connection]}</p>}
      {s?.state === "claimed" && (!panel || !s.activated) && <p className="text-sm text-muted-foreground">{s.activated ? "Activated (home confirmed + first maintenance saved)" : s.homeCorrected ? label("Not activated — homeowner corrected the address, needs review", "No activado — el propietario corrigió la dirección; requiere revisión") : label("Not activated yet", "Aún no activado")}</p>}
      {s?.state !== "claimed" && (
        <Button size="sm" variant={panel ? "default" : "outline"} disabled={create.isPending} onClick={() => create.mutate()} className={panel ? "min-h-10 bg-action-primary text-action-primary-foreground" : undefined}>
          {panel && <Link2 aria-hidden="true" />}{create.data ? label("Create new link", "Crear otro enlace") : label("Create invite link", "Crear enlace de invitación")}
        </Button>
      )}
      {create.error && <p className="text-sm text-destructive">{(create.error as Error).message}</p>}
      {create.data && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => copy(create.data.url, "link")}>{panel && <Copy />}{label("Copy link", "Copiar enlace")}</Button>
          <Button size="sm" variant="outline" onClick={() => copy(create.data.messages.en, "en")}>{label("Copy English text", "Copiar texto en inglés")}</Button>
          <Button size="sm" variant="outline" onClick={() => copy(create.data.messages.es, "es")}>Copiar texto en español</Button>
          {copied && <p className="w-full text-xs text-muted-foreground">{label("Copied. Nothing is sent automatically — share it yourself.", "Copiado. No se envía nada automáticamente — compártelo tú.")}</p>}
        </div>
      )}
    </div>
  );
}
