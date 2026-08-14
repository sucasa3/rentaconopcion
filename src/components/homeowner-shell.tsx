import type { ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Home, HeartPulse, FileText, Wrench, LogOut, BarChart3 } from "lucide-react";
import logoAsset from "@/assets/sucasa-logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Item {
  label: string;
  to: string;
  search?: Record<string, string>;
  icon: ReactNode;
  match: (pathname: string, tab: string | undefined) => boolean;
}

const ITEMS: Item[] = [
  {
    label: "Home",
    to: "/dashboard",
    search: { tab: "home" },
    icon: <Home className="h-5 w-5" />,
    match: (p, t) => p === "/dashboard" && (!t || t === "home"),
  },
  {
    label: "Care",
    to: "/dashboard",
    search: { tab: "care" },
    icon: <HeartPulse className="h-5 w-5" />,
    match: (p, t) => p === "/dashboard" && t === "care",
  },
  {
    label: "Docs",
    to: "/dashboard",
    search: { tab: "documents" },
    icon: <FileText className="h-5 w-5" />,
    match: (p, t) => p === "/dashboard" && t === "documents",
  },
  {
    label: "Services",
    to: "/request",
    icon: <Wrench className="h-5 w-5" />,
    match: (p) => p.startsWith("/request") || p.startsWith("/services"),
  },
  {
    label: "Report",
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
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tab = useRouterState({
    select: (s) => (s.location.search as { tab?: string } | undefined)?.tab,
  });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

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
                key={i.label}
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
                {i.label === "Docs" ? "Documents" : i.label}
              </Link>
            ))}
          </nav>
          <button
            onClick={signOut}
            className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <LogOut className="h-5 w-5" />
            Sign out
          </button>
        </aside>

        <main className="min-w-0 flex-1 pb-24 md:pb-10">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-card/95 backdrop-blur-xl md:hidden">
        <div className="flex items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)]">
          {ITEMS.map((i) => (
            <Link
              key={i.label}
              to={i.to as never}
              search={i.search as never}
              className={cn(
                "flex min-h-11 flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition active:scale-95",
                i.match(pathname, tab) ? "text-primary" : "text-muted-foreground",
              )}
            >
              {i.icon}
              {i.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
