import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import { useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Home } from "lucide-react";
import { syncMyHomeToFello } from "@/lib/fello.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Create Your Home Profile — SuCasa" },
      { name: "description", content: "Set up your free Home Profile in under 2 minutes." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Onboarding,
});

const GOALS = [
  { id: "save", label: "Save money" },
  { id: "maintenance", label: "Stay on top of maintenance" },
  { id: "value", label: "Grow home value" },
  { id: "remodel", label: "Remodel or renovate" },
];

const HOME_TYPES = ["Single-family", "Townhouse", "Condo", "Multi-family"];

function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", address: "", homeType: "Single-family", yearBuilt: "", goals: [] as string[],
  });

  const steps = ["About you", "Your home", "Your goals", "Review"];
  const total = steps.length;

  const toggleGoal = (id: string) => setForm(f => ({ ...f, goals: f.goals.includes(id) ? f.goals.filter(g => g !== id) : [...f.goals, id] }));

  const felloSync = useServerFn(syncMyHomeToFello);
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    setSubmitting(true);
    try {
      // Parse "Street, City, ST 12345" best-effort
      const m = form.address.match(/^\s*(.+?),\s*([^,]+?),\s*([A-Z]{2})\s*(\d{5})?\s*$/i);
      const street = m ? m[1].trim() : form.address.trim();
      const city = m ? m[2].trim() : null;
      const state = m ? m[3].toUpperCase() : null;
      const zip = m ? (m[4] ?? null) : null;
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (uid) {
        const upRes = await supabase.from("profiles").upsert({
          id: uid,
          full_name: form.name || null,
          email: form.email || userRes.user?.email || null,
          phone: form.phone || null,
          address: street || null,
          city, state, zip,
          last_activity_at: new Date().toISOString(),
        }, { onConflict: "id" }); console.log("PROFILE_UPSERT", JSON.stringify(upRes));
      }
      try { await felloSync(); } catch { /* non-blocking */ }
    } finally {
      navigate({ to: "/dashboard" });
    }
  };

  const next = () => setStep(s => Math.min(s + 1, total - 1));
  const back = () => setStep(s => Math.max(s - 1, 0));

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 px-5 py-10">
        <div className="mx-auto max-w-xl">
          <div className="mb-6">
            <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>Step {step + 1} of {total}</span>
              <span>{steps[step]}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full gradient-brand transition-all" style={{ width: `${((step + 1) / total) * 100}%` }} />
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-8">
            {step === 0 && (
              <div className="space-y-4">
                <Header title="Let’s get to know you" desc="We’ll use this to personalize your Home Profile." />
                <Field label="Full name"><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" /></Field>
                <Field label="Email"><input type="email" className={inputCls} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="jane@example.com" /></Field>
                <Field label="Phone"><input type="tel" className={inputCls} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="(555) 123-4567" /></Field>
              </div>
            )}
            {step === 1 && (
              <div className="space-y-4">
                <Header title="About your home" desc="This helps us tailor value and maintenance insights." />
                <Field label="Property address"><input className={inputCls} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="123 Main St, Austin, TX" /></Field>
                <Field label="Home type">
                  <div className="grid grid-cols-2 gap-2">
                    {HOME_TYPES.map(t => (
                      <button key={t} type="button" onClick={() => setForm({ ...form, homeType: t })} className={`rounded-2xl border px-4 py-3 text-sm transition ${form.homeType === t ? "border-primary bg-primary/5 text-primary" : "border-border text-foreground hover:bg-secondary"}`}>{t}</button>
                    ))}
                  </div>
                </Field>
                <Field label="Year built"><input inputMode="numeric" className={inputCls} value={form.yearBuilt} onChange={e => setForm({ ...form, yearBuilt: e.target.value })} placeholder="1998" /></Field>
              </div>
            )}
            {step === 2 && (
              <div className="space-y-4">
                <Header title="What are your goals?" desc="Pick all that apply." />
                <div className="grid gap-2">
                  {GOALS.map(g => {
                    const active = form.goals.includes(g.id);
                    return (
                      <button key={g.id} type="button" onClick={() => toggleGoal(g.id)} className={`flex items-center justify-between rounded-2xl border px-4 py-4 text-left text-sm transition ${active ? "border-primary bg-primary/5" : "border-border hover:bg-secondary"}`}>
                        <span className="font-medium">{g.label}</span>
                        {active && <CheckCircle2 className="h-5 w-5 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {step === 3 && (
              <div className="space-y-4">
                <Header title="Review & create profile" desc="Confirm your details to unlock your dashboard." />
                <div className="rounded-2xl border border-border p-4 text-sm">
                  <ReviewRow k="Name" v={form.name || "—"} />
                  <ReviewRow k="Email" v={form.email || "—"} />
                  <ReviewRow k="Phone" v={form.phone || "—"} />
                  <ReviewRow k="Address" v={form.address || "—"} />
                  <ReviewRow k="Home type" v={form.homeType} />
                  <ReviewRow k="Year built" v={form.yearBuilt || "—"} />
                  <ReviewRow k="Goals" v={form.goals.length ? form.goals.map(id => GOALS.find(g => g.id === id)!.label).join(", ") : "—"} />
                </div>
                <div className="rounded-2xl bg-accent p-4 text-sm text-accent-foreground">
                  <span className="inline-flex items-center gap-2 font-medium"><Home className="h-4 w-4" /> You're all set—your dashboard is ready.</span>
                </div>
              </div>
            )}

            <div className="mt-8 flex items-center justify-between gap-3">
              {step > 0 ? (
                <button onClick={back} className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-medium">
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
              ) : (
                <Link to="/" className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-medium">
                  <ArrowLeft className="h-4 w-4" /> Home
                </Link>
              )}
              {step < total - 1 ? (
                <button onClick={next} className="inline-flex items-center gap-1.5 rounded-full gradient-brand px-6 py-2.5 text-sm font-semibold text-white shadow-soft">
                  Continue <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button onClick={submit} disabled={submitting} className="inline-flex items-center gap-1.5 rounded-full gradient-brand px-6 py-2.5 text-sm font-semibold text-white shadow-soft disabled:opacity-60">
                  {submitting ? "Creating…" : "Create Profile"} <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
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
function ReviewRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-2 last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}
