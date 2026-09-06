import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { BookOpen, HeartHandshake, ShieldCheck, Users, Sparkles, ArrowRight } from "lucide-react";
import { getLenderCommandCenter } from "@/lib/lender-dashboard.functions";
import { StatCard, SectionHeader, EmptyState, StatusPill } from "@/components/ui-kit";
import { categoryLabel } from "@/lib/opportunities";

const DELIVERY_LABEL: Record<string, string> = {
  premium_membership_sponsored: "Memberships funded",
  homeowner_connection_request: "Homeowners who asked to connect",
  monthly_digest_sent: "Monthly digests delivered",
  home_profile_refreshed: "Home Profiles refreshed",
};

function when(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function LenderCommandCenter() {
  const fn = useServerFn(getLenderCommandCenter);
  const { data, isLoading } = useQuery({
    queryKey: ["lender-command-center"],
    queryFn: () => fn({ data: {} }),
    staleTime: 60_000,
  });

  if (isLoading) return <div className="px-4 py-6 text-sm text-muted-foreground">Loading…</div>;
  if (!data) return null;

  const { myBook, homeownersServed, permissioned } = data;

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6">
      {/* MY BOOK */}
      <section className="space-y-3">
        <SectionHeader title="My Book" />
        <p className="-mt-1 text-sm text-muted-foreground">
          The homeowners {myBook.orgName} monitors with SuCasa.
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Homeowners" value={myBook.total} icon={<BookOpen className="h-4 w-4" />} />
          <StatCard
            label="Activated"
            value={myBook.activated}
            tone="growth"
            icon={<Users className="h-4 w-4" />}
          />
          <StatCard
            label="Capacity left"
            value={myBook.remaining}
            tone={myBook.remaining === 0 ? "attention" : "info"}
            icon={<ShieldCheck className="h-4 w-4" />}
            to="/lender/capacity"
          />
          <StatCard label="Archived" value={myBook.archived} icon={<BookOpen className="h-4 w-4" />} />
        </div>
        {myBook.books.length > 1 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {myBook.books.map((b) => (
              <Link
                key={b.id}
                to={"/lender/portfolio/$id" as never}
                params={{ id: b.id } as never}
                className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft"
              >
                <p className="font-semibold">{b.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{b.count} homeowners</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* HOMEOWNERS SERVED */}
      <section className="space-y-3">
        <SectionHeader title="Homeowners Served" />
        <p className="-mt-1 text-sm text-muted-foreground">
          Premium Home Intelligence memberships your subscription funds. SuCasa provides the
          membership directly to the homeowner; sponsoring it never creates a lead.
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard
            label="Active memberships"
            value={homeownersServed.activeMemberships}
            tone="growth"
            icon={<HeartHandshake className="h-4 w-4" />}
          />
          <StatCard label="Sponsorships available" value={homeownersServed.remainingSponsorships} />
          <StatCard label="Ended" value={homeownersServed.endedMemberships} />
        </div>

        {Object.keys(homeownersServed.delivered).length > 0 && (
          <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft">
            <p className="text-sm font-semibold">Delivered in the last 30 days</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {Object.entries(homeownersServed.delivered).map(([k, n]) => (
                <li key={k} className="flex justify-between gap-3">
                  <span>{DELIVERY_LABEL[k] ?? k.replace(/_/g, " ")}</span>
                  <span className="font-semibold text-foreground">{n.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {homeownersServed.list.length === 0 ? (
          <EmptyState
            icon={<HeartHandshake className="mx-auto h-7 w-7" />}
            title="No memberships funded yet"
            hint="Sponsor Premium for a homeowner in your book to start their monitoring."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {homeownersServed.list.map((m) => (
              <div
                key={m.id}
                className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{m.name}</p>
                  <StatusPill tone={m.membershipActive ? "growth" : "muted"}>
                    {m.membershipActive ? "Premium active" : "Pending"}
                  </StatusPill>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">Since {when(m.startedAt)}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* PERMISSIONED OPPORTUNITIES */}
      <section className="space-y-3">
        <SectionHeader title="Permissioned Opportunities" />
        <p className="-mt-1 text-sm text-muted-foreground">
          Only homeowners who asked to connect, and only the information they chose to share.
        </p>

        <div className="space-y-3">
          <p className="text-sm font-semibold">Homeowners who asked to connect</p>
          {permissioned.requests.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="mx-auto h-7 w-7" />}
              title="No connection requests yet"
              hint="Homeowners appear here the moment they ask to talk to you."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {permissioned.requests.map((r) => (
                <div
                  key={r.id}
                  className="rounded-3xl border border-primary/30 bg-primary/5 p-4 shadow-soft"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{r.name}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{r.topic}</p>
                    </div>
                    <StatusPill tone="attention">{when(r.grantedAt)}</StatusPill>
                  </div>
                  {r.note && <p className="mt-2 text-sm">{r.note}</p>}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Shared with you: {r.scope.length ? r.scope.join(", ") : "contact only"}
                  </p>
                  {r.portfolioId && r.clientId && (
                    <Link
                      to={"/lender/portfolio/$id" as never}
                      params={{ id: r.portfolioId } as never}
                      search={{ client: r.clientId } as never}
                      className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary"
                    >
                      Open homeowner <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold">
            Insights you're permitted to see ({permissioned.intelligenceGrants} homeowner
            {permissioned.intelligenceGrants === 1 ? "" : "s"})
          </p>
          {permissioned.opportunities.length === 0 ? (
            <EmptyState
              icon={<Sparkles className="mx-auto h-7 w-7" />}
              title="Nothing shared yet"
              hint="Home insights appear only after a homeowner permits access."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {permissioned.opportunities.map((o) => (
                <div
                  key={o.id}
                  className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{o.name}</p>
                    <StatusPill tone={o.strength === "strong" ? "attention" : "muted"}>
                      {categoryLabel(o.category)}
                    </StatusPill>
                  </div>
                  {o.reason && (
                    <p className="mt-1 text-sm text-muted-foreground">{o.reason}</p>
                  )}
                  {o.portfolioId && (
                    <Link
                      to={"/lender/portfolio/$id" as never}
                      params={{ id: o.portfolioId } as never}
                      search={{ client: o.clientId } as never}
                      className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary"
                    >
                      Open homeowner <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
