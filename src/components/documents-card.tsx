import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Upload, Trash2, Loader2, Eye, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listHomeDocuments,
  recordHomeDocument,
  deleteHomeDocument,
} from "@/lib/home-documents.functions";
import { extractInspectionReport } from "@/lib/inspection.functions";
import { DocumentViewerDialog } from "@/components/document-viewer-dialog";

const KIND_LABEL: Record<string, string> = {
  inspection: "Inspection report",
  insurance: "Insurance policy",
  warranty: "Warranty",
  deed: "Deed",
  other: "Document",
};

export function DocumentsCard() {
  const [kind, setKind] = useState<"inspection" | "insurance" | "warranty" | "deed" | "other">(
    "inspection",
  );
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
        toast.info("Analyzing inspection report…");
        extractFn({ data: { documentId: rec.id } })
          .then((r: any) => {
            toast.success(`Extracted ${r.findings} findings`);
            qc.invalidateQueries({ queryKey: ["home-documents"] });
            qc.invalidateQueries({ queryKey: ["inspection-findings"] });
          })
          .catch((e: any) => toast.error(`Analysis failed: ${e.message}`));
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Documents</h2>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Upload your inspection report so our AI can analyze your home and recommend the right
        services.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as any)}
          className="rounded-full border border-border bg-background px-3 py-1.5 text-xs"
        >
          <option value="inspection">Inspection</option>
          <option value="insurance">Insurance</option>
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
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1 rounded-full gradient-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </div>

      <ul className="mt-4 space-y-2">
        {isLoading ? (
          <li className="text-xs text-muted-foreground">Loading…</li>
        ) : docs.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-border p-4 text-xs text-muted-foreground">
            No documents yet. Upload your inspection report first.
          </li>
        ) : (
          docs.map((d: any) => (
            <li key={d.id} className="flex items-center gap-3 rounded-2xl border border-border p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                <FileText className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{d.original_filename ?? d.storage_path}</p>
                <p className="text-[11px] text-muted-foreground">{KIND_LABEL[d.kind] ?? d.kind}</p>
              </div>
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
  );
}
