import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, CheckCircle2, Loader2, Mail, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { clearProIntent, hasProIntent, markProIntent } from "@/lib/pro-intent";
import { getAgentAttribution } from "@/lib/agent-funnel";
import {
  recordAuthenticatedAgentEvent,
  recordPublicAgentEvent,
} from "@/lib/agent-funnel.functions";
import { startDiscovery } from "@/lib/discovery.functions";
import { useLanguage } from "@/lib/i18n";
import { LENDER_PUBLIC_PLANS } from "@/lib/public-plans";

const searchSchema = z.object({
  source: z.string().max(80).optional(),
  plan: z.string().max(40).optional(),
  intent: z.coerce.string().max(4).optional(),
});

const COMPANY_KEY = "sucasa.lender_company";

/** Public return URL that carries the explicit onboarding intent and the chosen plan. */
function returnUrl(planKey?: string) {
  const q = new URLSearchParams({ intent: "1" });
  if (planKey) q.set("plan", planKey);
  return `${window.location.origin}/lender-start?${q.toString()}`;
}

export const Route = createFileRoute("/lender-start")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "See the opportunities in your database — SuCasa for Loan Officers" },
      {
        name: "description",
        content:
          "Create your account and let SuCasa analyze up to 100 past clients. No card, no contract, no cost.",
      },
      { property: "og:title", content: "Discover the opportunities already in your database" },
      {
        property: "og:description",
        content: "SuCasa analyzes up to 100 of your past clients and shows you who is worth a call.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LenderStartPage,
});

/**
 * Module-level lock: the session check and the auth-state listener can fire in
 * the same tick, and a remount keeps no memory of an in-flight setup. One
 * shared promise guarantees workspace setup runs exactly once per page load.
 */
let workspaceSetup: Promise<void> | null = null;

function LenderStartPage() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const router = useRouter();
  const search = Route.useSearch();
  // A plan picked on the pricing page skips Discovery and survives sign-in,
  // refreshes and the Google round-trip (sessionStorage).
  const [planKey, setPlanKey] = useState<string | undefined>(search.plan);
  const plan = LENDER_PUBLIC_PLANS.find((p) => p.key === planKey);
  useEffect(() => {
    if (search.plan) sessionStorage.setItem("sucasa.lender_plan", search.plan);
    // Choosing Free Discovery explicitly drops any earlier plan choice.
    else if (search.source) sessionStorage.removeItem("sucasa.lender_plan");
    else setPlanKey(sessionStorage.getItem("sucasa.lender_plan") ?? undefined);
    const storedCompany = sessionStorage.getItem(COMPANY_KEY);
    if (storedCompany) setCompany(storedCompany);
  }, [search.plan]);
  const begin = useServerFn(startDiscovery);
  const recordPublic = useServerFn(recordPublicAgentEvent);
  const recordAuthenticated = useServerFn(recordAuthenticatedAgentEvent);
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(true);
  const [sent, setSent] = useState<"magic" | "confirm" | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      if (!workspaceSetup) {
        workspaceSetup = (async () => {
          const attribution = getAgentAttribution();
          void recordAuthenticated({
            data: { action: "lender_discovery_signup_completed", ...attribution },
          });
          const companyName = sessionStorage.getItem(COMPANY_KEY)?.trim() || undefined;
          await begin({ data: { language, companyName } });
        })();
      }
      await workspaceSetup;
      clearProIntent();
      sessionStorage.removeItem(COMPANY_KEY);
      await router.invalidate();
      const picked = search.plan ?? sessionStorage.getItem("sucasa.lender_plan");
      if (picked && LENDER_PUBLIC_PLANS.some((p) => p.key === picked)) {
        navigate({ to: "/lender/billing", search: { checkout: undefined, plan: picked }, replace: true });
      } else navigate({ to: "/lender/discovery", replace: true });
    } catch (reason) {
      workspaceSetup = null;
      setError(reason instanceof Error ? reason.message : t("pub.lstart.error_workspace"));
      setBusy(false);
    }
  }

  // Provision only after an explicit onboarding action — never just because a
  // signed-in visitor (e.g. a homeowner) opened this page.
  useEffect(() => {
    const intended = () => hasProIntent("lender");
    supabase.auth.getUser().then(({ data }) => {
      if (data.user && intended()) void finish();
      else {
        setSignedInEmail(data.user?.email ?? null);
        setBusy(false);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && event === "SIGNED_IN" && intended()) void finish();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  function rememberIntent() {
    markProIntent("lender");
    sessionStorage.setItem(COMPANY_KEY, company.trim());
    const attribution = getAgentAttribution();
    void recordPublic({ data: { action: "lender_discovery_signup_started", ...attribution } });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    rememberIntent();
    try {
      if (mode === "signup") {
        const { data, error: signupError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: returnUrl(plan?.key),
            data: { full_name: fullName.trim() },
          },
        });
        if (signupError) throw signupError;
        if (!data.session) {
          setSent("confirm");
          setBusy(false);
          return;
        }
      } else {
        const { error: signinError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signinError) throw signinError;
      }
      await finish();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("pub.astart.error_generic"));
      setBusy(false);
    }
  }

  async function handleMagic() {
    if (!email.trim()) {
      setError(t("auth.reset_need_email"));
      return;
    }
    setBusy(true);
    setError(null);
    rememberIntent();
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: returnUrl(plan?.key) },
      });
      if (otpError) throw otpError;
      setSent("magic");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("pub.lstart.error_send"));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setBusy(true);
    rememberIntent();
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: returnUrl(plan?.key),
    });
    if (result.error) {
      setError(result.error.message ?? t("pub.astart.error_google"));
      setBusy(false);
      return;
    }
    if (result.redirected) return;
    await finish();
  }

  async function useOtherAccount() {
    await supabase.auth.signOut();
    setSignedInEmail(null);
  }

  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-5 py-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(380px,0.65fr)] lg:items-start lg:py-16">
        <section className="pt-2 lg:pt-6">
          <p className="text-sm font-semibold text-status-opportunity">{t("pub.lstart.eyebrow")}</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
            {t("pub.lstart.h1")}
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            {t("pub.lstart.sub")}
          </p>
          <ul className="mt-7 space-y-3 text-sm text-foreground">
            {[t("pub.lstart.b1"), t("pub.lstart.b2"), t("pub.lstart.b3"), t("pub.lstart.b4")].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-status-positive" />
                <span className="min-w-0 break-words">{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 rounded-lg border border-surface-intelligence-border bg-surface-intelligence p-4 text-sm text-surface-intelligence-foreground">
            <ShieldCheck className="mb-2 h-5 w-5 text-intelligence-accent" />
            {t("pub.lstart.shield")}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6 shadow-soft">
          <h2 className="text-lg font-semibold text-foreground">
            {plan ? t("pub.lstart.plan_title", { name: plan.name }) : mode === "signup" ? t("pro.create") : t("pro.signin_title")}
          </h2>
          {plan ? (
            <p className="mt-1 text-sm text-muted-foreground">{t("pub.lstart.plan_sub", { price: plan.price.replace("/month", "") })}</p>
          ) : null}
          {sent ? (
            <div className="mt-5 space-y-4 text-center">
              <Mail className="mx-auto h-10 w-10 text-primary" />
              <h3 className="font-semibold text-foreground">{sent === "magic" ? t("pub.lstart.sent_title") : t("pro.confirm_title")}</h3>
              <p className="text-sm text-muted-foreground">
                {sent === "magic" ? t("pub.lstart.sent_body", { email }) : t("pro.confirm_body", { email })}
              </p>
              <button type="button" className="text-sm font-medium text-primary underline" onClick={() => setSent(null)}>
                {t("pub.lstart.sent_different")}
              </button>
            </div>
          ) : signedInEmail ? (
            <div className="mt-5 space-y-3">
              <p className="text-sm text-muted-foreground">{t("pro.signed_in_as", { email: signedInEmail })}</p>
              <label className="block text-sm font-medium text-foreground">
                {t("pro.company_label")}
                <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder={t("pro.company_placeholder")} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
              </label>
              <Button type="button" className="min-h-12 w-full" disabled={busy} onClick={() => { rememberIntent(); void finish(); }}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                {t("pro.lender_continue")}
              </Button>
              {error ? <p role="alert" className="text-sm text-status-attention">{error}</p> : null}
              <button type="button" className="min-h-11 w-full text-sm font-medium text-primary" onClick={useOtherAccount}>
                {t("pro.other_account")}
              </button>
            </div>
          ) : (
            <>
              <Button type="button" variant="outline" className="mt-5 min-h-12 w-full" onClick={handleGoogle} disabled={busy}>
                {t("pub.astart.google")}
              </Button>
              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />{t("pub.astart.or_email")}<span className="h-px flex-1 bg-border" /></div>
              <form onSubmit={handleSubmit} className="space-y-3">
                {mode === "signup" && (
                  <>
                    <label className="block text-sm font-medium text-foreground">
                      {t("pub.astart.full_name")}
                      <input required value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
                    </label>
                    <label className="block text-sm font-medium text-foreground">
                      {t("pro.company_label")}
                      <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder={t("pro.company_placeholder")} autoComplete="organization" className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
                    </label>
                  </>
                )}
                <label className="block text-sm font-medium text-foreground">
                  {t("pub.lstart.email_label")}
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@lender.com" className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
                </label>
                <label className="block text-sm font-medium text-foreground">
                  {t("pub.astart.password")}
                  <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
                </label>
                {error ? <p role="alert" className="text-sm text-status-attention">{error}</p> : null}
                <Button type="submit" className="min-h-12 w-full" disabled={busy}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                  {mode === "signup" ? t("pro.submit_signup") : t("pro.submit_signin")}
                </Button>
              </form>
              <button type="button" className="mt-4 min-h-11 w-full text-sm font-semibold text-primary" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(null); }}>
                {mode === "signup" ? t("pro.toggle_to_signin") : t("pro.toggle_to_signup")}
              </button>
              <div className="mt-2 flex flex-col items-center gap-1 text-xs text-muted-foreground">
                <span>
                  {t("pro.magic_instead")}{" "}
                  <button type="button" onClick={handleMagic} disabled={busy} className="font-medium text-primary underline">{t("pro.magic_send")}</button>
                </span>
                {mode === "signin" && (
                  <Link to="/auth" search={{ forgot: "1" }} className="font-medium text-primary underline">{t("pro.forgot")}</Link>
                )}
              </div>
            </>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
