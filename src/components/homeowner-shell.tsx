import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Home, HeartPulse, FileText, Wrench, BarChart3, History, Landmark, MoreHorizontal, ShieldCheck, Sparkles } from "lucide-react";
import logoAsset from "@/assets/sucasa-logo.png.asset.json";
import { AccountMenu, MobileTopBar } from "@/components/account-menu";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useT, type TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";


interface Item {
  key: string;
  labelKey: TranslationKey;
  /** Wider desktop label when the tab bar abbreviates. */
  longLabelKey?: TranslationKey;
  to: string;
  search?: Record<string, string>;
  icon: ReactNode;
  match: (pathname: string, tab: string | undefined) => boolean;
}

const ITEMS: Item[] = [
  {
    key: "home",
    labelKey: "nav.home",
    to: "/dashboard",
    icon: <Home className="h-5 w-5" />,
    match: (p) => p === "/dashboard",
  },
  {
    key: "todo",
    labelKey: "nav.todo",
    to: "/home-care",
    icon: <HeartPulse className="h-5 w-5" />,
    match: (p) => p.startsWith("/home-care"),
  },
  {
    key: "docs",
    labelKey: "nav.docs",
    longLabelKey: "nav.documents",
    to: "/documents",
    icon: <FileText className="h-5 w-5" />,
    match: (p) => p.startsWith("/documents"),
  },
  {
    key: "services",
    labelKey: "nav.services",
    to: "/request",
    icon: <Wrench className="h-5 w-5" />,
    match: (p) => p.startsWith("/request") || p.startsWith("/services"),
  },
  {
    key: "timeline",
    labelKey: "nav.timeline",
    longLabelKey: "nav.timeline_long",
    to: "/timeline",
    icon: <History className="h-5 w-5" />,
    match: (p) => p.startsWith("/timeline"),
  },
  {
    key: "report",
    labelKey: "nav.report",
    to: "/report",
    icon: <BarChart3 className="h-5 w-5" />,
    match: (p) => p.startsWith("/report"),
  },
];

const MOBILE_ITEMS: Item[] = [
  {
    key: "home",
    labelKey: "nav.home",
    to: "/dashboard",
    icon: <Home className="h-5 w-5" />,
    match: (p) => p === "/dashboard",
  },
  {
    key: "value",
    labelKey: "nav.value",
    to: "/money",
    icon: <Landmark className="h-5 w-5" />,
    match: (p) => p.startsWith("/money"),
  },
  {
    key: "care",
    labelKey: "nav.care",
    to: "/home-care",
    icon: <HeartPulse className="h-5 w-5" />,
    match: (p) => p.startsWith("/home-care"),
  },
  {
    key: "team",
    labelKey: "nav.team",
    to: "/home-team",
    icon: <ShieldCheck className="h-5 w-5" />,
    match: (p) => p.startsWith("/home-team"),
  },
];

/**
 * App chrome for the homeowner experience: desktop sidebar, iOS-style bottom
 * tab bar on mobile. Mirrors `BusinessShell` so all three roles feel like the
 * same native app.
 */
export function HomeownerShell({ children, premium = false, moreContent }: { children: ReactNode; premium?: boolean; moreContent?: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tab = useRouterState({
    select: (s) => (s.location.search as { tab?: string } | undefined)?.tab,
  });
  const t = useT();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = ["/documents", "/timeline", "/report", "/request", "/services", "/assistant"].some((path) => pathname.startsWith(path));

  return (
    <div className={cn("min-h-screen bg-surface", premium && "homeowner-premium")}>
      <div className="mx-auto flex max-w-7xl">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border/70 bg-card px-3 py-5 md:flex">
          <Link to="/" className="mb-6 flex items-center gap-2 px-2">
            <img src={logoAsset.url} alt="SuCasa" className="h-7 w-auto" />
          </Link>
          <nav className="flex flex-1 flex-col gap-1">
            {ITEMS.map((i) => (
              <Link
                key={i.key}
                to={i.to as never}
                search={i.search as never}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition hover:bg-secondary hover:text-foreground",
                  i.match(pathname, tab)
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground",
                )}
              >
                {i.icon}
                {t(i.longLabelKey ?? i.labelKey)}
              </Link>
            ))}
          </nav>
          <div className="mt-1 border-t border-border/60 pt-2">
            <AccountMenu role="homeowner" showName className="w-full" />
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-24 md:pb-10">
          <MobileTopBar role="homeowner" />
          {children}
        </main>

      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-card/95 shadow-[0_-8px_24px_color-mix(in_oklab,var(--color-sucasa-navy)_6%,transparent)] backdrop-blur-xl md:hidden">
        <div className="flex items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)]">
          {MOBILE_ITEMS.map((i) => (
            <Link
              key={i.key}
              to={i.to as never}
              search={i.search as never}
              className={cn(
                "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[9px] font-semibold transition active:scale-95 min-[390px]:text-[10px] [&_svg]:h-[22px] [&_svg]:w-[22px]",
                i.match(pathname, tab) ? "text-sucasa-orange" : "text-muted-foreground",
              )}
            >
              {i.icon}
              {t(i.labelKey)}
            </Link>
          ))}
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                className={cn(
                  "h-auto min-h-14 flex-1 flex-col justify-center gap-0.5 rounded-none px-0 py-1.5 text-[9px] font-semibold hover:bg-transparent min-[390px]:text-[10px] [&_svg]:h-[22px] [&_svg]:w-[22px]",
                  moreActive || moreOpen ? "text-sucasa-orange" : "text-muted-foreground",
                )}
              >
                <MoreHorizontal className="h-5 w-5" />
                {t("nav.more")}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl border-border bg-surface pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <SheetHeader className="text-left">
                <SheetTitle className="text-sucasa-navy">More</SheetTitle>
              </SheetHeader>
              <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card">
                <MoreRow to="/documents" icon={<FileText />} label={t("nav.documents")} close={() => setMoreOpen(false)} />
                <MoreRow to="/timeline" icon={<History />} label={t("nav.timeline_long")} close={() => setMoreOpen(false)} />
                <MoreRow to="/report" icon={<BarChart3 />} label={t("nav.report")} close={() => setMoreOpen(false)} />
                <MoreRow to="/request" icon={<Wrench />} label={t("nav.services")} close={() => setMoreOpen(false)} />
                <MoreRow to="/assistant" icon={<Sparkles />} label="Ask SuCasa" close={() => setMoreOpen(false)} />
              </div>
              {moreContent ? <div className="mt-3 flex min-h-11 items-center justify-center rounded-2xl border border-border bg-card p-2">{moreContent}</div> : null}
              <div className="mt-3 flex justify-center"><AccountMenu role="homeowner" showName className="w-full" /></div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </div>
  );
}

function MoreRow({ to, icon, label, close }: { to: string; icon: ReactNode; label: string; close: () => void }) {
  return (
    <Link to={to as never} onClick={close} className="grid min-h-11 grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3 text-sm font-medium text-foreground last:border-b-0 hover:bg-secondary">
      <span className="text-intelligence-accent [&_svg]:h-5 [&_svg]:w-5">{icon}</span>
      <span className="truncate">{label}</span>
      <span className="text-muted-foreground" aria-hidden>›</span>
    </Link>
  );
}
