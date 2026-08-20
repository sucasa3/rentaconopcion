import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Briefcase, Home, LogOut, User as UserIcon, Wrench } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getMyWorkspace } from "@/lib/business.functions";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import logoAsset from "@/assets/sucasa-logo.png.asset.json";

export type AccountRole = "homeowner" | "agent" | "lender";

const ROLE_LABEL: Record<AccountRole, string> = {
  homeowner: "Homeowner",
  agent: "Agent",
  lender: "Lender",
};

function displayName(user: User | null) {
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const full = (meta.full_name ?? meta.name) as string | undefined;
  if (full) return full;
  const email = user?.email ?? "";
  return email ? email.split("@")[0] : "Your account";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((p) => p[0]).join("");
  return (letters || "?").toUpperCase();
}

/** Session-aware avatar button that opens an iOS-style account sheet. */
export function AccountMenu({
  role,
  className,
  showName = false,
}: {
  role: AccountRole;
  className?: string;
  showName?: boolean;
}) {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (alive) setUser(data.user ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setUser(s?.user ?? null),
    );
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const name = displayName(user);

  // Some homeowners are also agents/lenders — offer a way back to their business area.
  const { data: workspace } = useQuery({
    queryKey: ["my-workspace", user?.id ?? "anon"],
    queryFn: () => getMyWorkspace(),
    enabled: Boolean(user?.id),
    staleTime: 5 * 60 * 1000,
  });
  const businessHome =
    workspace && workspace.home !== "/dashboard" ? workspace.home : null;
  const businessLabel = workspace?.isAgent
    ? "Agent dashboard"
    : workspace?.isLender
      ? "Lender dashboard"
      : "Admin dashboard";

  async function signOut() {
    setOpen(false);
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          aria-label="Account"
          className={cn(
            "flex min-h-11 items-center gap-2 rounded-2xl px-1.5 py-1.5 text-left transition active:scale-95 hover:bg-secondary",
            className,
          )}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {initials(name)}
          </span>
          {showName && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">{name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {ROLE_LABEL[role]}
              </span>
            </span>
          )}
        </button>
      </SheetTrigger>

      <SheetContent side="bottom" className="rounded-t-3xl border-border/70 pb-[env(safe-area-inset-bottom)]">
        <SheetHeader className="text-left">
          <SheetTitle className="sr-only">Account</SheetTitle>
        </SheetHeader>
        <div className="flex items-center gap-3 px-4 pb-2">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {initials(name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-foreground">{name}</p>
            <p className="truncate text-sm text-muted-foreground">{user?.email ?? ""}</p>
            <p className="mt-0.5 text-xs font-medium text-primary">{ROLE_LABEL[role]}</p>
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl border border-border/70 bg-card">
          {role === "homeowner" ? (
            <Row to="/request" icon={<Wrench className="h-4 w-4" />} label="Request a service" onNavigate={() => setOpen(false)} />
          ) : (
            <Row to="/dashboard" icon={<Home className="h-4 w-4" />} label="My home" onNavigate={() => setOpen(false)} />
          )}
          {role === "homeowner" && businessHome && (
            <Row
              to={businessHome}
              icon={<Briefcase className="h-4 w-4" />}
              label={businessLabel}
              onNavigate={() => setOpen(false)}
            />
          )}
          <Row to="/services" icon={<UserIcon className="h-4 w-4" />} label="Browse services" onNavigate={() => setOpen(false)} />
        </div>

        <button
          onClick={signOut}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border/70 bg-card px-4 py-3 text-sm font-medium text-destructive transition active:scale-[0.99]"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </SheetContent>
    </Sheet>
  );
}

function Row({
  to,
  icon,
  label,
  onNavigate,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      to={to as never}
      onClick={onNavigate}
      className="flex min-h-11 items-center gap-3 border-b border-border/60 px-4 py-3 text-sm text-foreground last:border-b-0 hover:bg-secondary"
    >
      <span className="text-muted-foreground">{icon}</span>
      {label}
    </Link>
  );
}

/** Mobile-only sticky top bar: logo on the left, account avatar on the right. */
export function MobileTopBar({ role }: { role: AccountRole }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/60 bg-card/90 px-4 py-2 backdrop-blur-xl md:hidden">
      <Link to="/" aria-label="SuCasa home" className="flex items-center">
        <img src={logoAsset.url} alt="SuCasa" className="h-7 w-auto" />
      </Link>
      <AccountMenu role={role} />
    </header>
  );
}
