/**
 * Return-from-call prompt. When a professional taps a tel: link in SuCasa, a
 * lightweight marker is written; when they return to the app, this card
 * offers the voice note. It never tries to detect the actual call and never
 * touches call audio — it's purely "you tapped call, you came back".
 */
import { useEffect, useState } from "react";
import { Mic, PhoneOutgoing, X } from "lucide-react";
import {
  clearCallMarker,
  readCallMarker,
  type CallMarker,
} from "@/lib/post-call";
import { useT } from "@/lib/i18n";
import { PostCallNoteDialog } from "./post-call-note";

export function PostCallReturnPrompt() {
  const t = useT();
  const [marker, setMarker] = useState<CallMarker | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "visible") setMarker(readCallMarker());
    };
    check();
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  if (!marker) return null;

  return (
    <>
      {!open && (
        <div className="fixed inset-x-3 bottom-20 z-50 rounded-2xl border border-border bg-card p-4 shadow-lg md:inset-x-auto md:bottom-6 md:right-6 md:w-96">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <PhoneOutgoing className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {t("biz.pc.return_title", { name: marker.name })}
              </p>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="mt-2 inline-flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                <Mic className="h-4 w-4" /> {t("biz.pc.cta")}
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                clearCallMarker();
                setMarker(null);
              }}
              className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:text-foreground"
              aria-label={t("biz.pc.dismiss")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <PostCallNoteDialog
        kind={marker.audience}
        clientId={marker.clientId}
        name={marker.name}
        opportunityId={marker.opportunityId}
        open={open}
        onOpenChange={setOpen}
        onSaved={() => setMarker(null)}
      />
    </>
  );
}
