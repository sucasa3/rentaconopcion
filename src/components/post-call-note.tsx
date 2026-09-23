/**
 * Post-call voice note dialog: Capture → (transcribe → interpret) → Review → Save.
 *
 * The professional confirms everything. Saving is one atomic server
 * transaction writing the outcome row (drives the existing Today follow-up
 * logic) and the conversation record. Cancelling saves nothing.
 */
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Mic, Plus, Square, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { interpretPostCallNote, savePostCallNote } from "@/lib/post-call.functions";
import {
  POST_CALL_OUTCOMES,
  clearCallMarker,
  type KeyFact,
  type PostCallInterpretation,
  type PostCallOutcome,
  type PostCallSource,
} from "@/lib/post-call";
import type { Audience, OutcomeStage } from "@/lib/next-best-action";
import { useT } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

const MAX_SECONDS = 120;
const MIN_SECONDS = 3;

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return (
    ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) =>
      MediaRecorder.isTypeSupported(m),
    ) ?? ""
  );
}

type Step = "capture" | "working" | "review";

export function PostCallNoteDialog({
  kind,
  clientId,
  name,
  opportunityId,
  open,
  onOpenChange,
  onSaved,
}: {
  kind: Audience;
  clientId: string;
  name: string;
  opportunityId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const t = useT();
  const oLabel = (s: OutcomeStage): string =>
    t(
      (s === "appointment" || s === "application" || s === "closed"
        ? `biz.outcome.${s}.${kind}`
        : `biz.outcome.${s}`) as Parameters<typeof t>[0],
    );

  const [step, setStep] = useState<Step>("capture");
  const [working, setWorking] = useState<"transcribing" | "interpreting">("transcribing");
  const [typedMode, setTypedMode] = useState(false);
  const [typedText, setTypedText] = useState("");
  const [micError, setMicError] = useState(false);
  const [saving, setSaving] = useState(false);

  // Recording state
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const secondsRef = useRef(0);

  // Resolved context + AI draft + editable review fields
  const [oppId, setOppId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [source, setSource] = useState<PostCallSource>("post_call_voice");
  const [draft, setDraft] = useState<PostCallInterpretation | null>(null);
  const [summary, setSummary] = useState("");
  const [outcome, setOutcome] = useState<PostCallOutcome>("talked");
  const [facts, setFacts] = useState<KeyFact[]>([]);
  const [nextStep, setNextStep] = useState("");
  const [fuRequired, setFuRequired] = useState(false);
  const [fuDate, setFuDate] = useState("");
  const [fuTimeframe, setFuTimeframe] = useState("");
  const [fuReason, setFuReason] = useState("");
  const [opener, setOpener] = useState("");

  const interpretFn = useServerFn(interpretPostCallNote);
  const saveFn = useServerFn(savePostCallNote);

  const reset = () => {
    stopTimer();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
    }
    recorderRef.current = null;
    setRecording(false);
    setSeconds(0);
    secondsRef.current = 0;
    setStep("capture");
    setTypedMode(false);
    setTypedText("");
    setMicError(false);
    setSaving(false);
    setDraft(null);
    setOppId(null);
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const startRecording = async () => {
    setMicError(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.start(250);
      recorderRef.current = rec;
      setRecording(true);
      setSeconds(0);
      secondsRef.current = 0;
      timerRef.current = setInterval(() => {
        secondsRef.current += 1;
        setSeconds(secondsRef.current);
        if (secondsRef.current >= MAX_SECONDS) void stopAndTranscribe();
      }, 1000);
    } catch {
      setMicError(true);
      setTypedMode(true);
    }
  };

  const stopAndTranscribe = async () => {
    const rec = recorderRef.current;
    stopTimer();
    setRecording(false);
    if (!rec) return;
    const blob = await new Promise<Blob | null>((resolve) => {
      rec.onstop = () => {
        rec.stream.getTracks().forEach((tr) => tr.stop());
        resolve(
          chunksRef.current.length
            ? new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" })
            : null,
        );
      };
      try { rec.stop(); } catch { resolve(null); }
    });
    recorderRef.current = null;
    if (!blob || secondsRef.current < MIN_SECONDS) {
      toast.error(t("biz.pc.too_short"));
      return;
    }
    setStep("working");
    setWorking("transcribing");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const ext = blob.type.includes("mp4") ? "m4a" : "webm";
      const fd = new FormData();
      fd.append("file", new File([blob], `note.${ext}`, { type: blob.type }));
      const res = await fetch("/api/post-call/transcribe", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const body = (await res.json().catch(() => ({}))) as {
        transcript?: string;
        error?: string;
      };
      if (!res.ok || !body.transcript) {
        throw new Error(body.error ?? "Transcription failed");
      }
      await interpret(body.transcript, "post_call_voice");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("biz.pc.mic_denied"));
      setStep("capture");
      setTypedMode(true);
    }
  };

  const interpret = async (text: string, src: PostCallSource) => {
    setStep("working");
    setWorking("interpreting");
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const r = await interpretFn({
        data: { audience: kind, clientId, transcript: text, timezone },
      });
      setTranscript(text);
      setSource(src);
      setOppId(r.opportunityId);
      const ai = r.interpretation;
      setDraft(ai);
      setSummary(ai.summary);
      setOutcome(ai.outcome);
      setFacts(ai.keyFacts);
      setNextStep(ai.nextStep ?? "");
      setFuRequired(ai.followUp.required);
      setFuDate(ai.followUp.date ?? "");
      setFuTimeframe(ai.followUp.timeframeText ?? "");
      setFuReason(ai.followUp.reason ?? "");
      setOpener(ai.suggestedFutureOpener ?? "");
      setStep("review");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong. Nothing was saved.");
      setStep("capture");
    }
  };

  const save = async (schedule: boolean) => {
    if (!draft) return;
    if (schedule && fuRequired && !fuDate) return;
    setSaving(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      await saveFn({
        data: {
          audience: kind,
          clientId,
          opportunityId: oppId ?? opportunityId,
          source,
          transcript,
          timezone,
          original: draft,
          originalLanguage: draft.originalLanguage,
          final: {
            summary: summary.trim(),
            outcome,
            keyFacts: facts.filter((f) => f.fact.trim()),
            nextStep: nextStep.trim() || null,
            followUp: {
              required: fuRequired,
              date: fuDate || null,
              timeframeText: fuTimeframe.trim() || null,
              reason: fuReason.trim() || null,
            },
            suggestedFutureOpener: opener.trim() || null,
          },
          scheduleFollowUp: schedule,
        },
      });
      toast.success(t("biz.pc.saved"));
      clearCallMarker();
      onSaved?.();
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong. Nothing was saved.");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === "review" ? t("biz.pc.review_title") : t("biz.pc.title")}
          </DialogTitle>
          <DialogDescription>
            {step === "review" ? t("biz.pc.review_hint") : t("biz.pc.subtitle")}
          </DialogDescription>
        </DialogHeader>

        {step === "capture" && (
          <div className="space-y-4">
            {!typedMode ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <button
                  type="button"
                  onClick={recording ? () => void stopAndTranscribe() : () => void startRecording()}
                  className={`flex h-20 w-20 items-center justify-center rounded-full transition ${
                    recording
                      ? "bg-status-negative text-white"
                      : "bg-primary text-primary-foreground"
                  }`}
                  aria-label={recording ? t("biz.pc.mic_stop") : t("biz.pc.mic_start")}
                >
                  {recording ? <Square className="h-7 w-7" /> : <Mic className="h-8 w-8" />}
                </button>
                <p className="text-sm font-medium">
                  {recording
                    ? t("biz.pc.recording", { s: seconds })
                    : t("biz.pc.mic_start")}
                </p>
                <p className="text-xs text-muted-foreground">{t("biz.pc.mic_hint")}</p>
                <button
                  type="button"
                  onClick={() => setTypedMode(true)}
                  className="text-sm font-medium text-primary"
                >
                  {t("biz.pc.or_type")}
                </button>
                {micError && (
                  <p className="text-xs text-status-negative">{t("biz.pc.mic_denied")}</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <Textarea
                  value={typedText}
                  onChange={(e) => setTypedText(e.target.value)}
                  rows={6}
                  placeholder={t("biz.pc.type_ph")}
                  autoFocus
                />
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setTypedMode(false)}
                    className="text-sm font-medium text-primary"
                  >
                    {t("biz.pc.use_voice")}
                  </button>
                  <Button
                    type="button"
                    disabled={typedText.trim().length < 3}
                    onClick={() => void interpret(typedText.trim(), "post_call_text")}
                  >
                    {t("biz.pc.review_cta")}
                  </Button>
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <Button type="button" variant="ghost" onClick={close}>
                {t("biz.pc.cancel")}
              </Button>
            </div>
          </div>
        )}

        {step === "working" && (
          <div className="flex items-center justify-center gap-3 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            {working === "transcribing" ? t("biz.pc.transcribing") : t("biz.pc.interpreting")}
          </div>
        )}

        {step === "review" && (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                {t("biz.pc.summary")}
              </label>
              <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                {t("biz.pc.outcome")}
              </label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {POST_CALL_OUTCOMES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setOutcome(s)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                      outcome === s
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/70 text-muted-foreground"
                    }`}
                  >
                    {oLabel(s)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                {t("biz.pc.learned")}
              </label>
              <div className="mt-1.5 space-y-1.5">
                {facts.map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Input
                      value={f.fact}
                      onChange={(e) =>
                        setFacts(facts.map((x, j) => (j === i ? { ...x, fact: e.target.value } : x)))
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setFacts(facts.filter((_, j) => j !== i))}
                      className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:text-foreground"
                      aria-label="Remove"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setFacts([...facts, { fact: "", confidence: 0.9 }])}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary"
                >
                  <Plus className="h-3.5 w-3.5" /> {t("biz.pc.add_fact")}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                {t("biz.pc.next_step")}
              </label>
              <Input value={nextStep} onChange={(e) => setNextStep(e.target.value)} />
            </div>

            <div className="space-y-2 rounded-2xl border border-border/60 p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={fuRequired}
                  onChange={(e) => setFuRequired(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                {t("biz.pc.followup_needed")}
              </label>
              {fuRequired && (
                <div className="space-y-2 pl-6">
                  <div>
                    <label className="text-xs text-muted-foreground">
                      {t("biz.pc.followup_date")}
                    </label>
                    <Input
                      type="date"
                      value={fuDate}
                      onChange={(e) => setFuDate(e.target.value)}
                    />
                  </div>
                  {fuTimeframe && (
                    <div>
                      <label className="text-xs text-muted-foreground">
                        {t("biz.pc.followup_timeframe")}
                      </label>
                      <Input
                        value={fuTimeframe}
                        onChange={(e) => setFuTimeframe(e.target.value)}
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-muted-foreground">
                      {t("biz.pc.followup_reason")}
                    </label>
                    <Input value={fuReason} onChange={(e) => setFuReason(e.target.value)} />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                {t("biz.pc.opener")}
              </label>
              <Textarea value={opener} onChange={(e) => setOpener(e.target.value)} rows={2} />
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <Button
                type="button"
                onClick={() => void save(true)}
                disabled={saving || !summary.trim() || (fuRequired && !fuDate)}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t("biz.pc.save_schedule")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void save(false)}
                disabled={saving || !summary.trim()}
              >
                {t("biz.pc.save_plain")}
              </Button>
              <Button type="button" variant="ghost" onClick={close} disabled={saving}>
                {t("biz.pc.cancel")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
