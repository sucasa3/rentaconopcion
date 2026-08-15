import { useCallback, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Printer, Maximize2 } from "lucide-react";
import { ScaledSlide } from "@/components/deck/slide-layout";
import { LENDER_SLIDES } from "@/components/deck/lender-slides";

type Search = { slide?: number; print?: boolean };

export const Route = createFileRoute("/lenders")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    slide: s.slide ? Math.max(1, Number(s.slide) || 1) : undefined,
    print: s.print === true || s.print === "true" || s.print === "",
  }),
  head: () => ({
    meta: [
      { title: "SuCasa for Lenders — Partnership Deck" },
      {
        name: "description",
        content:
          "How SuCasa activates agent homeowner databases into financing conversations for mortgage lenders.",
      },
      { property: "og:title", content: "SuCasa for Lenders — Partnership Deck" },
      {
        property: "og:description",
        content:
          "An intelligence layer around the home: one Home Record, one signal engine, one partner network.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LenderDeck,
});

function LenderDeck() {
  const { slide, print } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const total = LENDER_SLIDES.length;
  const index = Math.min(Math.max((slide ?? 1) - 1, 0), total - 1);

  const go = useCallback(
    (next: number) => {
      const clamped = Math.min(Math.max(next, 0), total - 1);
      navigate({ search: (prev: Search) => ({ ...prev, slide: clamped + 1 }), replace: true });
    },
    [navigate, total],
  );

  useEffect(() => {
    if (print) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") go(index + 1);
      if (e.key === "ArrowLeft") go(index - 1);
      if (e.key === "f" || e.key === "F") document.documentElement.requestFullscreen?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, print]);

  useEffect(() => {
    document.title = print
      ? "SuCasa for Lenders — Partnership Deck"
      : `${index + 1}/${total} — ${LENDER_SLIDES[index].title} · SuCasa for Lenders`;
  }, [index, total, print]);

  if (print) {
    return (
      <div className="bg-background">
        {LENDER_SLIDES.map((s) => (
          <div key={s.id} className="print-slide" style={{ width: 1920, height: 1080 }}>
            {s.render()}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-[oklch(0.14_0.02_255)]">
      <header className="flex items-center justify-between px-4 py-3 text-white/80">
        <p className="text-sm font-semibold">SuCasa · Lender partnership deck</p>
        <div className="flex items-center gap-2">
          <a
            href="/lenders?print=true"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold"
          >
            <Printer className="h-3.5 w-3.5" /> PDF
          </a>
          <button
            onClick={() => document.documentElement.requestFullscreen?.()}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold"
          >
            <Maximize2 className="h-3.5 w-3.5" /> Present
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 px-3">
        <ScaledSlide>{LENDER_SLIDES[index].render()}</ScaledSlide>
      </main>

      <footer className="flex items-center justify-between gap-3 px-4 py-4 text-white/80">
        <button
          onClick={() => go(index - 1)}
          disabled={index === 0}
          className="inline-flex items-center gap-1 rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
          {LENDER_SLIDES.map((s, i) => (
            <button
              key={s.id}
              onClick={() => go(i)}
              aria-label={s.title}
              className={`h-2 w-6 shrink-0 rounded-full ${i === index ? "bg-white" : "bg-white/25"}`}
            />
          ))}
        </div>
        <button
          onClick={() => go(index + 1)}
          disabled={index === total - 1}
          className="inline-flex items-center gap-1 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-[oklch(0.2_0.03_255)] disabled:opacity-40"
        >
          Next <ChevronRight className="h-4 w-4" />
        </button>
      </footer>
    </div>
  );
}
