import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { BookOpen, HeartHandshake, ShieldCheck, Users, Sparkles, ArrowRight } from "lucide-react";
import { getLenderCommandCenter } from "@/lib/lender-dashboard.functions";
import { StatCard, SectionHeader, EmptyState, StatusPill } from "@/components/ui-kit";
import { categoryLabel } from "@/lib/opportunities";
import { useT, type TranslationKey } from "@/lib/i18n";

const DELIVERY_KEY: Record<string, TranslationKey> = {
  premium_membership_sponsored: "biz.lcc.d.premium_membership_sponsored",
  homeowner_connection_request: "biz.lcc.d.homeowner_connection_request",
  monthly_digest_sent: "biz.lcc.d.monthly_digest_sent",
  home_profile_refreshed: "biz.lcc.d.home_profile_refreshed",
};

function when(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function LenderCommandCenter() {
  const t = useT();
  const fn = useServerFn(getLenderCommandCenter);
  const { data, isLoading } = useQuery({
    queryKey: ["lender-command-center"],
    queryFn: () => fn({ data: {} }),
    staleTime: 60_000,
  });

  if (isLoading) return <div className="px-4 py-6 text-sm text-muted-foreground">{t("common.loading")}</div>;
  if (!data) return null;

  const { myBook, homeownersServed, permissioned } = data;

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6">
      {/* MY BOOK */}
      <section className="space-y-3">
        <SectionHeader title={t("biz.lcc.my_book")} />
        <p className="-mt-1 text-sm text-muted-foreground">
          {t("biz.lcc.my_book_sub", { org: myBook.orgName })}
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={t("biz.lcc.homeowners")} value={myBook.total} icon={<BookOpen className="h-4 w-4" />} />
          <StatCard
            label={t("biz.lcc.activated")}
            value={myBook.activated}
            tone="growth"
            icon={<Users className="h-4 w-4" />}
          />
          <StatCard
            label={t("biz.lcc.capacity_left")}
            value={myBook.remaining}
            tone={myBook.remaining === 0 ? "attention" : "info"}
            icon={<ShieldCheck className="h-4 w-4" />}
            to="/lender/capacity"
          />
          <StatCard label={t("biz.lcc.archived")} value={myBook.archived} icon={<BookOpen className="h-4 w-4" />} />
        </div>
        {myBook.books.length > 1 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {myBook.books.map((b: any) => (
              <Link
                key={b.id}
                to={"/lender/portfolio/$id" as never}
                params={{ id: b.id } as never}
                className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft"
              >
                <p className="font-semibold">{b.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("biz.lcc.n_homeowners", { n: b.count })}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* HOMEOWNERS SERVED */}
      <section className="space-y-3">
        <SectionHeader title={t("biz.lcc.served")} />
        <p className="-mt-1 text-sm text-muted-foreground">
          {t("biz.lcc.served_sub")}
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard
            label={t("biz.lcc.active_memberships")}
            value={homeownersServed.activeMemberships}
            tone="growth"
            icon={<HeartHandshake className="h-4 w-4" />}
          />
          <StatCard label={t("biz.lcc.sponsorships_available")} value={homeownersServed.remainingSponsorships} />
          <StatCard label={t("biz.lcc.ended")} value={homeownersServed.endedMemberships} />
        </div>

        {Object.keys(homeownersServed.delivered).length > 0 && (
          <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft">
            <p className="text-sm font-semibold">{t("biz.lcc.delivered_30")}</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {Object.entries(homeownersServed.delivered as Record<string, number>).map(([k, n]) => (
                <li key={k} className="flex justify-between gap-3">
                  <span>{DELIVERY_KEY[k] ? t(DELIVERY_KEY[k]!) : k.replace(/_/g, " ")}</span>
                  <span className="font-semibold text-foreground">{n.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {homeownersServed.list.length === 0 ? (
          <EmptyState
            icon={<HeartHandshake className="mx-auto h-7 w-7" />}
            title={t("biz.lcc.no_memberships")}
            hint={t("biz.lcc.no_memberships_hint")}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {homeownersServed.list.map((m: any) => (
              <div
                key={m.id}
                className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{m.name}</p>
                  <StatusPill tone={m.membershipActive ? "growth" : "muted"}>
                    {m.membershipActive ? t("biz.lcc.premium_active") : t("biz.lcc.pending")}
                  </StatusPill>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{t("biz.lcc.since", { date: when(m.startedAt) })}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* PERMISSIONED OPPORTUNITIES */}
      <section className="space-y-3">
        <SectionHeader title={t("biz.lcc.permissioned")} />
        <p className="-mt-1 text-sm text-muted-foreground">
          {t("biz.lcc.permissioned_sub")}
        </p>

        <div className="space-y-3">
          <p className="text-sm font-semibold">{t("biz.lcc.asked_to_connect")}</p>
          {permissioned.requests.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="mx-auto h-7 w-7" />}
              title={t("biz.lcc.no_requests")}
              hint={t("biz.lcc.no_requests_hint")}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {permissioned.requests.map((r: any) => (
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
                    {t("biz.lcc.shared_with_you", { scope: r.scope.length ? r.scope.join(", ") : t("biz.lcc.contact_only") })}
                  </p>
                  {r.portfolioId && r.clientId && (
                    <Link
                      to={"/lender/portfolio/$id" as never}
                      params={{ id: r.portfolioId } as never}
                      search={{ client: r.clientId } as never}
                      className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary"
                    >
                      {t("biz.lcc.open_homeowner")} <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold">
            {t(
              permissioned.intelligenceGrants === 1
                ? "biz.lcc.insights_permitted_one"
                : "biz.lcc.insights_permitted_other",
              { n: permissioned.intelligenceGrants },
            )}
          </p>
          {permissioned.opportunities.length === 0 ? (
            <EmptyState
              icon={<Sparkles className="mx-auto h-7 w-7" />}
              title={t("biz.lcc.nothing_shared")}
              hint={t("biz.lcc.nothing_shared_hint")}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {permissioned.opportunities.map((o: any) => (
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
                      {t("biz.lcc.open_homeowner")} <ArrowRight className="h-4 w-4" />
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
