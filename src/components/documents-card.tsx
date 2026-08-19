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
import { SectionHero, type HeroChip, type HeroTone } from "@/components/section-hero";

type Kind = "inspection" | "insurance" | "warranty" | "deed" | "other";

const KIND_LABEL: Record<string, string> = {
  inspection: "Inspection report",
  insurance: "Insurance policy",
  warranty: "Warranty",
  deed: "Deed",
  other: "Document",
};

const KIND_HELP: Record<Kind, string> = {
  inspection:
    "Best first upload — we read it and turn it into a condition list and service recommendations.",
  insurance: "Lets us flag coverage gaps and remind you before renewal.",
  warranty: "So you never pay for a repair that's still covered.",
  deed: "Confirms ownership details behind your value and equity numbers.",
  other: "Anything else worth keeping with your home's record.",
};

export function DocumentsCard({ onGoToCare }: { onGoToCare?: () => void }) {
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
      toast.success("Document removed");
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
      if (!userData.user) throw new Error("Not signed in");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${userData.user.id}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("home-documents")
        .upload(path, file, { contentType: file.type });
      if (upErr) throw new Error(upErr.message);
      const rec: any = await recordFn({
        data: { kind, storagePath: path, originalFilename: file.name, sizeBytes: file.size },
      });
      toast.success("Document uploaded");
      qc.invalidateQueries({ queryKey: ["home-documents"] });
      if (kind === "inspection" && rec?.id) {
        toast.info("Reading your inspection report…");
        extractFn({ data: { documentId: rec.id } })
          .then((r: any) => {
            toast.success(`Found ${r.findings} things worth knowing about your home`);
            qc.invalidateQueries({ queryKey: ["home-documents"] });
            qc.invalidateQueries({ queryKey: ["inspection-findings"] });
          })
          .catch((e: any) => toast.error(`We couldn't read that report: ${e.message}`));
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
  const ready = docs.some((d: any) => d.kind === "inspection" && d.extraction_status === "ready");

  const tone: HeroTone = total === 0 ? "setup" : hasInspection ? "calm" : "opportunity";

  const status = uploading
    ? "Uploading…"
    : total === 0
      ? "Nothing saved yet. Start with your inspection report — we'll read it for you."
      : analyzing
        ? "We're reading your inspection report right now. Give it a minute."
        : !hasInspection
          ? `We're keeping ${total} file${total === 1 ? "" : "s"} for you. Add your inspection report next — it's the useful one.`
          : `We're keeping ${total} file${total === 1 ? "" : "s"} safe for you, and using them to build your to-do list.`;

  return (
    <div className="space-y-4">
      <SectionHero
        plain
        icon={FolderOpen}
        eyebrow="Documents"
        title="Documents"
        subtitle="Papers about your home, saved in one place."
        status={status}
        tone={tone}
        actionLabel={hasInspection ? "Add a document" : "Add your inspection report"}
        onAction={() => pickFile(hasInspection ? undefined : "inspection")}
        connectNote="Whatever you add here helps us tell you what your home really needs."
        connectLabel={onGoToCare ? "See what needs doing" : undefined}
        onConnect={onGoToCare}
      />


      <div className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-6">
        <p className="text-sm font-medium">What are you uploading?</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            className="rounded-full border border-border bg-background px-3 py-2 text-xs"
            aria-label="Document type"
          >
            <option value="inspection">Inspection report</option>
            <option value="insurance">Insurance policy</option>
            <option value="warranty">Warranty</option>
            <option value="deed">Deed</option>
            <option value="other">Other</option>
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
            {uploading ? "Uploading…" : "Choose file"}
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{KIND_HELP[kind]}</p>

        <ul className="mt-4 space-y-2">
          {isLoading ? (
            <li className="text-xs text-muted-foreground">Loading…</li>
          ) : docs.length === 0 ? (
            <li className="rounded-2xl border border-dashed border-border p-6 text-center">
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-secondary text-primary">
                <FileText className="h-5 w-5" />
              </span>
              <p className="mt-3 text-sm font-medium">No documents yet</p>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                Your inspection report is the fastest win — we read it and tell you what your home
                needs, in order.
              </p>
              <button
                onClick={() => pickFile("inspection")}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-semibold hover:bg-secondary"
              >
                <Upload className="h-3.5 w-3.5" /> Upload inspection report
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
                      {KIND_LABEL[d.kind] ?? d.kind}
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
                          ? "Reading…"
                          : d.extraction_status === "ready"
                            ? "Analyzed"
                            : d.extraction_status === "failed"
                              ? "Couldn't read"
                              : d.extraction_status}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setViewing({ id: d.id, filename: d.original_filename })}
                  className="text-muted-foreground hover:text-primary"
                  aria-label="View"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  onClick={() => del.mutate(d.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Delete"
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
