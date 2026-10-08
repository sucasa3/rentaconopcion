import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { syncSubscription } from "@/lib/billing.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowRight,
  Lock,
  Loader2,
  Phone,
  MessageSquare,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { formatLtvPct, formatRatePct } from "@/lib/format-loan";
import { LenderBriefDialog } from "@/components/lender-brief";
import { BulkClientUpload } from "@/components/bulk-client-upload";
import { Button } from "@/components/ui/button";
import { DISCOVERY_ALLOWANCE } from "@/lib/discovery";
import {
  advanceDiscovery,
  getDiscovery,
  startPilotCheckout,
  uploadDiscoveryCsv,
} from "@/lib/discovery.functions";
import { recordAuthenticatedAgentEvent } from "@/lib/agent-funnel.functions";
import { useT, useLanguage } from "@/lib/i18n";

function useL() {
  const { language } = useLanguage();
  return (en: string, es: string) => (language === "es" ? es : en);
}

export const Route = createFileRoute("/_authenticated/lender/discovery")({
  component: DiscoveryPage,
});

function money(cents: number | null | undefined) {
  if (typeof cents !== "number") return null;
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function DiscoveryPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getDiscovery);
  const uploadFn = useServerFn(uploadDiscoveryCsv);
  const advanceFn = useServerFn(advanceDiscovery);
  const pilotFn = useServerFn(startPilotCheckout);
  const track = useServerFn(recordAuthenticatedAgentEvent);
  const tr = useT();
  const L = useL();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const polling = useRef(false);
  const [brief, setBrief] = useState<any>(null);
  const [checkoutOk, setCheckoutOk] = useState(false);
  const syncFn = useServerFn(syncSubscription);
  const snapshot = useQuery({
    queryKey: ["lender-discovery"],
    queryFn: () => getFn({}),
  });
  const synced = useRef(false);
  const orgIdForSync = (snapshot.data as any)?.orgId as string | undefined;
  useEffect(() => {
    // Returning from checkout only counts once Stripe itself confirms the
    // subscription; the URL alone never activates or records anything.
    if (synced.current || !orgIdForSync) return;
    if (new URLSearchParams(window.location.search).get("checkout") !== "success") return;
    synced.current = true;
    void (async () => {
      try {
        const r: any = await syncFn({ data: { orgId: orgIdForSync } });
        if (r?.activated) {
          setCheckoutOk(true);
          void track({ data: { action: "lender_activation_completed" } });
          await qc.invalidateQueries({ queryKey: ["lender-discovery"] });
        }
      } catch {
        /* the webhook will still activate the account */
      }
    })();
  }, [orgIdForSync]);

  const data = snapshot.data as any;
  const status: string = data?.status ?? "awaiting_upload";

  const upload = useMutation({
    mutationFn: (csv: string) => uploadFn({ data: { csv } }),
    onSuccess: async (r: any) => {
      toast.success(L(`${r.accepted} properties accepted`, `${r.accepted} propiedades aceptadas`));
      await qc.invalidateQueries({ queryKey: ["lender-discovery"] });
      void runProcessing();
    },
    onError: (e: any) => toast.error(e.message),
  });

  async function runProcessing() {
    if (polling.current) return;
    polling.current = true;
    void track({ data: { action: "lender_discovery_processing_viewed" } });
    try {
      for (let i = 0; i < 400; i += 1) {
        const tick: any = await advanceFn({});
        if (tick.status === "awaiting_upload") break;
        setProgress({ done: tick.done, total: tick.total });
        if (tick.status === "complete") {
          void track({ data: { action: "lender_discovery_completed" } });
          break;
        }
        await new Promise((r) => setTimeout(r, 1200));
      }
    } catch (e: any) {
      toast.error(e?.message ?? L("Processing stopped", "El análisis se detuvo"));
    } finally {
      polling.current = false;
      setProgress(null);
      await qc.invalidateQueries({ queryKey: ["lender-discovery"] });
    }
  }

  useEffect(() => {
    if (status === "processing" && !polling.current) void runProcessing();
  }, [status]);

  useEffect(() => {
    if (status !== "complete") return;
    const revealed = (data?.revealed ?? []).length;
    void track({
      data: {
        action: revealed ? "lender_discovery_revealed" : "lender_discovery_empty_result",
      },
    });
    void track({ data: { action: "lender_pilot_offer_viewed" } });
    void track({ data: { action: "lender_discovery_results_viewed" } });
  }, [status, data?.revealed?.length]);

  const pilot = useMutation({
    mutationFn: () => pilotFn({ data: { returnUrl: window.location.href } }),
    onSuccess: (r: any) => {
      if (r?.url) window.open(r.url, "_blank");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (snapshot.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const lockedMix: { key: string; label: string; count: number }[] = (data?.groups ?? [])
    .map((g: any) => ({
      key: g.key,
      label: g.label,
      count:
        g.count - (data?.revealed ?? []).filter((r: any) => r.primaryGroup === g.key).length,
    }))
    .filter((g: any) => g.count > 0);

  const busy = upload.isPending || progress !== null || status === "processing";

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-16">
      <header>
        <p className="text-sm font-semibold text-status-opportunity">{L("Opportunity Discovery", "Discovery de oportunidades")}</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">
          {status === "complete"
            ? L("Your Discovery results", "Tus resultados de Discovery")
            : L("See what's inside your past-client database", "Descubre lo que hay en tu base de clientes anteriores")}
        </h1>
        <Link to="/lender/billing" search={{ checkout: undefined, plan: undefined }} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary underline">
          {tr("disc.skip")} <ArrowRight className="h-4 w-4" />
        </Link>
        {false ? (
          <p className="mt-2 text-sm text-muted-foreground">{data.supporting}</p>
        ) : null}
      </header>

      {busy ? (
        <section className="rounded-3xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">{L("Reading property records", "Leyendo registros de propiedad")}</p>
              <p className="text-xs text-muted-foreground">
                {progress
                  ? L(`${progress.done} of ${progress.total} properties reviewed`, `${progress.done} de ${progress.total} propiedades revisadas`)
                  : L("Getting started", "Comenzando")}
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {L("You can leave this page open. Nothing is sent to any homeowner.", "Puedes dejar esta página abierta. No se envía nada a ningún propietario.")}
          </p>
        </section>
      ) : null}

      {!busy && status !== "complete" ? (
        <section className="rounded-3xl border border-border bg-card p-6 shadow-soft">
          <h2 className="text-base font-semibold text-foreground">
            {L(`Upload up to ${DISCOVERY_ALLOWANCE} past clients`, `Sube hasta ${DISCOVERY_ALLOWANCE} clientes anteriores`)}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {L(`A CSV or Excel export from your CRM. Name and property address are what matter — everything else is optional. Rows without a usable address, and repeats of the same property, don't count against your ${DISCOVERY_ALLOWANCE}.`, `Una exportación CSV o Excel de tu CRM. Lo importante es el nombre y la dirección de la propiedad — todo lo demás es opcional. Las filas sin una dirección válida y las propiedades repetidas no cuentan para tus ${DISCOVERY_ALLOWANCE}.`)}
          </p>
          <div className="mt-4">
            <BulkClientUpload
              onCsv={(csv) => upload.mutate(csv)}
              busy={upload.isPending}
              title={L("Upload your past-client list", "Sube tu lista de clientes anteriores")}
              hint={L("CSV or Excel, up to 2 MB", "CSV o Excel, hasta 2 MB")}
            />
          </div>
          <div className="mt-5 flex gap-3 rounded-lg border border-surface-intelligence-border bg-surface-intelligence p-4 text-xs text-surface-intelligence-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0 text-intelligence-accent" />
            <span>
              {L("Your list stays inside your own workspace. Uploading creates no relationship, no permission and no access to any homeowner.", "Tu lista se queda dentro de tu propio espacio de trabajo. Subirla no crea ninguna relación, permiso ni acceso a ningún propietario.")}
            </span>
          </div>
        </section>
      ) : null}

      {status === "complete" ? (
        <>
          {data.excluded?.submitted ? (
            <p className="text-xs text-muted-foreground">
              {L(`${data.excluded.submitted} rows submitted · ${data.summary?.analyzed ?? 0} unique properties analyzed`, `${data.excluded.submitted} filas enviadas · ${data.summary?.analyzed ?? 0} propiedades únicas analizadas`)}
              {data.excluded.invalid ? L(` · ${data.excluded.invalid} without a usable address`, ` · ${data.excluded.invalid} sin dirección válida`) : ""}
              {data.excluded.duplicate ? L(` · ${data.excluded.duplicate} repeat properties`, ` · ${data.excluded.duplicate} propiedades repetidas`) : ""}
              {data.excluded.overAllowance
                ? L(` · ${data.excluded.overAllowance} beyond your ${data.allowance}`, ` · ${data.excluded.overAllowance} por encima de tus ${data.allowance}`)
                : ""}
            </p>
          ) : null}

          {(() => {
            const found = data.summary?.clientsWithOpportunities ?? 0;
            const analyzed = data.summary?.analyzed ?? 0;
            return (
              <section className="rounded-3xl border border-border bg-card p-6 shadow-soft">
                <p className="text-sm text-muted-foreground">{L(`We analyzed ${analyzed} homeowners.`, `Analizamos ${analyzed} propietarios.`)}</p>
                <p className="mt-1 text-xl font-semibold text-foreground">
                  {found === 0
                    ? L("None has a reason worth reviewing today.", "Ninguno tiene hoy un motivo que valga la pena revisar.")
                    : L(`${found} ${found === 1 ? "has a reason" : "have a reason"} worth reviewing.`, `${found} ${found === 1 ? "tiene un motivo" : "tienen un motivo"} que vale la pena revisar.`)}
                </p>
                {data.revealed.length ? (
                  <p className="mt-1 text-sm text-foreground">
                    {L(`You can explore ${data.revealed.length} below.`, `Puedes explorar ${data.revealed.length} abajo.`)}
                  </p>
                ) : null}
                <p className="mt-3 text-xs text-muted-foreground">
                  {L("SuCasa looks for changes in mortgage, equity and property signals that may give you a reason to reconnect. These are signals worth reviewing — not a statement that anyone qualifies for or needs a loan.", "SuCasa busca cambios en la hipoteca, el capital y las señales de la propiedad que puedan darte un motivo para reconectar. Son señales que vale la pena revisar — no una afirmación de que alguien califica para un préstamo o lo necesita.")}
                </p>
              </section>
            );
          })()}


          {data.groups?.length ? (
            <section className="grid gap-3 sm:grid-cols-2">
              {data.groups.map((g: any) => (
                <div key={g.key} className="rounded-2xl border border-border bg-card p-4">
                  <p className="text-2xl font-semibold text-foreground">{g.count}</p>
                  <p className="text-sm font-medium text-foreground">{g.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{g.blurb}</p>
                </div>
              ))}
            </section>
          ) : null}

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">
              {data.revealed.length
                ? L(`Your top ${data.revealed.length} unlocked now`, `Tus ${data.revealed.length} principales, desbloqueados ahora`)
                : L("Nothing meets the bar yet", "Todavía nada alcanza el nivel")}
            </h2>
            {data.revealed.length === 0 ? (
              <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
                {L("We won't lower the bar to fill five slots. Nothing in this list has enough confirmed record detail to justify a call today. Add more of your past clients, or come back as records update.", "No bajaremos el nivel para llenar cinco lugares. Nada en esta lista tiene suficiente detalle confirmado en los registros para justificar una llamada hoy. Agrega más clientes anteriores o vuelve cuando se actualicen los registros.")}
              </p>
            ) : null}
            {data.revealed.map((c: any) => (
              <DiscoveryCard
                key={c.id}
                onView={() => void track({ data: { action: "lender_discovery_opportunity_opened" } })}
                c={c}
                onBrief={() => {
                  setBrief(c);
                  void track({ data: { action: "lender_discovery_brief_opened" } });
                }}
              />
            ))}
          </section>

          {data.activated || checkoutOk ? (
            <section className="rounded-3xl border border-border bg-card p-6 shadow-soft">
              <p className="text-sm font-semibold text-status-positive">{L("SuCasa is active", "SuCasa está activo")}</p>
              <h2 className="mt-1 text-xl font-semibold text-foreground">
                {L("Now let SuCasa analyze the rest of your book.", "Ahora deja que SuCasa analice el resto de tu cartera.")}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {L(`You found opportunities in your Discovery sample. Upload your complete database and SuCasa will analyze it with the same intelligence. The ${data.summary?.analyzed ?? 0} homes already here stay in place — repeats aren't counted twice.`, `Encontraste oportunidades en tu muestra de Discovery. Sube tu base de datos completa y SuCasa la analizará con la misma inteligencia. Las ${data.summary?.analyzed ?? 0} casas que ya están aquí se quedan — las repetidas no se cuentan dos veces.`)}
              </p>
              <Button asChild className="mt-5">
                <Link to="/lender/portfolio/$id/import" params={{ id: data.portfolioId }}>
                  <ArrowRight className="mr-2 h-4 w-4" /> {L("Upload My Full Database", "Subir mi base de datos completa")}
                </Link>
              </Button>
            </section>
          ) : (
            <section className="rounded-3xl border border-border bg-card p-6 shadow-soft">
              <Lock className="h-5 w-5 text-muted-foreground" />
              <h2 className="mt-3 text-lg font-semibold text-foreground">
                {data.revealed.length ? L(`You've seen ${data.revealed.length}.`, `Has visto ${data.revealed.length}.`) : L("There's more to find.", "Hay más por descubrir.")}
              </h2>
              {data.summary?.previewOnly > 0 ? (
                <p className="mt-1 text-base font-semibold text-foreground">
                  {L(`SuCasa found ${data.summary.previewOnly} additional ${data.summary.previewOnly === 1 ? "homeowner" : "homeowners"} worth reviewing.`, `SuCasa encontró ${data.summary.previewOnly} ${data.summary.previewOnly === 1 ? "propietario adicional que vale" : "propietarios adicionales que valen"} la pena revisar.`)}
                </p>
              ) : null}
              <p className="mt-2 text-sm text-muted-foreground">
                {L("Activate SuCasa to unlock the rest of this Discovery and begin monitoring your database for new opportunities.", "Activa SuCasa para desbloquear el resto de este Discovery y empezar a monitorear tu base de datos en busca de nuevas oportunidades.")}
              </p>
              {lockedMix.length ? (
                <ul className="mt-4 space-y-1 text-sm text-foreground">
                  {lockedMix.map((g) => (
                    <li key={g.key} className="flex items-center gap-2">
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                      {g.count} {g.label}
                    </li>
                  ))}
                </ul>
              ) : null}
              <Button
                className="mt-6"
                onClick={() => {
                  void track({ data: { action: "lender_activation_clicked" } });
                  pilot.mutate();
                }}
                disabled={pilot.isPending}
              >
                {pilot.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="mr-2 h-4 w-4" />
                )}
                {L("Unlock My Database", "Desbloquear mi base de datos")}
              </Button>
              <p className="mt-2 text-sm text-muted-foreground">
                {L("Unlock the remaining Discovery opportunities and let SuCasa continuously analyze your database for meaningful reasons to reconnect.", "Desbloquea las oportunidades restantes de Discovery y deja que SuCasa analice tu base de datos continuamente en busca de motivos reales para reconectar.")}
              </p>
              {money(data.pricing?.pilotCents) && money(data.pricing?.growthCents) ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {L(`90-day pilot: ${money(data.pricing.pilotCents)} today, then ${money(data.pricing.growthCents)}/month. Cancel any time during the pilot.`, `Piloto de 90 días: ${money(data.pricing.pilotCents)} hoy, luego ${money(data.pricing.growthCents)}/mes. Cancela cuando quieras durante el piloto.`)}
                </p>
              ) : null}
              <div className="mt-6 border-t border-border pt-5">
                <h3 className="text-sm font-semibold text-foreground">{L("After activation", "Después de activar")}</h3>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>{L("Unlock the remaining opportunities from this Discovery", "Desbloquea las oportunidades restantes de este Discovery")}</li>
                  <li>{L("Upload your complete past-client database", "Sube tu base completa de clientes anteriores")}</li>
                  <li>{L("SuCasa creates and watches a Home Profile for each home", "SuCasa crea y vigila un Perfil de casa para cada casa")}</li>
                  <li>{L("Your daily list shows the people who deserve attention", "Tu lista diaria muestra a las personas que merecen atención")}</li>
                  <li>{L("SuCasa explains why they matter and helps prepare the conversation", "SuCasa explica por qué importan y te ayuda a preparar la conversación")}</li>
                </ol>
              </div>
            </section>
          )}
        </>
      ) : null}
      <LenderBriefDialog
        clientId={brief?.id ?? null}
        name={brief?.name ?? null}
        subtitle={brief?.address ?? null}
        email={brief?.email ?? null}
        phone={brief?.phone ?? null}
        onClose={() => setBrief(null)}
      />
    </div>
  );
}


function DiscoveryCard({ c, onBrief, onView }: { c: any; onBrief: () => void; onView: () => void }) {
  const L = useL();
  const reasons: string[] = (c.reasons ?? [])
    .filter((r: string) => r.trim() !== (c.whyToday ?? "").trim())
    .slice(0, 3);
  const metrics = [
    { label: L("Estimated value", "Valor estimado"), value: money(c.estimatedValueCents) },
    {
      label: c.equityInferredNoLien ? L("Estimated equity (no active loan found)", "Capital estimado (sin préstamo activo)") : L("Estimated equity", "Capital estimado"),
      value: money(c.estimatedEquityCents),
    },
    { label: L("Estimated balance", "Saldo estimado"), value: c.equityInferredNoLien ? null : money(c.estimatedBalanceCents) },
    { label: L("Estimated LTV", "LTV estimado"), value: c.equityInferredNoLien ? null : formatLtvPct(c.estimatedLtvPct) },
    { label: L("Recorded rate", "Tasa registrada"), value: formatRatePct(c.recordedRatePct) },
    {
      label: L("Mortgage age", "Antigüedad de la hipoteca"),
      value: typeof c.loanAgeYears === "number" ? L(`${c.loanAgeYears} yrs`, `${c.loanAgeYears} años`) : null,
    },
  ].filter((m) => m.value);
  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-soft" onClick={onView}>
      {c.categoryLabel ? (
        <span className="inline-flex rounded-full bg-surface-intelligence px-2.5 py-1 text-xs font-semibold text-intelligence-accent">
          {c.categoryLabel}
        </span>
      ) : null}
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground">{c.name}</h3>
        <span className="text-xs text-muted-foreground">{c.address}</span>
      </div>
      {c.whyToday ? (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{L("Why now", "Por qué ahora")}</p>
          <p className="mt-1 text-sm text-foreground">{c.whyToday}</p>
        </div>
      ) : null}
      {reasons.length ? (
        <ul className="mt-3 space-y-1 text-sm text-foreground">
          {reasons.map((r) => (
            <li key={r} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-intelligence-accent" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {(c.alsoReasons ?? []).length ? (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {L("Also worth knowing", "También vale la pena saber")}
          </p>
          <ul className="mt-1 space-y-1 text-sm text-foreground">
            {c.alsoReasons.map((r: any) => (
              <li key={r.label} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                <span>
                  <span className="font-medium">{r.label}:</span> {r.why}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {metrics.length ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-surface p-3 sm:grid-cols-3">
          {metrics.map((m) => (
            <div key={m.label}>
              <dt className="text-[11px] text-muted-foreground">{m.label}</dt>
              <dd className="text-sm font-semibold text-foreground">{m.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {c.objective ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {L("What to accomplish", "Qué lograr")}
          </p>
          <p className="mt-1 text-sm text-foreground">{c.objective}</p>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2 text-xs">
          {[
            { key: "call", label: L("Call", "Llamar"), Icon: Phone },
            { key: "text", label: L("Text", "Mensaje"), Icon: MessageSquare },
            { key: "email", label: L("Email", "Correo"), Icon: Mail },
          ].map(({ key, label, Icon }) => {
            const allowed = Boolean(c.channels?.[key]);
            return (
              <span
                key={key}
                title={c.channelReasons?.[key] ?? undefined}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 ${
                  allowed
                    ? "border-status-positive/40 text-status-positive"
                    : "border-border text-muted-foreground"
                }`}
              >
                <Icon className="h-3 w-3" /> {label}
              </span>
            );
          })}
        </div>
        <Button size="sm" variant="outline" onClick={onBrief}>
          {L("30-Second Brief", "Resumen de 30 segundos")} <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </article>
  );
}
