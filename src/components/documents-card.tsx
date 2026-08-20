import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Upload, Trash2, Loader2, Eye, Sparkles, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listHomeDocuments,
  recordHomeDocument,
  deleteHomeDocument,
} from "@/lib/home-documents.functions";
import { extractInspectionReport } from "@/lib/inspection.functions";
import { DocumentViewerDialog } from "@/components/document-viewer-dialog";
import { SectionHero, type HeroTone } from "@/components/section-hero";
import { useT, type TranslationKey } from "@/lib/i18n";

type Kind = "inspection" | "insurance" | "warranty" | "deed" | "other";

const KIND_LABEL_KEY: Record<string, TranslationKey> = {
  inspection: "docs.kind.inspection",
  insurance: "docs.kind.insurance",
  warranty: "docs.kind.warranty",
  deed: "docs.kind.deed",
  other: "docs.kind.other_label",
};

const KIND_HELP_KEY: Record<Kind, TranslationKey> = {
  inspection: "docs.help.inspection",
  insurance: "docs.help.insurance",
  warranty: "docs.help.warranty",
  deed: "docs.help.deed",
  other: "docs.help.other",
};

export function DocumentsCard({ onGoToCare }: { onGoToCare?: () => void }) {
  const t = useT();
  const [kind, setKind] = useState<Kind>("inspection");
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<{ id: string; filename: string | null } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const listFn = useServerFn(listHomeDocuments);
  const recordFn = useServerFn(recordHomeDocument);
  const deleteFn = useServerFn(deleteHomeDocument);
  const extractFn = useServerFn(extractInspectionReport);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["home-documents"],
    queryFn: () => listFn(),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success(t("docs.toast.removed"));
      qc.invalidateQueries({ queryKey: ["home-documents"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  /** Open the picker, optionally forcing the document type first. */
  function pickFile(forceKind?: Kind) {
    if (forceKind) setKind(forceKind);
    fileRef.current?.click();
  }

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error(t("docs.err.not_signed_in"));
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${userData.user.id}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("home-documents")
        .upload(path, file, { contentType: file.type });
      if (upErr) throw new Error(upErr.message);
      const rec: any = await recordFn({
        data: { kind, storagePath: path, originalFilename: file.name, sizeBytes: file.size },
      });
      toast.success(t("docs.toast.uploaded"));
      qc.invalidateQueries({ queryKey: ["home-documents"] });
      if (kind === "inspection" && rec?.id) {
        toast.info(t("docs.toast.reading"));
        extractFn({ data: { documentId: rec.id } })
          .then((r: any) => {
            toast.success(
              t(r?.findings === 1 ? "docs.toast.found_one" : "docs.toast.found_many", {
                count: r?.findings ?? 0,
              }),
            );
            qc.invalidateQueries({ queryKey: ["home-documents"] });
            qc.invalidateQueries({ queryKey: ["inspection-findings"] });
          })
          .catch((e: any) =>
            toast.error(t("docs.toast.read_failed", { message: e.message })),
          );
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const total = docs.length;
  const hasInspection = docs.some((d: any) => d.kind === "inspection");
  const analyzing = docs.some(
    (d: any) => d.kind === "inspection" && d.extraction_status === "processing",
  );

  const tone: HeroTone = total === 0 ? "setup" : hasInspection ? "calm" : "opportunity";

  const status = uploading
    ? t("docs.status.uploading")
    : total === 0
      ? t("docs.status.empty")
      : analyzing
        ? t("docs.status.analyzing")
        : !hasInspection
          ? t(total === 1 ? "docs.status.no_inspection_one" : "docs.status.no_inspection_many", {
              count: total,
            })
          : t(total === 1 ? "docs.status.ok_one" : "docs.status.ok_many", { count: total });

  return (
    <div className="space-y-4">
      <SectionHero
        plain
        icon={FolderOpen}
        eyebrow={t("docs.hero.eyebrow")}
        title={t("docs.hero.title")}
        subtitle={t("docs.hero.subtitle")}
        status={status}
        tone={tone}
        actionLabel={hasInspection ? t("docs.action.add") : t("docs.action.add_inspection")}
        onAction={() => pickFile(hasInspection ? undefined : "inspection")}
        connectNote={t("docs.connect.note")}
        connectLabel={onGoToCare ? t("docs.connect.label") : undefined}
        onConnect={onGoToCare}
      />

      <div className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-6">
        <p className="text-sm font-medium">{t("docs.uploading_what")}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            className="rounded-full border border-border bg-background px-3 py-2 text-xs"
            aria-label={t("docs.type_aria")}
          >
            <option value="inspection">{t("docs.kind.inspection")}</option>
            <option value="insurance">{t("docs.kind.insurance")}</option>
            <option value="warranty">{t("docs.kind.warranty")}</option>
            <option value="deed">{t("docs.kind.deed")}</option>
            <option value="other">{t("docs.kind.other")}</option>
          </select>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <button
            onClick={() => pickFile()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-full gradient-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {uploading ? t("docs.status.uploading") : t("docs.choose_file")}
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {t(KIND_HELP_KEY[kind])}
        </p>

        <ul className="mt-4 space-y-2">
          {isLoading ? (
            <li className="text-xs text-muted-foreground">{t("common.loading")}</li>
          ) : docs.length === 0 ? (
            <li className="rounded-2xl border border-dashed border-border p-6 text-center">
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-secondary text-primary">
                <FileText className="h-5 w-5" />
              </span>
              <p className="mt-3 text-sm font-medium">{t("docs.empty.title")}</p>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                {t("docs.empty.body")}
              </p>
              <button
                onClick={() => pickFile("inspection")}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-semibold hover:bg-secondary"
              >
                <Upload className="h-3.5 w-3.5" /> {t("docs.empty.cta")}
              </button>
            </li>
          ) : (
            docs.map((d: any) => (
              <li key={d.id} className="flex items-center gap-3 rounded-2xl border border-border p-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                  <FileText className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{d.original_filename ?? d.storage_path}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-[11px] text-muted-foreground">
                      {KIND_LABEL_KEY[d.kind] ? t(KIND_LABEL_KEY[d.kind]) : d.kind}
                    </p>
                    {d.kind === "inspection" && d.extraction_status && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          d.extraction_status === "ready"
                            ? "bg-growth/15 text-growth"
                            : d.extraction_status === "processing"
                              ? "bg-accent text-accent-foreground"
                              : d.extraction_status === "failed"
                                ? "bg-destructive/10 text-destructive"
                                : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        <Sparkles className="h-2.5 w-2.5" />
                        {d.extraction_status === "processing"
                          ? t("docs.badge.reading")
                          : d.extraction_status === "ready"
                            ? t("docs.badge.analyzed")
                            : d.extraction_status === "failed"
                              ? t("docs.badge.failed")
                              : d.extraction_status}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setViewing({ id: d.id, filename: d.original_filename })}
                  className="text-muted-foreground hover:text-primary"
                  aria-label={t("docs.aria.view")}
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  onClick={() => del.mutate(d.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={t("docs.aria.delete")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      <DocumentViewerDialog
        documentId={viewing?.id ?? null}
        filename={viewing?.filename ?? null}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}
