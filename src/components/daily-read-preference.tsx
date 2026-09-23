import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mail } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { getDailyReadPreference, setDailyReadPreference } from "@/lib/daily-read.functions";
import { DEFAULT_DAILY_READ_TIMEZONE } from "@/lib/daily-read";
import { useT } from "@/lib/i18n";

/**
 * One switch: the morning Daily Read email. Nothing here touches homeowner
 * contact permissions.
 */
export function DailyReadPreference({
  orgId,
  audience,
}: {
  orgId: string | null | undefined;
  audience: "agent" | "lender";
}) {
  const getPref = useServerFn(getDailyReadPreference);
  const setPref = useServerFn(setDailyReadPreference);
  const t = useT();
  const qc = useQueryClient();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);

  const { data } = useQuery({
    queryKey: ["daily-read-pref", orgId, audience],
    queryFn: () => getPref({ data: { orgId: orgId as string, audience } }),
    enabled: Boolean(orgId),
    staleTime: 5 * 60_000,
  });

  const mutation = useMutation({
    mutationFn: (enabled: boolean) =>
      setPref({
        data: {
          orgId: orgId as string,
          audience,
          enabled,
          timezone:
            Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_DAILY_READ_TIMEZONE,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["daily-read-pref", orgId, audience] }),
  });

  useEffect(() => {
    if (data) setOptimistic(null);
  }, [data]);

  if (!orgId) return null;
  const enabled = optimistic ?? data?.enabled ?? true;

  return (
    <section className="rounded-3xl border border-border/70 bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
          <Mail className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">{t("biz.daily_read.title")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("biz.daily_read.desc")}
          </p>
        </div>
        <Switch
          checked={enabled}
          aria-label={t("biz.daily_read.title")}
          onCheckedChange={(next) => {
            setOptimistic(next);
            mutation.mutate(next);
          }}
        />
      </div>
    </section>
  );
}
