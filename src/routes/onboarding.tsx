import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Home } from "lucide-react";
import { getMyHomeIntel } from "@/lib/property-intel.functions";
import { supabase } from "@/integrations/supabase/client";
import { AddressAutocomplete, type AddressValue } from "@/components/address-autocomplete";
import { useLanguage, type Language, type TranslationKey } from "@/lib/i18n";

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

const GOALS: { id: string; labelKey: TranslationKey }[] = [
  { id: "save", labelKey: "ob.goal.save" },
  { id: "maintenance", labelKey: "ob.goal.maintenance" },
  { id: "value", labelKey: "ob.goal.value" },
  { id: "remodel", labelKey: "ob.goal.remodel" },
];

const HOME_TYPES: { value: string; labelKey: TranslationKey }[] = [
  { value: "Single-family", labelKey: "ob.home_type.single" },
  { value: "Townhouse", labelKey: "ob.home_type.town" },
  { value: "Condo", labelKey: "ob.home_type.condo" },
  { value: "Multi-family", labelKey: "ob.home_type.multi" },
];

const STEP_KEYS: TranslationKey[] = [
  "ob.step.about",
  "ob.step.home",
  "ob.step.goals",
  "ob.step.review",
];

function Onboarding() {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", address: "", city: "", state: "", zip: "", homeType: "Single-family", yearBuilt: "", goals: [] as string[],
  });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // undefined while we check, null when signed out.
  const [signedIn, setSignedIn] = useState<boolean | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      setSignedIn(Boolean(data.user));
      if (data.user) {
        setForm(f => ({
          ...f,
          email: f.email || data.user!.email || "",
          name: f.name || (data.user!.user_metadata?.full_name as string) || "",
        }));
      }
    });
    return () => { alive = false; };
  }, []);

  const needsAccount = signedIn === false;

  const total = STEP_KEYS.length;

  const toggleGoal = (id: string) => setForm(f => ({ ...f, goals: f.goals.includes(id) ? f.goals.filter(g => g !== id) : [...f.goals, id] }));

  const prewarmIntel = useServerFn(getMyHomeIntel);
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    setError(null);
    setEmailTaken(false);

    if (needsAccount) {
      if (!form.email.trim()) { setError(t("ob.err.email")); setStep(0); return; }
      if (password.length < 6) { setError(t("ob.err.password")); setStep(0); return; }
      if (password !== confirmPassword) { setError(t("ob.err.password_match")); setStep(0); return; }
    }

    // Accept a pasted "123 Main St, Roswell, GA 30075" in the street field, but
    // otherwise use the explicit city / state / ZIP inputs.
    const m = form.address.match(/^\s*(.+?),\s*([^,]+?),\s*([A-Z]{2})\s*(\d{5})?\s*$/i);
    const street = (m ? m[1] : form.address).trim().replace(/[.,\s]+$/, "");
    const city = (m ? m[2].trim() : form.city.trim()) || null;
    const state = (m ? m[3].toUpperCase() : form.state.trim().toUpperCase()) || null;
    const zip = (m ? (m[4] ?? form.zip.trim()) : form.zip.trim()) || null;

    if (street && !((city && state) || zip)) {
      setError(t("ob.err.city_state"));
      setStep(1);
      return;
    }

    setSubmitting(true);
    try {

      if (needsAccount) {
        const { error: signUpError } = await supabase.auth.signUp({
          email: form.email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: form.name },
          },
        });
        if (signUpError) {
          const msg = signUpError.message || "";
          if (/already|registered|exists/i.test(msg)) {
            setEmailTaken(true);
            setError(t("ob.err.email_taken"));
          } else {
            setError(msg || t("ob.err.generic"));
          }
          setSubmitting(false);
          setStep(0);
          return;
        }
      }

      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;

      if (!uid) {
        // Account created but no session yet (email confirmation required).
        setSubmitting(false);
        setError(t("ob.err.confirm_email"));
        return;
      }

      const upRes = await supabase.from("profiles").upsert({
        id: uid,
        full_name: form.name || null,
        email: form.email || userRes.user?.email || null,
        phone: form.phone || null,
        address: street || null,
        city, state, zip,
        language,
        last_activity_at: new Date().toISOString(),
      }, { onConflict: "id" });
      if (upRes.error) console.log("[onboarding] profile save error", upRes.error.message);

      // Warm the property-records cache for the address they just entered so
      // the dashboard has value / equity / detail on first paint.
      // Requires a live session — the server fn is auth-only.
      const { data: sessionRes } = await supabase.auth.getSession();
      if (sessionRes.session?.access_token) {
        try {
          await prewarmIntel({
            data: {
              classes: ["avm", "detail", "mortgage"],
              revenueSource: "signup_enrichment",
            },
          });
        } catch (e) {
          console.log("[onboarding] property records prewarm failed", e);
        }
      }
    } catch (e) {
      console.log("[onboarding] submit error", e);
      setError(e instanceof Error ? e.message : t("ob.err.unknown"));
      setSubmitting(false);
      return;
    }
    navigate({ to: "/dashboard" });
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
              <span>{t("ob.step_of", { current: step + 1, total })}</span>
              <span>{t(STEP_KEYS[step])}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full gradient-brand transition-all" style={{ width: `${((step + 1) / total) * 100}%` }} />
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-8">
            {step === 0 && (
              <div className="space-y-4">
                <Header title={t("ob.about.title")} desc={t("ob.about.desc")} />
                <Field label={t("ob.field.full_name")}><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={t("ob.ph.name")} /></Field>
                <Field label={t("ob.field.email")}><input type="email" className={inputCls} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder={t("ob.ph.email")} /></Field>
                <Field label={t("ob.field.phone")}><input type="tel" className={inputCls} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder={t("ob.ph.phone")} /></Field>
                {needsAccount && (
                  <>
                    <Field label={t("ob.field.password")}><input type="password" autoComplete="new-password" className={inputCls} value={password} onChange={e => setPassword(e.target.value)} placeholder={t("ob.ph.password")} /></Field>
                    <Field label={t("ob.field.confirm_password")}><input type="password" autoComplete="new-password" className={inputCls} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder={t("ob.ph.confirm")} /></Field>
                  </>
                )}

                <Field label={t("ob.field.language")}>
                  <div className="grid grid-cols-2 gap-2">
                    {(["en", "es"] as Language[]).map(l => (
                      <button key={l} type="button" onClick={() => { void setLanguage(l); }} className={`rounded-2xl border px-4 py-3 text-sm transition ${language === l ? "border-primary bg-primary/5 text-primary" : "border-border text-foreground hover:bg-secondary"}`}>
                        {l === "en" ? t("common.english") : t("common.spanish")}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <Header title={t("ob.home.title")} desc={t("ob.home.desc")} />
                <Field label={t("ob.field.address")}>
                  <AddressAutocomplete
                    value={{ street: form.address, city: form.city, state: form.state, zip: form.zip }}
                    onChange={(v: AddressValue) =>
                      setForm({ ...form, address: v.street, city: v.city, state: v.state, zip: v.zip })
                    }
                  />
                </Field>

                <Field label={t("ob.field.home_type")}>
                  <div className="grid grid-cols-2 gap-2">
                    {HOME_TYPES.map(ht => (
                      <button key={ht.value} type="button" onClick={() => setForm({ ...form, homeType: ht.value })} className={`rounded-2xl border px-4 py-3 text-sm transition ${form.homeType === ht.value ? "border-primary bg-primary/5 text-primary" : "border-border text-foreground hover:bg-secondary"}`}>{t(ht.labelKey)}</button>
                    ))}
                  </div>
                </Field>
                <Field label={t("ob.field.year_built")}><input inputMode="numeric" className={inputCls} value={form.yearBuilt} onChange={e => setForm({ ...form, yearBuilt: e.target.value })} placeholder="1998" /></Field>
              </div>
            )}
            {step === 2 && (
              <div className="space-y-4">
                <Header title={t("ob.goals.title")} desc={t("ob.goals.desc")} />
                <div className="grid gap-2">
                  {GOALS.map(g => {
                    const active = form.goals.includes(g.id);
                    return (
                      <button key={g.id} type="button" onClick={() => toggleGoal(g.id)} className={`flex items-center justify-between rounded-2xl border px-4 py-4 text-left text-sm transition ${active ? "border-primary bg-primary/5" : "border-border hover:bg-secondary"}`}>
                        <span className="font-medium">{t(g.labelKey)}</span>
                        {active && <CheckCircle2 className="h-5 w-5 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {step === 3 && (
              <div className="space-y-4">
                <Header title={t("ob.review.title")} desc={t("ob.review.desc")} />
                <div className="rounded-2xl border border-border p-4 text-sm">
                  <ReviewRow k={t("ob.review.name")} v={form.name || "—"} />
                  <ReviewRow k={t("ob.review.email")} v={form.email || "—"} />
                  <ReviewRow k={t("ob.review.phone")} v={form.phone || "—"} />
                  <ReviewRow k={t("ob.review.address")} v={[form.address, form.city, [form.state, form.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—"} />
                  <ReviewRow k={t("ob.review.home_type")} v={t(HOME_TYPES.find(h => h.value === form.homeType)?.labelKey ?? "ob.home_type.single")} />
                  <ReviewRow k={t("ob.review.year_built")} v={form.yearBuilt || "—"} />
                  <ReviewRow k={t("ob.review.goals")} v={form.goals.length ? form.goals.map(id => t(GOALS.find(g => g.id === id)!.labelKey)).join(", ") : "—"} />
                  <ReviewRow k={t("ob.review.language")} v={language === "es" ? t("common.spanish") : t("common.english")} />

                </div>
                <div className="rounded-2xl bg-accent p-4 text-sm text-accent-foreground">
                  <span className="inline-flex items-center gap-2 font-medium"><Home className="h-4 w-4" /> {t("ob.review.ready")}</span>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {error}
                {emailTaken && (
                  <>
                    {" "}
                    <Link to="/auth" className="font-semibold underline">{t("ob.sign_in_instead")}</Link>
                  </>
                )}
              </div>
            )}

            <div className="mt-8 flex items-center justify-between gap-3">

              {step > 0 ? (
                <button onClick={back} className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-medium">
                  <ArrowLeft className="h-4 w-4" /> {t("common.back")}
                </button>
              ) : (
                <Link to="/" className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-medium">
                  <ArrowLeft className="h-4 w-4" /> {t("common.home")}
                </Link>
              )}
              {step < total - 1 ? (
                <button onClick={next} className="inline-flex items-center gap-1.5 rounded-full gradient-brand px-6 py-2.5 text-sm font-semibold text-white shadow-soft">
                  {t("common.continue")} <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button onClick={submit} disabled={submitting} className="inline-flex items-center gap-1.5 rounded-full gradient-brand px-6 py-2.5 text-sm font-semibold text-white shadow-soft disabled:opacity-60">
                  {submitting ? t("ob.creating") : t("ob.create_profile")} <ArrowRight className="h-4 w-4" />
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
