import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getDocumentSignedUrl } from "@/lib/documents.functions";

type Props = {
  documentId: string | null;
  filename?: string | null;
  onClose: () => void;
};

export function DocumentViewerDialog({ documentId, filename, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const getSigned = useServerFn(getDocumentSignedUrl);

  useEffect(() => {
    if (!documentId) {
      setUrl(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSigned({ data: { id: documentId } })
      .then((r) => {
        if (!cancelled) setUrl(r.url);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e.message ?? "Failed to load document");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, getSigned]);

  const isImage = (filename ?? "").match(/\.(png|jpe?g|webp|gif)$/i);

  return (
    <Dialog open={!!documentId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="truncate">{filename ?? "Document"}</DialogTitle>
        </DialogHeader>

        <div className="h-[70vh] overflow-hidden rounded-2xl border border-border bg-muted">
          {loading && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          )}
          {error && (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-destructive">
              {error}
            </div>
          )}
          {url && !loading && !error && (
            isImage ? (
              <img src={url} alt={filename ?? ""} className="h-full w-full object-contain" />
            ) : (
              <iframe src={url} title={filename ?? "Document"} className="h-full w-full" />
            )
          )}
        </div>

        {url && (
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <ExternalLink className="h-3 w-3" /> Open in new tab
            </a>
            <a
              href={url}
              download={filename ?? undefined}
              className="inline-flex items-center gap-1 rounded-full gradient-brand px-3 py-1.5 text-xs font-semibold text-white"
            >
              <Download className="h-3 w-3" /> Download
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
