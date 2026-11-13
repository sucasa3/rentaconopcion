import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useLanguage, useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

import { HomeownerShell } from "@/components/homeowner-shell";
import { HomeCarePanel } from "@/components/home-care-panel";
import { HomePlanSection } from "@/components/home-plan-section";
import { PredictedActionsCard } from "@/components/predicted-actions-card";
import { RecommendedProsCard } from "@/components/recommended-pros-card";
import { RecentRequestsCard } from "@/components/recent-requests-card";
import { HomeSystemAccessCard } from "@/components/home-system-access-card";

export const Route = createFileRoute("/_authenticated/home-care")({
  ssr: false,
  // `onboarding` only changes what is shown; it never grants access or counts as activation.
  validateSearch: (search: Record<string, unknown>): { system?: string; onboarding?: "claim" | "review" } => ({
    ...(typeof search.system === "string" ? { system: search.system } : {}),
    ...(search.onboarding === "claim" || search.onboarding === "review" ? { onboarding: search.onboarding } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Home care — SuCasa" },
      {
        name: "description",
        content: "Your home's systems, what needs attention now, and who can help.",
      },
      { property: "og:title", content: "Home care — SuCasa" },
      {
        property: "og:description",
        content: "Your home's systems, what needs attention now, and who can help.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HomeCarePage,
});

const DISMISS_KEY = "sucasa.claim_onboarding_dismissed";

function HomeCarePage() {
  const t = useT();
  const navigate = useNavigate();
  const { system, onboarding } = Route.useSearch();
  const { language } = useLanguage();
  const es = language === "es";
  const [showPrompt, setShowPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [openLog, setOpenLog] = useState(0);
  useEffect(() => {
    const d = localStorage.getItem(DISMISS_KEY) === "1";
    setDismissed(d);
    setShowPrompt(onboarding === "claim" && !d);
  }, [onboarding]);
  const dismiss = () => { localStorage.setItem(DISMISS_KEY, "1"); setDismissed(true); setShowPrompt(false); };
  return (
    <HomeownerShell>
      <main className="px-4 py-6 sm:px-5 sm:py-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> {t("common.back_home")}
          </Link>

          {onboarding === "review" && (
            <div role="status" className="rounded-2xl border border-border bg-card p-4 text-sm">
              <p className="font-semibold">{es ? "Recibimos la dirección corregida" : "We received your corrected address"}</p>
              <p className="mt-1 text-muted-foreground">{es ? "La revisaremos antes de conectarla a tu Registro de Hogar. Mientras tanto no se muestra información de la otra dirección." : "We'll review it before linking it to your Home Record. Until then, nothing from the original address is shown."}</p>
            </div>
          )}
          {showPrompt ? (
            <div className="rounded-2xl border border-primary/30 bg-card p-4 shadow-soft">
              <p className="font-semibold">{es ? "Tu primer paso: anota un mantenimiento que ya hiciste" : "Your first step: record maintenance you already did"}</p>
              <p className="mt-1 text-sm text-muted-foreground">{es ? "Elige un sistema (por ejemplo, el aire acondicionado), indica cuándo se hizo y guárdalo. Solo anota trabajos que realmente se completaron." : "Pick a system (for example, heating and cooling), say when the work was done, and save. Only record work that was actually completed."}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Button onClick={() => { setOpenLog((n) => n + 1); dismiss(); }}>{es ? "Anotar un mantenimiento" : "Record maintenance"}</Button>
                <Button variant="outline" onClick={() => { dismiss(); navigate({ to: "/dashboard" }); }}>{es ? "Explorar mi casa primero" : "Explore my home first"}</Button>
              </div>
            </div>
          ) : dismissed && onboarding === "claim" ? (
            <button className="text-sm font-medium text-primary underline-offset-4 hover:underline" onClick={() => setOpenLog((n) => n + 1)}>
              {es ? "Anotar un mantenimiento que ya hice" : "Record maintenance I already did"}
            </button>
          ) : null}

          <HomeCarePanel
            openLogRequest={openLog}
            focusSystem={system}
            onGoToDocuments={() => navigate({ to: "/documents" })}
          />
          <HomeSystemAccessCard />
          <HomePlanSection />
          <PredictedActionsCard />
          <RecommendedProsCard />
          <RecentRequestsCard />
        </div>
      </main>
    </HomeownerShell>
  );
}
