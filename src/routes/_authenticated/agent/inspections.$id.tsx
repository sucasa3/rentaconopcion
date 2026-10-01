import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, FileText, Loader2, RotateCcw, Upload } from "lucide-react";
import { BusinessShell } from "@/components/business-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";
import {
  agentApplyReportSystems,
  confirmInspectionFiles,
  createInspectionBatch,
  getInspectionFileUrl,
  listAssignableClients,
  listInspectionBatches,
  processInspectionBatch,
  retryInspectionFile,
  uploadInspectionFile,
  type BatchFileView,
} from "@/lib/inspection-batch.functions";

export const Route = createFileRoute("/_authenticated/agent/inspections/$id")({
  head: () => ({
    meta: [
      { title: "Upload inspection reports — SuCasa" },
      { name: "description", content: "Upload inspection reports in bulk and match them to your clients' homes." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InspectionsPage,
});

const KEY = ["inspection-batches"];

function InspectionsPage() {
  const { id } = Route.useParams();
  const t = useT();
  const qc = useQueryClient();
  const listFn = useServerFn(listInspectionBatches);
  const createFn = useServerFn(createInspectionBatch);
  const uploadFn = useServerFn(uploadInspectionFile);
  const processFn = useServerFn(processInspectionBatch);
  const confirmFn = useServerFn(confirmInspectionFiles);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [rejected, setRejected] = useState<{ filename: string; reason?: string }[]>([]);

  const q = useQuery({ queryKey: KEY, queryFn: () => listFn() });
  const files: BatchFileView[] = q.data?.files ?? [];
  const limits = q.data?.limits;
  const active = files.filter((f) => f.status === "queued" || f.status === "processing");

  // Drive processing while work remains; state lives in the database so refresh resumes.
  useEffect(() => {
    if (!active.length) return;
    const timer = setInterval(async () => {
      try {
        await processFn().catch(() => undefined);
      } finally {
        qc.invalidateQueries({ queryKey: KEY });
      }
    }, 2500);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.length]);

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    const arr = Array.from(list);
    setRejected([]);
    setUploading({ done: 0, total: arr.length });
    try {
      const { batchId } = await createFn();
      const bad: { filename: string; reason?: string }[] = [];
      for (let i = 0; i < arr.length; i++) {
        const fd = new FormData();
        fd.append("batchId", batchId);
        fd.append("file", arr[i]);
        try {
          const r = await uploadFn({ data: fd });
          bad.push(...r.results.filter((x) => !x.ok));
        } catch {
          bad.push({ filename: arr[i].name, reason: "storage" });
        }
        setUploading({ done: i + 1, total: arr.length });
      }
      setRejected(bad);
      await processFn().catch(() => undefined);
    } catch (e: any) {
      toast.error(t("insp.err.generic"));
    } finally {
      setUploading(null);
      if (inputRef.current) inputRef.current.value = "";
      qc.invalidateQueries({ queryKey: KEY });
    }
  }

  const bulk = files.filter((f) => f.status === "ready" && f.matchStatus === "exact" && !f.duplicate && !f.attachState);
  const confirm = useMutation({
    mutationFn: (items: { fileId: string; clientId?: string }[]) => confirmFn({ data: { items } }),
    onSuccess: (r) => {
      const c = (k: string) => r.outcomes.filter((o) => o.result === k).length;
      toast.success(t("insp.confirm_summary", { attached: c("attached"), pending: c("pending_permission"), inbox: c("no_homeowner") }));
      qc.invalidateQueries({ queryKey: KEY });
    },
    onError: () => toast.error(t("insp.err.generic")),
  });

  return (
    <BusinessShell kind="agent" bookId={id}>
      <main className="px-4 py-6 pb-28 sm:px-5 sm:py-8">
        <div className="mx-auto max-w-3xl space-y-5">
          <Link to="/agent/portfolio/$id" params={{ id }} className="inline-flex items-center gap-1 text-xs font-medium text-primary">
            <ArrowLeft className="h-3 w-3" /> {t("insp.back")}
          </Link>
          <header>
            <h1 className="text-2xl font-semibold tracking-tight">{t("insp.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("insp.subtitle")}</p>
          </header>

          <section className="rounded-2xl border border-border bg-card p-4">
            {limits && (
              <p className="text-xs text-muted-foreground">
                {t("insp.limits", {
                  files: limits.maxFilesPerBatch,
                  mb: Math.round(limits.maxFileBytes / 1048576),
                  pages: limits.maxPages,
                  zipEntries: limits.maxZipEntries,
                })}
              </p>
            )}
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.zip,application/pdf,application/zip"
              className="hidden"
              onChange={(e) => onFiles(e.target.files)}
            />
            <Button className="mt-3 w-full sm:w-auto" disabled={!!uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {uploading ? t("insp.uploading", { done: uploading.done, total: uploading.total }) : t("insp.cta")}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">{t("insp.privacy")}</p>
            {rejected.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-destructive">
                {rejected.map((r, i) => (
                  <li key={i}>
                    {r.filename}: {t(`insp.reject.${r.reason ?? "storage"}` as any)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {active.length > 0 && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("insp.processing", { count: active.length })}
            </p>
          )}

          {bulk.length > 0 && (
            <div className="sticky bottom-20 z-10 rounded-2xl border border-primary/30 bg-card p-3 shadow-sm">
              <Button
                className="w-full"
                disabled={confirm.isPending}
                onClick={() => confirm.mutate(bulk.map((f) => ({ fileId: f.id })))}
              >
                {confirm.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("insp.confirm_all", { count: bulk.length })}
              </Button>
              <p className="mt-1 text-center text-xs text-muted-foreground">{t("insp.confirm_note")}</p>
            </div>
          )}

          {q.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : files.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("insp.empty")}</p>
          ) : (
            <ul className="space-y-3">
              {files.map((f) => (
                <FileCard key={f.id} f={f} onConfirm={(clientId) => confirm.mutate([{ fileId: f.id, clientId }])} busy={confirm.isPending} />
              ))}
            </ul>
          )}
        </div>
      </main>
    </BusinessShell>
  );
}

function statusKey(f: BatchFileView): { key: string; tone: "ok" | "warn" | "bad" | "muted" } {
  if (f.attachState === "attached") return { key: "attached", tone: "ok" };
  if (f.attachState === "pending_permission") return { key: "pending_permission", tone: "warn" };
  if (f.attachState === "no_homeowner") return { key: "no_homeowner", tone: "muted" };
  if (f.attachState === "declined") return { key: "declined", tone: "muted" };
  if (f.status === "queued" || f.status === "processing") return { key: "processing", tone: "muted" };
  if (f.status === "unreadable") return { key: "unreadable", tone: "warn" };
  if (f.status === "failed") return { key: f.error === "ai_paused" ? "paused" : "failed", tone: "bad" };
  if (f.duplicate) return { key: "duplicate", tone: "warn" };
  return { key: f.matchStatus ?? "unmatched", tone: f.matchStatus === "exact" ? "ok" : "warn" };
}

function FileCard({ f, onConfirm, busy }: { f: BatchFileView; onConfirm: (clientId?: string) => void; busy: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const retryFn = useServerFn(retryInspectionFile);
  const urlFn = useServerFn(getInspectionFileUrl);
  const applyFn = useServerFn(agentApplyReportSystems);
  const searchFn = useServerFn(listAssignableClients);
  const [pick, setPick] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ applied: string[]; unchanged: string[]; needsApproval: { key: string }[]; skippedOlder: string[]; conflicts: string[] } | null>(null);
  const [search, setSearch] = useState("");
  const s = statusKey(f);
  const tone = { ok: "text-status-positive", warn: "text-status-attention", bad: "text-destructive", muted: "text-muted-foreground" }[s.tone];
  const needsIndividual = f.status === "ready" && !f.attachState && (f.matchStatus !== "exact" || f.duplicate);
  const results = useQuery({
    queryKey: ["insp-assign", search],
    queryFn: () => searchFn({ data: { q: search } }),
    enabled: needsIndividual && f.matchStatus === "unmatched" && search.trim().length >= 3,
  });
  const choices = f.matchStatus === "ambiguous" || f.duplicate ? f.candidates : results.data ?? [];

  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-medium">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" /> {f.filename}
          </p>
          <p className={`mt-0.5 text-xs font-semibold ${tone}`}>{t(`insp.status.${s.key}` as any)}</p>
        </div>
        <button
          className="shrink-0 text-xs font-medium text-primary"
          onClick={async () => {
            const r = await urlFn({ data: { fileId: f.id } }).catch(() => null);
            if (r?.url) window.open(r.url, "_blank", "noopener");
          }}
        >
          {t("insp.open")}
        </button>
      </div>

      {f.status === "ready" && (
        <dl className="mt-3 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">{t("insp.f.address")}</dt>
            <dd>
              {f.address ?? t("insp.unknown")}
              {f.unit ? ` · ${t("insp.f.unit")} ${f.unit}` : ""}
              {f.addressPages.length ? ` (${t("insp.f.pages", { pages: f.addressPages.join(", ") })})` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("insp.f.date")}</dt>
            <dd>{f.inspectionDate ?? t("insp.unknown")}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">{t("insp.f.profile")}</dt>
            <dd>{f.proposed ? `${f.proposed.address}${f.proposed.name ? ` — ${f.proposed.name}` : ""}` : t("insp.f.no_profile")}</dd>
          </div>
        </dl>
      )}

      {f.older && <p className="mt-2 text-xs text-status-attention">{t("insp.issue.older")}</p>}
      {f.duplicate && <p className="mt-2 text-xs text-status-attention">{t("insp.issue.duplicate")}</p>}
      {s.key === "pending_permission" && <p className="mt-2 text-xs text-muted-foreground">{t("insp.explain.pending_permission")}</p>}
      {s.key === "no_homeowner" && <p className="mt-2 text-xs text-muted-foreground">{t("insp.explain.no_homeowner")}</p>}
      {s.key === "unreadable" && <p className="mt-2 text-xs text-muted-foreground">{t("insp.explain.unreadable")}</p>}

      {(f.status === "failed" || f.status === "unreadable") && (
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={async () => {
            await retryFn({ data: { fileId: f.id } });
            qc.invalidateQueries({ queryKey: KEY });
          }}
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> {t("insp.retry")}
        </Button>
      )}

      {needsIndividual && (
        <div className="mt-3 space-y-2 rounded-xl bg-muted/50 p-3">
          <p className="text-xs font-medium">{t("insp.review_individually")}</p>
          {f.matchStatus === "unmatched" && !f.duplicate && (
            <Input placeholder={t("insp.search_placeholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="h-11" />
          )}
          {choices.map((c) => (
            <label key={c.id} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="radio" name={`pick-${f.id}`} checked={pick === c.id} onChange={() => setPick(c.id)} />
              <span>
                {c.address}
                {c.name ? ` — ${c.name}` : ""}
              </span>
            </label>
          ))}
          {f.matchStatus === "unmatched" && <p className="text-xs text-muted-foreground">{t("insp.inbox_note")}</p>}
          <Button size="sm" disabled={!pick || busy} onClick={() => pick && onConfirm(pick)}>
            {t("insp.confirm_one")}
          </Button>
        </div>
      )}

      {s.key === "attached" && f.findingCount > 0 && (
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={async () => {
            const r: any = await applyFn({ data: { fileId: f.id } });
            if (!r.ok) toast.error(t(r.error === "no_permission" ? "insp.apply.no_permission" : "insp.err.generic"));
            else setSummary(r);
          }}
        >
          {t("insp.apply.cta")}
        </Button>
      )}
      {summary && (
        <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-xs" role="status">
          <p className="font-medium">{t("insp.sum.title")}</p>
          <ul className="mt-1 space-y-1">
            {summary.applied.map((k) => <li key={`a${k}`}>✓ {sysName(k)} — {t("insp.sum.applied")}</li>)}
            {summary.unchanged.map((k) => <li key={`u${k}`}>{sysName(k)} — {t("insp.sum.unchanged")}</li>)}
            {summary.needsApproval.map((r) => <li key={`n${r.key}`}>{sysName(r.key)} — {t("insp.sum.kept")}</li>)}
            {summary.skippedOlder.map((k) => <li key={`o${k}`}>{sysName(k)} — {t("insp.sum.older")}</li>)}
            {summary.conflicts.map((k) => <li key={`c${k}`}>{sysName(k)} — {t("insp.sum.conflict")}</li>)}
            {!summary.applied.length && !summary.unchanged.length && !summary.needsApproval.length && !summary.skippedOlder.length && !summary.conflicts.length && <li>{t("insp.sum.none")}</li>}
          </ul>
        </div>
      )}
    </li>
  );
}

function sysName(k: string) {
  return k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
