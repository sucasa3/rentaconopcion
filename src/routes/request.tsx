import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { HomeownerShell } from "@/components/homeowner-shell";
import { SERVICE_CATEGORIES, toCategorySlug } from "@/lib/mock-data";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Camera, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { createServiceRequest } from "@/lib/service-requests.functions";

const search = z.object({ category: z.string().optional() });

export const Route = createFileRoute("/request")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Request Service — SuCasa" },
      { name: "description", content: "Request service from a trusted local pro." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RequestFlow,
});

const TIMELINES = ["ASAP", "This week", "Next 2 weeks", "Flexible"];

function parseBudget(s: string): { min?: number; max?: number } {
  const nums = s.match(/\d[\d,]*/g)?.map((n) => Number(n.replace(/,/g, ""))) ?? [];
  if (!nums.length) return {};
  if (nums.length === 1) return { max: nums[0] };
  return { min: Math.min(nums[0], nums[1]), max: Math.max(nums[0], nums[1]) };
}

function RequestFlow() {
  const navigate = useNavigate();
  const { category: initialParam } = Route.useSearch();
  // A category handed over from the dashboard skips the picker and drops the
  // homeowner straight on "Tell us about the project".
  const initial = toCategorySlug(initialParam);
  const [step, setStep] = useState(initial ? 1 : 0);
  const [category, setCategory] = useState<string | undefined>(initial);
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [timeline, setTimeline] = useState<string>("This week");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const createFn = useServerFn(createServiceRequest);
  const selected = SERVICE_CATEGORIES.find((c) => c.slug === category);

  const total = 5;
  const next = () => setStep((s) => Math.min(s + 1, total - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));
  const submit = async () => {
    if (!category) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { min, max } = parseBudget(budget);
      const cat = SERVICE_CATEGORIES.find((c) => c.slug === category)?.name ?? category;
      const { id } = await createFn({
        data: {
          category: cat,
          description: description || undefined,
          timeline,
          budgetMin: min,
          budgetMax: max,
        },
      });
      navigate({ to: "/requests/$id", params: { id } });
    } catch (e) {
      const msg = (e as Error).message;
      setSubmitting(false);
      if (/Unauthorized|token|auth/i.test(msg)) {
        navigate({ to: "/auth" });
        return;
      }
      setSubmitError(msg);
    }
  };

  return (
    <HomeownerShell>
      <main className="px-4 py-6 sm:px-5 sm:py-8">
        <div className="mx-auto max-w-2xl">
          <Link
            to="/dashboard"
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to your home
          </Link>

          <div className="mb-6">
            <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>Step {step + 1} of {total}</span>
              <span>Request Service</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full gradient-brand transition-all" style={{ width: `${((step + 1) / total) * 100}%` }} />
            </div>
          </div>

          {selected && (
            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-3">
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${selected.color} text-white`}
              >
                <selected.icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                  Service requested
                </p>
                <p className="truncate text-sm font-semibold">{selected.name}</p>
              </div>
              {step > 0 && (
                <button
                  onClick={() => setStep(0)}
                  className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-semibold hover:bg-secondary"
                >
                  Change
                </button>
              )}
            </div>
          )}



          <div className="rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-8">
            {step === 0 && (
              <div>
                <Header title="What do you need help with?" desc="Pick a service category to start." />
                <div className="mt-5 grid grid-cols-2 gap-2">
                  {SERVICE_CATEGORIES.map(c => {
                    const active = category === c.slug;
                    return (
                      <button key={c.slug} onClick={() => setCategory(c.slug)} className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${active ? "border-primary bg-primary/5" : "border-border hover:bg-secondary"}`}>
                        <span className={`grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br ${c.color} text-white`}><c.icon className="h-4 w-4" /></span>
                        <span className="text-sm font-medium">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {step === 1 && (
              <div className="space-y-4">
                <Header title="Tell us about the project" desc="A few details help pros give a fair quote." />
                <Field label="Describe the project">
                  <textarea rows={5} className={inputCls} value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. My upstairs AC unit is blowing warm air." />
                </Field>
                <Field label="Estimated budget (optional)">
                  <input className={inputCls} value={budget} onChange={e => setBudget(e.target.value)} placeholder="$500 – $1,500" />
                </Field>
              </div>
            )}
            {step === 2 && (
              <div>
                <Header title="Add photos" desc="Photos help pros scope the work faster." />
                <div className="mt-5 grid grid-cols-3 gap-2">
                  {photos.map((_, i) => (
                    <div key={i} className="aspect-square rounded-2xl border border-border bg-secondary" />
                  ))}
                  <button onClick={() => setPhotos(p => [...p, "x"])} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border text-muted-foreground hover:bg-secondary">
                    <Camera className="h-5 w-5" />
                    <span className="text-xs">Add photo</span>
                  </button>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Optional — you can skip.</p>
              </div>
            )}
            {step === 3 && (
              <div>
                <Header title="When do you need it done?" desc="Pick a preferred timeline." />
                <div className="mt-5 grid gap-2">
                  {TIMELINES.map(t => {
                    const active = timeline === t;
                    return (
                      <button key={t} onClick={() => setTimeline(t)} className={`flex items-center justify-between rounded-2xl border px-4 py-4 text-left text-sm transition ${active ? "border-primary bg-primary/5" : "border-border hover:bg-secondary"}`}>
                        <span className="flex items-center gap-2 font-medium"><Clock className="h-4 w-4 text-primary" /> {t}</span>
                        {active && <CheckCircle2 className="h-5 w-5 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {step === 4 && (
              <div>
                <Header title="Review & submit" desc="Confirm your request." />
                <div className="mt-5 space-y-3 rounded-2xl border border-border p-4 text-sm">
                  <Row k="Category" v={SERVICE_CATEGORIES.find(c => c.slug === category)?.name ?? "—"} />
                  <Row k="Description" v={description || "—"} />
                  <Row k="Budget" v={budget || "—"} />
                  <Row k="Photos" v={`${photos.length} attached`} />
                  <Row k="Timeline" v={timeline} />
                </div>
              </div>
            )}

            <div className="mt-8 flex items-center justify-between gap-3">
              {step > 0 ? (
                <button onClick={back} className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-medium">
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
              ) : (
                <Link to="/services" className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-medium">
                  <ArrowLeft className="h-4 w-4" /> Services
                </Link>
              )}
              {step < total - 1 ? (
                <button onClick={next} disabled={step === 0 && !category} className="inline-flex items-center gap-1.5 rounded-full gradient-brand px-6 py-2.5 text-sm font-semibold text-white shadow-soft disabled:opacity-50">
                  Continue <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button onClick={submit} disabled={submitting} className="inline-flex items-center gap-1.5 rounded-full gradient-brand px-6 py-2.5 text-sm font-semibold text-white shadow-soft disabled:opacity-60">
                  {submitting ? (<><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>) : (<>Submit request <ArrowRight className="h-4 w-4" /></>)}
                </button>
              )}
            </div>
            {submitError && (
              <p className="mt-3 text-xs text-destructive">{submitError}</p>
            )}
          </div>
        </div>
      </main>
    </HomeownerShell>
  );
}


const inputCls = "w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

function Header({ title, desc }: { title: string; desc: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}
