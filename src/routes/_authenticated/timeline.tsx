import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  BadgeCheck,
  FileText,
  Hammer,
  History,
  KeyRound,
  TrendingUp,
  Wrench,
} from "lucide-react";

import { HomeownerShell } from "@/components/homeowner-shell";
import { SectionHero } from "@/components/section-hero";
import { EmptyState } from "@/components/ui-kit";
import { useHomeRecord } from "@/hooks/use-home-record";
import { listHomeDocuments } from "@/lib/home-documents.functions";
import { listMyRequests } from "@/lib/service-requests.functions";
import { listValueSnapshots } from "@/lib/home-timeline.functions";
import {
  buildHomeTimeline,
  groupTimelineByYear,
  type HomeTimelineEntry,
} from "@/lib/home-timeline";
import { useT } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/timeline")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your Home History — SuCasa" },
      {
        name: "description",
        content:
          "A complete history of your home: purchase, permitted work, service records, documents and value over time.",
      },
      { property: "og:title", content: "Your Home History — SuCasa" },
      {
        property: "og:description",
        content:
          "A complete history of your home: purchase, permitted work, service records, documents and value over time.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TimelinePage,
});

const ICONS: Record<HomeTimelineEntry["kind"], typeof History> = {
  purchase: KeyRound,
  permit: Hammer,
  service: Wrench,
  document: FileText,
  value: TrendingUp,
  request: BadgeCheck,
  projection: History,
};

function TimelinePage() {
  const t = useT();
  const [profileAddr, setProfileAddr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("address, city, state, zip")
        .eq("id", u.user.id)
        .maybeSingle();
      if (p?.address) {
        setProfileAddr([p.address, p.city, p.state, p.zip].filter(Boolean).join(", "));
      }
    })();
  }, []);

  const { record } = useHomeRecord(profileAddr);

  const fetchDocs = useServerFn(listHomeDocuments);
  const fetchRequests = useServerFn(listMyRequests);
  const fetchSnapshots = useServerFn(listValueSnapshots);

  const { data: docs } = useQuery({
    queryKey: ["home-documents"],
    queryFn: () => fetchDocs(undefined),
    staleTime: 5 * 60_000,
  });
  const { data: requests } = useQuery({
    queryKey: ["my-requests"],
    queryFn: () => fetchRequests(),
    staleTime: 60_000,
  });
  const { data: snapshots } = useQuery({
    queryKey: ["value-snapshots"],
    queryFn: () => fetchSnapshots(),
    staleTime: 5 * 60_000,
  });

  const entries = buildHomeTimeline({
    record,
    documents: (docs ?? []) as never,
    requests: (requests ?? []) as never,
    valueSnapshots: (snapshots ?? []) as never,
  });

  const thisYear = new Date().getFullYear();
  const upcoming = entries.filter((e) => e.future).sort((a, b) => a.date.localeCompare(b.date));
  const past = entries.filter((e) => !e.future);
  const groups = groupTimelineByYear(past);

  return (
    <HomeownerShell>
      <main className="px-4 py-6 sm:px-5 sm:py-8">
        <div className="mx-auto max-w-3xl space-y-5">
          <SectionHero
            icon={History}
            eyebrow={t("nav.timeline_long")}
            title={t("timeline.title")}
            subtitle={t("timeline.subtitle")}
          />

          {entries.length === 0 ? (
            <EmptyState
              title={t("timeline.empty_title")}
              hint={t("timeline.empty_body")}
            />
          ) : null}

          {upcoming.length > 0 ? (
            <section className="space-y-2">
              <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-primary">
                {t("timeline.upcoming")}
              </h2>
              <div className="rounded-3xl border border-border bg-card p-2 shadow-soft">
                {upcoming.map((e) => (
                  <Row key={e.key} entry={e} />
                ))}
              </div>
            </section>
          ) : null}

          {groups.length > 0 ? (
            <section className="space-y-3">
              <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("timeline.past")}
              </h2>
              {groups.map((g) => (
                <div key={g.year} className="space-y-2">
                  <div className="flex items-center gap-3 px-1">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        g.year === thisYear
                          ? "bg-primary/10 text-primary"
                          : "bg-secondary text-muted-foreground",
                      )}
                    >
                      {g.year}
                    </span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  <div className="rounded-3xl border border-border bg-card p-2 shadow-soft">
                    {g.entries.map((e) => (
                      <Row key={e.key} entry={e} />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ) : null}
        </div>
      </main>
    </HomeownerShell>
  );
}

function Row({ entry }: { entry: HomeTimelineEntry }) {
  const Icon = ICONS[entry.kind];
  const body = (
    <div className="flex items-start gap-3 rounded-2xl p-3 transition hover:bg-secondary/60">
      <div
        className={cn(
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          entry.future ? "bg-secondary text-muted-foreground" : "bg-primary/10 text-primary",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{entry.title}</p>
        {entry.detail ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{entry.detail}</p>
        ) : null}
        <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground/80">
          {entry.source}
        </p>
      </div>
    </div>
  );

  if (entry.link) {
    return (
      <Link to={entry.link.to as never} search={entry.link.search as never} className="block">
        {body}
      </Link>
    );
  }
  return body;
}
