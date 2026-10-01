import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Lock, Wrench } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT, type TranslationKey } from "@/lib/i18n";
import { LIFESPANS } from "@/lib/maintenance-rules";
import { getClientHomeSystems, saveClientHomeSystem } from "@/lib/agent-home-systems.functions";
import { HomeSystemHistory } from "@/components/home-system-history";

type Entry = {
  component_key: string;
  action: string;
  installed_year: number | null;
  brand: string | null;
  model: string | null;
  warranty_years: number | null;
  provider: string | null;
  notes: string | null;
  entered_by_role: string;
  entry_kind: string;
};

/** "Update home systems" for an agent, mid-call. Shows nothing until the homeowner allows it. */
export function AgentHomeSystemsButton({ portfolioId, clientId }: { portfolioId: string; clientId: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:border-primary"
      >
        <Wrench className="h-4 w-4 text-primary" /> {t("hs.agent.open")}
      </button>
      {open && (
        <AgentHomeSystemsSheet portfolioId={portfolioId} clientId={clientId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function AgentHomeSystemsSheet({
  portfolioId,
  clientId,
  onClose,
}: {
  portfolioId: string;
  clientId: string;
  onClose: () => void;
}) {
  const t = useT();
  const fetchFn = useServerFn(getClientHomeSystems);
  const key = ["agent-home-systems", portfolioId, clientId];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => fetchFn({ data: { portfolioId, clientId } }),
    staleTime: 0,
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <SheetHeader className="text-left">
          <SheetTitle>{t("hs.agent.title")}</SheetTitle>
          {data?.allowed && <SheetDescription>{t("hs.agent.sub")}</SheetDescription>}
        </SheetHeader>

        {isLoading && <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-muted-foreground" />}

        {data && !data.allowed && (
          <div className="mt-4 rounded-xl border border-border bg-secondary/40 p-4" data-testid="hs-no-permission">
            <p className="flex items-center gap-2 font-semibold">
              <Lock className="h-4 w-4" /> {t("hs.agent.no_permission_title")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.reason === "no_account" ? t("hs.agent.no_account") : t("hs.agent.no_permission")}
            </p>
          </div>
        )}

        {data?.allowed && (
          <div className="mt-3 space-y-2">
            {LIFESPANS.map((sys) => {
              const latest = (data.entries as Entry[]).find((e) => e.component_key === sys.key) ?? null;
              const label = t(`care.system.${sys.key}` as TranslationKey);
              const version = data.versions[sys.key] ?? 0;
              if (editing === sys.key)
                return (
                  <SystemForm
                    key={sys.key}
                    label={label}
                    componentKey={sys.key}
                    initial={latest}
                    version={version}
                    portfolioId={portfolioId}
                    clientId={clientId}
                    queryKey={key}
                    onDone={() => setEditing(null)}
                  />
                );
              return (
                <div key={sys.key} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                  <div className="min-w-0">
                    <p className="font-medium">{label}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {latest
                        ? [latest.installed_year, latest.brand, latest.model].filter(Boolean).join(" · ") || "—"
                        : t("hs.agent.unknown")}
                    </p>
                    {latest?.entered_by_role === "agent" && (
                      <p className="text-xs text-primary">
                        {t(latest.entry_kind === "updated" ? "hs.by_agent_updated" : "hs.by_agent_added")}
                      </p>
                    )}
                  </div>
                  <Button variant="outline" className="min-h-11 shrink-0" onClick={() => setEditing(sys.key)} disabled={!!editing}>
                    {t("hs.agent.edit")}
                  </Button>
                </div>
              );
            })}
            <button className="min-h-11 text-sm font-semibold text-primary" onClick={() => setShowHistory((v) => !v)}>
              {t("hs.agent.history")}
            </button>
            {showHistory && (
              <HomeSystemHistory
                items={data.history.map((h) => ({
                  componentKey: h.component_key,
                  actorRole: h.actor_role,
                  changeKind: h.change_kind,
                  oldValue: h.old_value,
                  newValue: h.new_value,
                  createdAt: h.created_at,
                }))}
              />
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SystemForm({
  label,
  componentKey,
  initial,
  version,
  portfolioId,
  clientId,
  queryKey,
  onDone,
}: {
  label: string;
  componentKey: string;
  initial: Entry | null;
  version: number;
  portfolioId: string;
  clientId: string;
  queryKey: unknown[];
  onDone: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const saveFn = useServerFn(saveClientHomeSystem);
  // Version captured when the form opened — the conflict check compares against this.
  const [seenVersion] = useState(version);
  const [action, setAction] = useState<"replaced" | "serviced">(
    initial?.action === "serviced" ? "serviced" : "replaced",
  );
  const [year, setYear] = useState(initial?.installed_year ? String(initial.installed_year) : "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [warranty, setWarranty] = useState(initial?.warranty_years != null ? String(initial.warranty_years) : "");
  const [provider, setProvider] = useState(initial?.provider ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const thisYear = new Date().getFullYear();
    const y = year.trim() ? Number(year) : null;
    if (y !== null && (!Number.isInteger(y) || y < 1900 || y > thisYear + 1)) {
      setError(t("hs.f.bad_year"));
      return;
    }
    const w = warranty.trim() ? Number(warranty) : null;
    setBusy(true);
    try {
      const res = await saveFn({
        data: {
          portfolioId,
          clientId,
          componentKey,
          action,
          installedYear: y,
          servicedOn: y ? `${y}-01-01` : null,
          brand: brand.trim() || null,
          model: model.trim() || null,
          warrantyYears: w !== null && Number.isInteger(w) && w >= 0 && w <= 50 ? w : null,
          provider: provider.trim() || null,
          notes: notes.trim() || null,
          expectedVersion: seenVersion,
        },
      });
      if (res.ok) {
        toast.success(t("hs.saved", { system: label }));
        await qc.invalidateQueries({ queryKey });
        onDone();
        return;
      }
      if (res.code === "conflict") {
        setError(t("hs.conflict"));
        await qc.invalidateQueries({ queryKey });
        onDone();
        toast.error(t("hs.conflict"));
        return;
      }
      if (res.code === "forbidden") {
        toast.error(t("hs.agent.revoked"));
        await qc.invalidateQueries({ queryKey });
        return;
      }
      setError(t("hs.save_failed"));
    } catch {
      setError(t("hs.save_failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-primary p-3" data-testid={`hs-form-${componentKey}`}>
      <p className="font-semibold">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {(["replaced", "serviced"] as const).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAction(a)}
            aria-pressed={action === a}
            className={`min-h-11 rounded-lg border px-2 text-sm font-medium ${
              action === a ? "border-primary bg-primary/10 text-primary" : "border-border"
            }`}
          >
            {t(a === "replaced" ? "hs.f.replaced" : "hs.f.serviced")}
          </button>
        ))}
      </div>
      <Field id="hs-year" label={t("hs.f.year")}>
        <Input id="hs-year" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field id="hs-brand" label={t("hs.f.brand")}>
          <Input id="hs-brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
        </Field>
        <Field id="hs-model" label={t("hs.f.model")}>
          <Input id="hs-model" value={model} onChange={(e) => setModel(e.target.value)} />
        </Field>
        <Field id="hs-warranty" label={t("hs.f.warranty")}>
          <Input id="hs-warranty" inputMode="numeric" value={warranty} onChange={(e) => setWarranty(e.target.value)} />
        </Field>
        <Field id="hs-provider" label={t("hs.f.provider")}>
          <Input id="hs-provider" value={provider} onChange={(e) => setProvider(e.target.value)} />
        </Field>
      </div>
      <Field id="hs-notes" label={t("hs.f.notes")}>
        <Textarea id="hs-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="min-h-11" onClick={onDone} disabled={busy}>
          {t("hs.f.cancel")}
        </Button>
        <Button className="min-h-11" onClick={save} disabled={busy}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("hs.f.save")}
        </Button>
      </div>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {children}
    </div>
  );
}
