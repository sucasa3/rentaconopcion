import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { acceptLoanOfficerInvite } from "@/lib/lender-team.functions";
import { useT } from "@/lib/i18n";

const AFTER_AUTH_KEY = "sucasa.after_auth";

export const Route = createFileRoute("/team-invite")({
  validateSearch: (s: Record<string, unknown>) => ({
    t: typeof s["t"] === "string" ? (s["t"] as string) : "",
  }),
  head: () => ({
    meta: [
      { title: "Join your branch team — SuCasa" },
      { name: "description", content: "Accept your invitation to join a lending team on SuCasa." },
      { property: "og:title", content: "Join your branch team on SuCasa" },
      { property: "og:description", content: "Accept your invitation to join a lending team on SuCasa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TeamInvite,
});

function TeamInvite() {
  const t = useT();
  const { t: token } = Route.useSearch();
  const acceptFn = useServerFn(acceptLoanOfficerInvite);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
  }, []);

  const accept = async () => {
    setState("busy");
    setError(null);
    try {
      await acceptFn({ data: { token } });
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not accept");
      setState("idle");
    }
  };

  const goSignIn = () => {
    sessionStorage.setItem(AFTER_AUTH_KEY, `/team-invite?t=${encodeURIComponent(token)}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-md px-5 py-12 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("team.accept_title")}</h1>
        {state === "done" ? (
          <>
            <p className="mt-3 text-muted-foreground">{t("team.accept_done")}</p>
            <Button asChild className="mt-6 min-h-12 w-full">
              <Link to="/lender">{t("team.accept_go")}</Link>
            </Button>
          </>
        ) : signedIn === false ? (
          <>
            <p className="mt-3 text-muted-foreground">{t("team.accept_signin")}</p>
            <Button asChild className="mt-6 min-h-12 w-full" onClick={goSignIn}>
              <Link to="/auth">{t("team.accept_signin_btn")}</Link>
            </Button>
          </>
        ) : (
          <>
            <p className="mt-3 text-muted-foreground">{t("team.accept_body")}</p>
            <Button className="mt-6 min-h-12 w-full" disabled={!token || state === "busy" || signedIn === null} onClick={accept}>
              {t("team.accept_btn")}
            </Button>
          </>
        )}
        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      </main>
    </div>
  );
}
