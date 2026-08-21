import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  LayoutGrid,
  Users,
  Megaphone,
  Network,
  Home,
} from "lucide-react";
import logoAsset from "@/assets/sucasa-logo.png.asset.json";
import { AccountMenu, MobileTopBar } from "@/components/account-menu";
import { cn } from "@/lib/utils";


export type BusinessKind = "agent" | "lender";

interface NavItem {
  label: string;
  to: string;
  params?: Record<string, string>;
  icon: ReactNode;
}

function navItems(kind: BusinessKind, bookId: string | null): NavItem[] {
  const base = kind === "agent" ? "/agent" : "/lender";
  const items: NavItem[] = [
    { label: "Today", to: base, icon: <LayoutGrid className="h-5 w-5" /> },
  ];
  if (bookId) {
    items.push({
      label: "Homeowners",
      to: `${base}/portfolio/$id`,
      params: { id: bookId },
      icon: <Users className="h-5 w-5" />,
    });
  }
  items.push(
    { label: "Marketing", to: `${base}/campaigns`, icon: <Megaphone className="h-5 w-5" /> },
    { label: "Network", to: `${base}/network`, icon: <Network className="h-5 w-5" /> },
  );
  return items;
}

/**
 * App shell for the professional experience: desktop sidebar, mobile bottom
 * tab bar. The homeowner dashboard keeps the marketing-site header; business
 * users get a focused product chrome instead.
 */
export function BusinessShell({
  kind,
  bookId = null,
  children,
}: {
  kind: BusinessKind;
  bookId?: string | null;
  children: ReactNode;
}) {
  const items = navItems(kind, bookId);



  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto flex max-w-7xl">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border/70 bg-card px-3 py-5 md:flex">
          <Link to="/" className="mb-6 flex items-center gap-2 px-2">
            <img src={logoAsset.url} alt="SuCasa" className="h-7 w-auto" />
          </Link>
          <nav className="flex flex-1 flex-col gap-1">
            {items.map((i) => (
              <Link
                key={i.label}
                to={i.to as never}
                params={i.params as never}
                activeOptions={{ exact: i.to.endsWith("agent") || i.to.endsWith("lender") }}
                activeProps={{ className: "bg-primary/10 text-primary" }}
                className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                {i.icon}
                {i.label}
              </Link>
            ))}
          </nav>
          <Link
            to="/dashboard"
            className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Home className="h-5 w-5" />
            My home
          </Link>
          <div className="mt-1 border-t border-border/60 pt-2">
            <AccountMenu role={kind} showName className="w-full" />
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-24 md:pb-10">
          <MobileTopBar role={kind} />
          {children}
        </main>

      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-card/95 backdrop-blur-xl md:hidden">
        <div className="flex items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)]">
          {items.map((i) => (
            <Link
              key={i.label}
              to={i.to as never}
              params={i.params as never}
              activeOptions={{ exact: i.to.endsWith("agent") || i.to.endsWith("lender") }}
              activeProps={{ className: "text-primary" }}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-muted-foreground",
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
