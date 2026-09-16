import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Building2, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { activateAgentWorkspace } from "@/lib/agent-onboarding.functions";
import { getAgentAttribution } from "@/lib/agent-funnel.client";
import { recordAuthenticatedAgentEvent, recordPublicAgentEvent } from "@/lib/agent-funnel.functions";

const searchSchema = z.object({ source: z.string().max(80).optional() });

export const Route = createFileRoute("/agent-start")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Start Free — SuCasa for Real Estate Agents" },
      { name: "description", content: "Create your free SuCasa agent account and start with up to 100 Home Profiles. No credit card required." },
      { property: "og:title", content: "Start free with SuCasa for Agents" },
      { property: "og:description", content: "Create your agent workspace and start with up to 100 Home Profiles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AgentStartPage,
});

const AGENCY_KEY = "sucasa_agent_agency_v1";

function AgentStartPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const activate = useServerFn(activateAgentWorkspace);
  const recordPublic = useServerFn(recordPublicAgentEvent);
  const recordAuthenticated = useServerFn(recordAuthenticatedAgentEvent);
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [fullName, setFullName] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activationStarted = useRef(false);

  async function finishActivation() {
    if (activationStarted.current) return;
    activationStarted.current = true;
    setBusy(true);
    setError(null);
    try {
      const attribution = getAgentAttribution();
      const storedAgency = agencyName.trim() || window.sessionStorage.getItem(AGENCY_KEY)?.trim() || undefined;
      await recordAuthenticated({ data: { action: "agent_signup_completed", ...attribution } });
      await activate({ data: { agencyName: storedAgency } });
      window.sessionStorage.removeItem(AGENCY_KEY);
      await router.invalidate();
      navigate({ to: "/agent", replace: true });
    } catch (reason) {
      activationStarted.current = false;
      setError(reason instanceof Error ? reason.message : "We couldn't finish setting up your workspace.");
      setBusy(false);
    }
  }

  useEffect(() => {
    const storedAgency = window.sessionStorage.getItem(AGENCY_KEY);
    if (storedAgency) setAgencyName(storedAgency);
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) void finishActivation();
      else setBusy(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) void finishActivation();
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const attribution = getAgentAttribution();
    void recordPublic({ data: { action: "agent_signup_started", ...attribution } });
    try {
      window.sessionStorage.setItem(AGENCY_KEY, agencyName.trim());
      if (mode === "signup") {
        const { data, error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/agent-start`,
            data: { full_name: fullName },
          },
        });
        if (signupError) throw signupError;
        if (!data.session) {
          setMessage("Check your email to confirm your address. Then we'll finish your agent workspace here.");
          setBusy(false);
          return;
        }
        await finishActivation();
      } else {
        const { error: signinError } = await supabase.auth.signInWithPassword({ email, password });
        if (signinError) throw signinError;
        await finishActivation();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong.");
      setBusy(false);
    }
  }

  async function handleGoogle() {
    if (!agencyName.trim()) {
      setError("Enter your brokerage or team name before continuing with Google.");
      return;
    }
    setError(null);
    setBusy(true);
    const attribution = getAgentAttribution();
    void recordPublic({ data: { action: "agent_signup_started", ...attribution } });
    window.sessionStorage.setItem(AGENCY_KEY, agencyName.trim());
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/agent-start`,
    });
    if (result.error) {
      setError(result.error.message ?? "Google sign-in failed.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto grid max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,0.7fr)] lg:items-start lg:py-16">
        <section className="pt-2 lg:pt-8">
          <p className="text-sm font-semibold text-status-opportunity">SuCasa for real-estate agents</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
            Turn the relationships you already have into a clear next move.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Start with up to 100 Home Profiles free. Import when you're ready—not before you enter your workspace.
          </p>
          <ul className="mt-7 space-y-3 text-sm text-foreground">
            {[
              "No credit card required",
              "Your own agent workspace",
              "No lender, sponsor, or provider access created",
            ].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-status-positive" /> {item}
              </li>
            ))}
          </ul>
          <div className="mt-8 rounded-lg border border-surface-intelligence-border bg-surface-intelligence p-4 text-sm text-surface-intelligence-foreground">
            <ShieldCheck className="mb-2 h-5 w-5 text-intelligence-accent" />
            Your homeowner relationships remain yours. Access still requires the existing relationship, permission, and consent rules.
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5 shadow-elevated sm:p-7" aria-labelledby="account-heading">
          <h2 id="account-heading" className="text-2xl font-semibold">{mode === "signup" ? "Create your agent account" : "Sign in to your agent account"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your workspace is created after your account is confirmed.</p>
          {message ? (
            <div className="mt-6 rounded-lg border border-surface-intelligence-border bg-surface-intelligence p-5">
              <CheckCircle2 className="h-6 w-6 text-status-positive" />
              <p className="mt-3 font-semibold">Confirm your email</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{message}</p>
            </div>
          ) : (
            <>
              <div className="mt-6">
                <label className="text-sm font-medium" htmlFor="agency">Brokerage or team name</label>
                <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-md border border-input px-3 focus-within:ring-2 focus-within:ring-ring">
                  <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input id="agency" required value={agencyName} onChange={(e) => setAgencyName(e.target.value)} placeholder="Your business name" className="min-h-12 min-w-0 bg-transparent text-sm outline-none" />
                </div>
              </div>
              <Button type="button" variant="outline" className="mt-4 min-h-12 w-full" onClick={handleGoogle} disabled={busy}>
                Continue with Google
              </Button>
              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or use email<span className="h-px flex-1 bg-border" /></div>
              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === "signup" && (
                  <label className="block text-sm font-medium">Full name<input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-2 min-h-12 w-full rounded-md border border-input px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
                )}
                <label className="block text-sm font-medium">Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 min-h-12 w-full rounded-md border border-input px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
                <label className="block text-sm font-medium">Password<input type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 min-h-12 w-full rounded-md border border-input px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="min-h-12 w-full bg-sucasa-orange text-sucasa-orange-foreground hover:bg-sucasa-orange/90" disabled={busy || !agencyName.trim()}>
                  {busy ? <Loader2 className="animate-spin" /> : mode === "signup" ? "Get 100 Home Profiles Free" : "Sign in and continue"}
                  {!busy && <ArrowRight />}
                </Button>
              </form>
              <button type="button" className="mt-5 min-h-11 w-full text-sm font-semibold text-primary" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(null); }}>
                {mode === "signup" ? "Already have an account? Sign in" : "New agent? Create an account"}
              </button>
            </>
          )}
          <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">By continuing, you agree to SuCasa's terms and privacy practices.</p>
          <p className="mt-3 text-center text-xs text-muted-foreground"><Link to="/agents" className="font-semibold text-primary">Back to SuCasa for Agents</Link></p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
