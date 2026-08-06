import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { X, ArrowRight, ArrowLeft, Home, Activity, TrendingUp, Sparkles, Check } from "lucide-react";

const STORAGE_KEY = "sucasa.onboarding.tour.v1";

type Step = {
  key: string;
  eyebrow: string;
  title: string;
  body: string;
  icon: typeof Home;
  progress: number; // 0..1 profile completeness
  score: number;
  zones: { label: string; state: "off" | "warn" | "ok" }[];
  projection: { year: number; value: number }[];
};

const STEPS: Step[] = [
  {
    key: "start",
    eyebrow: "Step 1 of 4",
    title: "Add your address",
    body: "We pull public records for square footage, year built, and comps — your Home Score comes to life.",
    icon: Home,
    progress: 0.25,
    score: 42,
    zones: [
      { label: "Roof", state: "off" },
      { label: "HVAC", state: "off" },
      { label: "Plumbing", state: "off" },
      { label: "Electrical", state: "off" },
    ],
    projection: buildCurve(720_000, 0.01),
  },
  {
    key: "systems",
    eyebrow: "Step 2 of 4",
    title: "Tell us about your systems",
    body: "Roof age, HVAC, plumbing, and electrical light up as health zones on your home.",
    icon: Activity,
    progress: 0.55,
    score: 68,
    zones: [
      { label: "Roof", state: "ok" },
      { label: "HVAC", state: "warn" },
      { label: "Plumbing", state: "ok" },
      { label: "Electrical", state: "off" },
    ],
    projection: buildCurve(742_000, 0.025),
  },
  {
    key: "inspection",
    eyebrow: "Step 3 of 4",
    title: "Upload your inspection report",
    body: "Our AI reads the PDF and fills in the rest — every zone gets a real health signal and priority.",
    icon: Sparkles,
    progress: 0.85,
    score: 84,
    zones: [
      { label: "Roof", state: "ok" },
      { label: "HVAC", state: "warn" },
      { label: "Plumbing", state: "ok" },
      { label: "Electrical", state: "ok" },
    ],
    projection: buildCurve(760_000, 0.038),
  },
  {
    key: "projection",
    eyebrow: "Step 4 of 4",
    title: "See your 10-year projection",
    body: "Value, equity, and upgrade ROI update the moment your profile is complete. Drag the scrubber anytime.",
    icon: TrendingUp,
    progress: 1,
    score: 92,
    zones: [
      { label: "Roof", state: "ok" },
      { label: "HVAC", state: "ok" },
      { label: "Plumbing", state: "ok" },
      { label: "Electrical", state: "ok" },
    ],
    projection: buildCurve(775_000, 0.052),
  },
];

function buildCurve(base: number, growth: number) {
  return Array.from({ length: 11 }, (_, i) => ({
    year: i,
    value: Math.round(base * Math.pow(1 + growth, i)),
  }));
}

export function OnboardingWalkthrough({
  autoOpenIfNew = false,
  triggerLabel,
}: {
  autoOpenIfNew?: boolean;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!autoOpenIfNew) return;
    if (typeof window === "undefined") return;
    if (!window.localStorage.getItem(STORAGE_KEY)) {
      const t = setTimeout(() => setOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, [autoOpenIfNew]);

  function close(remember = true) {
    setOpen(false);
    if (remember && typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    }
    setTimeout(() => setI(0), 300);
  }

  const step = STEPS[i];
  const isLast = i === STEPS.length - 1;

  return (
    <>
      {triggerLabel && (
        <button
          onClick={() => {
            setI(0);
            setOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" /> {triggerLabel}
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm animate-fade-in"
          onClick={() => close()}
        >
          <div
            className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-border bg-card shadow-2xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => close()}
              className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full bg-card/80 text-muted-foreground backdrop-blur hover:text-foreground"
              aria-label="Close walkthrough"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Visual preview */}
            <VisualPreview step={step} stepIndex={i} />

            {/* Content */}
            <div className="px-6 pb-6 pt-5 sm:px-8 sm:pb-8">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
                <step.icon className="h-3.5 w-3.5" /> {step.eyebrow}
              </div>
              <h3 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>

              {/* Dots */}
              <div className="mt-5 flex items-center gap-1.5">
                {STEPS.map((s, idx) => (
                  <button
                    key={s.key}
                    onClick={() => setI(idx)}
                    aria-label={`Go to step ${idx + 1}`}
                    className={`h-1.5 rounded-full transition-all ${
                      idx === i ? "w-8 bg-primary" : "w-1.5 bg-border hover:bg-muted-foreground/40"
                    }`}
                  />
                ))}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <button
                  onClick={() => close(true)}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Skip tour
                </button>
                <div className="flex items-center gap-2">
                  {i > 0 && (
                    <button
                      onClick={() => setI(i - 1)}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-3.5 py-2 text-sm font-medium hover:bg-secondary"
                    >
                      <ArrowLeft className="h-4 w-4" /> Back
                    </button>
                  )}
                  {isLast ? (
                    <Link
                      to="/onboarding"
                      onClick={() => close(true)}
                      className="inline-flex items-center gap-1.5 rounded-full gradient-brand px-4 py-2 text-sm font-semibold text-white shadow-soft"
                    >
                      Start my profile <ArrowRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <button
                      onClick={() => setI(i + 1)}
                      className="inline-flex items-center gap-1.5 rounded-full gradient-brand px-4 py-2 text-sm font-semibold text-white shadow-soft"
                    >
                      Next <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function VisualPreview({ step, stepIndex }: { step: Step; stepIndex: number }) {
  return (
    <div className="relative h-56 w-full overflow-hidden bg-gradient-to-br from-primary/15 via-primary/5 to-growth/15 sm:h-64">
      {/* Profile completeness bar */}
      <div className="absolute left-6 right-6 top-5 sm:left-8 sm:right-8">
        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-foreground/70">
          <span>Home profile</span>
          <span>{Math.round(step.progress * 100)}%</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/10">
          <div
            key={`bar-${stepIndex}`}
            className="h-full rounded-full gradient-brand transition-all duration-700 ease-out"
            style={{ width: `${step.progress * 100}%` }}
          />
        </div>
      </div>

      {/* Left: score ring */}
      <div className="absolute bottom-5 left-6 sm:left-8">
        <ScoreRing key={`ring-${stepIndex}`} score={step.score} />
      </div>

      {/* Middle: zones */}
      <div className="absolute inset-x-0 bottom-6 flex justify-center">
        <div className="flex flex-col gap-1.5">
          {step.zones.map((z, idx) => (
            <div
              key={z.label}
              className="flex items-center gap-2 rounded-full border border-border/60 bg-card/80 px-2.5 py-1 text-[10px] font-medium backdrop-blur"
              style={{ animation: `fade-in 0.4s ease-out ${idx * 80}ms both` }}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  z.state === "ok"
                    ? "bg-growth animate-pulse"
                    : z.state === "warn"
                      ? "bg-accent-foreground animate-pulse"
                      : "bg-border"
                }`}
              />
              <span className={z.state === "off" ? "text-muted-foreground" : "text-foreground"}>{z.label}</span>
              {z.state === "ok" && <Check className="h-2.5 w-2.5 text-growth" />}
            </div>
          ))}
        </div>
      </div>

      {/* Right: projection sparkline */}
      <div className="absolute bottom-5 right-6 w-40 sm:right-8 sm:w-48">
        <Sparkline key={`spark-${stepIndex}`} data={step.projection} />
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-foreground/60">10-yr value</span>
          <span className="text-xs font-semibold text-foreground">
            ${(step.projection[step.projection.length - 1].value / 1000).toFixed(0)}k
          </span>
        </div>
      </div>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const dash = c * (score / 100);
  return (
    <div className="relative grid place-items-center">
      <svg width="72" height="72" viewBox="0 0 72 72" className="-rotate-90">
        <circle cx="36" cy="36" r={r} strokeWidth="6" className="fill-none stroke-foreground/10" />
        <circle
          cx="36"
          cy="36"
          r={r}
          strokeWidth="6"
          strokeLinecap="round"
          className="fill-none stroke-primary transition-all duration-700 ease-out"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div className="absolute grid place-items-center">
        <span className="text-lg font-semibold leading-none">{score}</span>
        <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Score</span>
      </div>
    </div>
  );
}

function Sparkline({ data }: { data: { year: number; value: number }[] }) {
  const w = 180;
  const h = 56;
  const min = Math.min(...data.map((d) => d.value));
  const max = Math.max(...data.map((d) => d.value));
  const span = Math.max(1, max - min);
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((d.value - min) / span) * h;
    return `${x},${y}`;
  });
  const line = `M ${pts.join(" L ")}`;
  const area = `M 0,${h} L ${pts.join(" L ")} L ${w},${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-14 w-full text-primary">
      <defs>
        <linearGradient id="sparkGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkGrad)" className="animate-fade-in" />
      <path
        d={line}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary"
        style={{ strokeDasharray: 400, strokeDashoffset: 400, animation: "spark-draw 0.9s ease-out forwards" }}
      />
      <style>{`@keyframes spark-draw { to { stroke-dashoffset: 0 } }`}</style>
    </svg>
  );
}
