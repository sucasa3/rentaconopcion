import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Compass, Sparkles, X } from "lucide-react";
import {
  ROLE_FLOWS,
  activityHint,
  readOnboarding,
  suggestFocus,
  writeOnboarding,
  type OnboardingRole,
  type OnboardingSignals,
} from "@/lib/onboarding";

/**
 * 3-step guided onboarding. Auto-opens once per role/user, then can be
 * reopened from the trigger button. The chosen focus is persisted and used by
 * the host dashboard as its default tab.
 */
export function GuidedOnboarding({
  role,
  userId,
  signals,
  onFocusChange,
  triggerLabel = "Setup guide",
  autoOpen = true,
}: {
  role: OnboardingRole;
  userId?: string | null;
  signals?: OnboardingSignals;
  onFocusChange?: (focus: string) => void;
  triggerLabel?: string;
  autoOpen?: boolean;
}) {
  const flow = ROLE_FLOWS[role];
  const suggested = useMemo(() => suggestFocus(role, signals), [role, signals]);
  const hint = useMemo(() => activityHint(role, signals), [role, signals]);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [focus, setFocus] = useState(suggested);

  useEffect(() => setFocus(suggested), [suggested]);

  useEffect(() => {
    if (!autoOpen || userId === undefined) return;
    if (readOnboarding(role, userId)) return;
    const t = setTimeout(() => setOpen(true), 500);
    return () => clearTimeout(t);
  }, [autoOpen, role, userId]);

  function finish() {
    writeOnboarding(role, userId ?? null, focus);
    onFocusChange?.(focus);
    setOpen(false);
    setTimeout(() => setStep(0), 250);
  }

  function dismiss() {
    // Closing counts as "seen" so the guide never auto-opens again — it can
    // still be reopened on demand from the trigger button.
    if (userId !== undefined) writeOnboarding(role, userId ?? null, focus);
    setOpen(false);
    setTimeout(() => setStep(0), 250);
  }

  const focusLabel = flow.options.find((o) => o.key === focus)?.label ?? flow.options[0].label;
  const done = flow.finish(focusLabel);

  return (
    <>
      <button
        onClick={() => {
          setStep(0);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
      >
        <Compass className="h-3.5 w-3.5 text-primary" /> {triggerLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm animate-fade-in"
          onClick={dismiss}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={flow.title}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-3xl border border-border bg-card shadow-soft"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">{flow.title}</p>
              </div>
              <button
                onClick={dismiss}
                aria-label="Close setup guide"
                className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-5">
              <div className="flex items-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition ${
                      i <= step ? "gradient-brand" : "bg-muted"
                    }`}
                  />
                ))}
              </div>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-primary">
                Step {step + 1} of 3
              </p>

              {step === 0 && (
                <div className="mt-2">
                  <h2 className="text-xl font-semibold tracking-tight">{flow.intro.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{flow.intro.body}</p>
                  <ul className="mt-4 space-y-2">
                    {flow.intro.bullets.map((b) => (
                      <li key={b} className="flex gap-2 text-sm">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span className="text-muted-foreground">{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {step === 1 && (
                <div className="mt-2">
                  <h2 className="text-xl font-semibold tracking-tight">{flow.focusPrompt}</h2>
                  {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
                  <div className="mt-4 space-y-2">
                    {flow.options.map((o) => {
                      const active = focus === o.key;
                      return (
                        <button
                          key={o.key}
                          onClick={() => setFocus(o.key)}
                          className={`w-full rounded-2xl border p-4 text-left transition ${
                            active
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-secondary"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold">{o.label}</p>
                            {o.key === suggested && (
                              <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                                Suggested
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{o.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="mt-2">
                  <h2 className="text-xl font-semibold tracking-tight">{done.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{done.body}</p>
                  <div className="mt-4 rounded-2xl border border-border bg-secondary/50 p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      Your starting view
                    </p>
                    <p className="mt-1 text-sm font-semibold">{focusLabel}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
              <button
                onClick={() => (step === 0 ? dismiss() : setStep(step - 1))}
                className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {step === 0 ? (
                  "Skip for now"
                ) : (
                  <>
                    <ArrowLeft className="h-3.5 w-3.5" /> Back
                  </>
                )}
              </button>
              <button
                onClick={() => (step === 2 ? finish() : setStep(step + 1))}
                className="inline-flex items-center gap-1.5 rounded-full gradient-brand px-4 py-2 text-sm font-semibold text-white"
              >
                {step === 2 ? "Start" : "Continue"} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
