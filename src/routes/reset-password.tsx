import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMyWorkspace } from "@/lib/business.functions";
import { useLanguage } from "@/lib/i18n";
import { SiteFooter, SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset your password — SuCasa" },
      { name: "description", content: "Choose a new password for your SuCasa account." },
      { property: "og:title", content: "Reset your password — SuCasa" },
      { property: "og:description", content: "Choose a new password for your SuCasa account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const hash = window.location.hash + window.location.search;
    const isRecovery = hash.includes("type=recovery");
    // Expired or already-used links arrive with an error in the URL.
    const linkFailed = /error(_code)?=/.test(hash);
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (linkFailed) return setReady(false);
      setReady(Boolean(data.session) || isRecovery ? true : false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    setDone(true);
    let home = "/dashboard";
    try {
      home = (await getMyWorkspace()).home;
    } catch {
      /* default */
    }
    navigate({ to: home as "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 px-5 py-12">
        <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-8 shadow-soft">
          <h1 className="text-2xl font-semibold tracking-tight">{t("reset.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("reset.sub")}</p>
          {ready === false ? (
            <p className="mt-6 text-sm text-destructive">{t("reset.invalid")}</p>
          ) : done ? (
            <p className="mt-6 text-sm text-foreground">{t("reset.done")}</p>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-3">
              <label className="block text-sm font-medium">
                {t("reset.label")}
                <input type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary" />
              </label>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <button disabled={busy || ready === null} type="submit" className="w-full rounded-full gradient-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft disabled:opacity-60">
                {busy ? "…" : t("reset.submit")}
              </button>
            </form>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
