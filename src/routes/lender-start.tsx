import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, CheckCircle2, Loader2, Mail, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getAgentAttribution } from "@/lib/agent-funnel";
import {
  recordAuthenticatedAgentEvent,
  recordPublicAgentEvent,
} from "@/lib/agent-funnel.functions";
import { startDiscovery } from "@/lib/discovery.functions";

const searchSchema = z.object({ source: z.string().max(80).optional() });

export const Route = createFileRoute("/lender-start")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "See the opportunities in your database — SuCasa for Loan Officers" },
      {
        name: "description",
        content:
          "Sign in with your email and let SuCasa analyze up to 100 past clients. No card, no contract, no cost.",
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

function LenderStartPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const begin = useServerFn(startDiscovery);
  const recordPublic = useServerFn(recordPublicAgentEvent);
  const recordAuthenticated = useServerFn(recordAuthenticatedAgentEvent);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(true);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  async function finish() {
    if (started.current) return;
    started.current = true;
    setBusy(true);
    setError(null);
    try {
      const attribution = getAgentAttribution();
      void recordAuthenticated({
        data: { action: "lender_discovery_signup_completed", ...attribution },
      });
      await begin({});
      await router.invalidate();
      navigate({ to: "/lender/discovery", replace: true });
    } catch (reason) {
      started.current = false;
      setError(
        reason instanceof Error ? reason.message : "We couldn't finish setting up your workspace.",
      );
      setBusy(false);
    }
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) void finish();
      else setBusy(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) void finish();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const attribution = getAgentAttribution();
    void recordPublic({ data: { action: "lender_discovery_signup_started", ...attribution } });
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/lender-start` },
      });
      if (otpError) throw otpError;
      setSent(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We couldn't send that link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto grid max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(380px,0.65fr)] lg:items-start lg:py-16">
        <section className="pt-2 lg:pt-6">
          <p className="text-sm font-semibold text-status-opportunity">SuCasa for loan officers</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
            Let's look inside your past-client database together.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Upload up to 100 past clients. SuCasa reads the public property record for each home and
            shows you which of those relationships is worth a call today, and why.
          </p>
          <ul className="mt-7 space-y-3 text-sm text-foreground">
            {[
              "No card, no contract, no cost",
              "Up to 100 valid, unique properties analyzed",
              "Your list stays private to your own workspace",
              "No homeowner is contacted and no homeowner data is shared",
            ].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-status-positive" /> {item}
              </li>
            ))}
          </ul>
          <div className="mt-8 rounded-lg border border-surface-intelligence-border bg-surface-intelligence p-4 text-sm text-surface-intelligence-foreground">
            <ShieldCheck className="mb-2 h-5 w-5 text-intelligence-accent" />
            Uploading a list creates no relationship, no permission and no access to any homeowner.
            Anything homeowner-level still requires that homeowner's own choice.
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6 shadow-soft">
          {sent ? (
            <div className="space-y-4 text-center">
              <Mail className="mx-auto h-10 w-10 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Check your email</h2>
              <p className="text-sm text-muted-foreground">
                We sent a sign-in link to <span className="font-medium">{email}</span>. Open it on
                this device and we'll take you straight to your upload.
              </p>
              <button
                type="button"
                className="text-sm font-medium text-primary underline"
                onClick={() => setSent(false)}
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Start your Discovery</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enter your work email. We'll send a one-time sign-in link — no password to
                  remember.
                </p>
              </div>
              <label className="block text-sm font-medium text-foreground">
                Work email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@lender.com"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
              <Button type="submit" className="w-full" disabled={busy || !email.trim()}>
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="mr-2 h-4 w-4" />
                )}
                Email me a sign-in link
              </Button>
              {error ? <p className="text-sm text-status-attention">{error}</p> : null}
              <p className="text-xs text-muted-foreground">
                Already using SuCasa?{" "}
                <Link to="/auth" className="font-medium text-primary underline">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
