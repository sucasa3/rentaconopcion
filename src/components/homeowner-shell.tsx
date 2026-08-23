import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, HeartPulse, FileText, Wrench, BarChart3 } from "lucide-react";
import logoAsset from "@/assets/sucasa-logo.png.asset.json";
import { AccountMenu, MobileTopBar } from "@/components/account-menu";
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

/**
 * App chrome for the homeowner experience: desktop sidebar, iOS-style bottom
 * tab bar on mobile. Mirrors `BusinessShell` so all three roles feel like the
 * same native app.
 */
export function HomeownerShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tab = useRouterState({
    select: (s) => (s.location.search as { tab?: string } | undefined)?.tab,
  });
  const t = useT();



  return (
    <div className="min-h-screen bg-surface">
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

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-card/95 backdrop-blur-xl md:hidden">
        <div className="flex items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)]">
          {ITEMS.map((i) => (
            <Link
              key={i.key}
              to={i.to as never}
              search={i.search as never}
              className={cn(
                "flex min-h-11 flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition active:scale-95",
                i.match(pathname, tab) ? "text-primary" : "text-muted-foreground",
              )}
            >
              {i.icon}
              {t(i.labelKey)}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
