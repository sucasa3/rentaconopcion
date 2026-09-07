import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Home,
  Loader2,
  MessageSquare,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { activateAgentWorkspace, getInvitePreview } from "@/lib/agent-onboarding.functions";

export const Route = createFileRoute("/agent-invite")({
  validateSearch: z.object({ t: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Your SuCasa invitation — activate your agent workspace" },
      {
        name: "description",
        content:
          "Accept your SuCasa invitation and turn your past clients into your next opportunities.",
      },
      { property: "og:title", content: "Your SuCasa invitation" },
      {
        property: "og:description",
        content: "Activate your SuCasa agent workspace in about 60 seconds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AgentInvitePage,
});

function AgentInvitePage() {
  const { t: token } = Route.useSearch();
  const previewFn = useServerFn(getInvitePreview);
  const { data, isLoading } = useQuery({
    queryKey: ["invite-preview", token],
    enabled: Boolean(token),
    queryFn: () => previewFn({ data: { token: token! } }),
    staleTime: 60_000,
  });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">
        {!token ? (
          <Centered>
            <h1 className="text-2xl font-semibold tracking-tight">Invitation link needed</h1>
            <p className="mt-2 text-muted-foreground">
              Open the link from your invitation email to continue.
            </p>
          </Centered>
        ) : isLoading ? (
          <Centered>
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
          </Centered>
        ) : !data?.valid ? (
          <Centered>
            <h1 className="text-2xl font-semibold tracking-tight">
              {data && "reason" in data && data.reason === "expired"
                ? "This invitation has expired"
                : "This invitation link isn't valid"}
            </h1>
            <p className="mt-2 text-muted-foreground">
              Ask the lender who invited you to send a new invitation.
            </p>
          </Centered>
        ) : (
          <InviteBody preview={data} token={token} />
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-md px-5 py-20 text-center">{children}</div>;
}

type Preview = Extract<Awaited<ReturnType<typeof getInvitePreview>>, { valid: true }>;

function InviteBody({ preview, token }: { preview: Preview; token: string }) {
  const activateRef = useRef<HTMLDivElement | null>(null);
  const scrollToActivate = () =>
    activateRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="mx-auto max-w-xl px-5 pb-24">
      {/* Hero */}
      <section className="pt-10 sm:pt-14">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Invited by {preview.lenderName}
        </p>
        <h1 className="mt-3 text-[2rem] font-semibold leading-[1.1] tracking-tight sm:text-4xl">
          Turn your past clients into your next opportunities.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          SuCasa watches the homes your clients already own and tells you who may be worth
          a call — and what to say when you reach them.
        </p>
        <button
          type="button"
          onClick={scrollToActivate}
          className="mt-6 inline-flex min-h-[48px] items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-soft transition active:scale-[0.98]"
        >
          Activate my SuCasa <ArrowRight className="h-4 w-4" />
        </button>
        <p className="mt-3 text-sm text-muted-foreground">
          {preview.sponsored
            ? `${preview.lenderName} is covering your access.`
            : `Invitation for ${preview.invitedEmail}.`}
        </p>
        {preview.message && (
          <p className="mt-5 border-l-2 border-primary/60 pl-4 text-sm italic text-muted-foreground">
            “{preview.message}”
          </p>
        )}
      </section>

      {/* Product preview — illustrative examples, not real homeowner data. */}
      <section className="mt-12 space-y-8">
        <Preview1 />
        <Preview2 />
        <Preview3 />
      </section>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Examples shown for illustration. Your own homeowners appear after you activate.
      </p>

      {/* Activation */}
      <section ref={activateRef} className="mt-12 scroll-mt-6">
        <Activation preview={preview} token={token} />
      </section>
    </div>
  );
}

function PreviewFrame({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {eyebrow}
      </p>
      <h2 className="mt-1.5 text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 rounded-3xl border border-border/70 bg-card p-4 shadow-soft">
        {children}
      </div>
    </div>
  );
}

function Preview1() {
  return (
    <PreviewFrame eyebrow="Every morning" title="Know who needs you today">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Your best move
      </p>
      <p className="mt-1 text-lg font-semibold">Maria Delgado</p>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Owned 7 years · equity has grown steadily · pulled a remodel permit
      </p>
      <p className="mt-3 text-sm font-medium">
        Check in on the remodel and offer a value update.
      </p>
      <div className="mt-3 flex gap-2">
        <span className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          Call
        </span>
        <span className="rounded-full border border-border/70 px-4 py-2 text-sm font-semibold">
          Write email
        </span>
      </div>
    </PreviewFrame>
  );
}

function Preview2() {
  return (
    <PreviewFrame
      eyebrow="Hidden in your database"
      title="Find listings you already earned"
    >
      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { label: "Tenure", value: "7 yrs", icon: Home },
          { label: "Equity", value: "Strong", icon: TrendingUp },
          { label: "Signal", value: "Permit", icon: Sparkles },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl bg-secondary/60 px-2 py-3">
            <s.icon className="mx-auto h-4 w-4 text-primary" />
            <p className="mt-1 text-sm font-semibold">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Modeled estimates and signals, not appraisals or guarantees.
      </p>
    </PreviewFrame>
  );
}

function Preview3() {
  return (
    <PreviewFrame eyebrow="Before you dial" title="Never wonder what to say">
      <p className="text-sm font-medium">Suggested opener</p>
      <p className="mt-1 rounded-2xl bg-secondary/60 p-3 text-sm text-muted-foreground">
        “Hi Maria — saw the permit activity on your street. Want a quick update on what
        your home may be worth today?”
      </p>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <MessageSquare className="h-3.5 w-3.5" /> Copy, text or email in one tap
      </div>
    </PreviewFrame>
  );
}

/** Sign-in / sign-up, then workspace provisioning. */
function Activation({ preview, token }: { preview: Preview; token: string }) {
  const navigate = useNavigate();
  const [sessionReady, setSessionReady] = useState<boolean | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState(preview.invitedName ?? "");
  const [agencyName, setAgencyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessionReady(Boolean(data.session));
      setSessionEmail(data.session?.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSessionReady(Boolean(session));
      setSessionEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const activateFn = useServerFn(activateAgentWorkspace);
  const activate = useMutation({
    mutationFn: () =>
      activateFn({ data: { token, agencyName: agencyName.trim() || undefined } }),
  });

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: preview.invitedEmail,
          password,
          options: { emailRedirectTo: window.location.href, data: { full_name: fullName } },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: preview.invitedEmail,
          password,
        });
        if (error) throw error;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.href,
    });
    if (result.error) setError(result.error.message ?? "Google sign-in failed");
  }

  if (sessionReady === null) {
    return (
      <div className="rounded-3xl border border-border/70 bg-card p-6 text-center shadow-soft">
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (preview.status !== "invited") {
    return (
      <div className="rounded-3xl border border-border/70 bg-card p-6 shadow-soft">
        <h2 className="text-xl font-semibold tracking-tight">This invitation is already used</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in and you'll land straight in your workspace.
        </p>
        <button
          type="button"
          onClick={() => navigate({ to: "/auth" })}
          className="mt-4 inline-flex min-h-[48px] items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground"
        >
          Go to sign in
        </button>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="rounded-3xl border border-border/70 bg-card p-6 shadow-soft">
        <h2 className="text-xl font-semibold tracking-tight">
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your invitation is for <span className="font-medium">{preview.invitedEmail}</span>.
        </p>

        <button
          type="button"
          onClick={handleGoogle}
          className="mt-5 flex min-h-[48px] w-full items-center justify-center rounded-full border border-border bg-background text-sm font-medium hover:bg-secondary"
        >
          Continue with Google
        </button>

        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleAuth} className="space-y-3">
          {mode === "signup" && (
            <input
              type="text"
              required
              placeholder="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="min-h-[48px] w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:border-primary"
            />
          )}
          <input
            type="email"
            value={preview.invitedEmail}
            readOnly
            aria-label="Invited email"
            className="min-h-[48px] w-full rounded-2xl border border-border bg-secondary/60 px-4 text-sm text-muted-foreground"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-[48px] w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:border-primary"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Activate my SuCasa"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
          className="mt-4 w-full text-sm font-medium text-primary"
        >
          {mode === "signup" ? "I already have an account" : "I need to create an account"}
        </button>
      </div>
    );
  }

  const wrongAccount =
    sessionEmail && sessionEmail.toLowerCase() !== preview.invitedEmail.toLowerCase();

  if (wrongAccount && !activate.data) {
    return (
      <div className="rounded-3xl border border-border/70 bg-card p-6 shadow-soft">
        <h2 className="text-xl font-semibold tracking-tight">Signed in as a different account</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This invitation was sent to {preview.invitedEmail}. Sign out and sign back in with
          that address to connect {preview.lenderName}.
        </p>
        <button
          type="button"
          onClick={async () => {
            await supabase.auth.signOut();
          }}
          className="mt-4 inline-flex min-h-[48px] items-center rounded-full border border-border px-6 text-sm font-semibold"
        >
          Sign out
        </button>
      </div>
    );
  }

  if (activate.data) {
    return <Provisioned result={activate.data} lenderName={preview.lenderName} />;
  }

  return (
    <div className="rounded-3xl border border-border/70 bg-card p-6 shadow-soft">
      <h2 className="text-xl font-semibold tracking-tight">One detail and you're in</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        What should we call your business? You can change this later.
      </p>
      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-border bg-background px-4">
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          type="text"
          placeholder="Your brokerage or team name"
          value={agencyName}
          onChange={(e) => setAgencyName(e.target.value)}
          className="min-h-[48px] w-full bg-transparent text-sm outline-none"
        />
      </div>
      {activate.error && (
        <p className="mt-3 text-sm text-destructive">{(activate.error as Error).message}</p>
      )}
      <button
        type="button"
        onClick={() => activate.mutate()}
        disabled={activate.isPending}
        className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {activate.isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Setting up your workspace…
          </>
        ) : (
          <>
            Enter SuCasa <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </div>
  );
}

function Provisioned({
  result,
  lenderName,
}: {
  result: Awaited<ReturnType<typeof activateAgentWorkspace>>;
  lenderName: string;
}) {
  const navigate = useNavigate();
  const steps = [
    { label: "Workspace created", done: true },
    {
      label: result.connectedLender ? `${result.connectedLender} connected` : `${lenderName} invitation saved`,
      done: Boolean(result.connectedLender),
    },
    { label: "Your book is ready for homeowners", done: true },
  ];
  return (
    <div className="rounded-3xl border border-border/70 bg-card p-6 shadow-soft">
      <h2 className="text-xl font-semibold tracking-tight">You're set up</h2>
      <ul className="mt-4 space-y-2.5">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-2.5 text-sm">
            <CheckCircle2
              className={`h-5 w-5 shrink-0 ${s.done ? "text-primary" : "text-muted-foreground/50"}`}
            />
            <span className={s.done ? "" : "text-muted-foreground"}>{s.label}</span>
          </li>
        ))}
      </ul>
      {result.connectionError && (
        <p className="mt-3 text-sm text-muted-foreground">{result.connectionError}</p>
      )}
      <button
        type="button"
        onClick={() => navigate({ to: "/agent" })}
        className="mt-5 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground"
      >
        Enter SuCasa <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
