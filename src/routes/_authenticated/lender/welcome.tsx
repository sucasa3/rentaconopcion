import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileSpreadsheet, Loader2, UserPlus } from "lucide-react";
import { BusinessShell } from "@/components/business-shell";
import { useT } from "@/lib/i18n";
import { getBusinessOverview } from "@/lib/business.functions";
import { startDiscovery } from "@/lib/discovery.functions";

export const Route = createFileRoute("/_authenticated/lender/welcome")({
  head: () => ({
    meta: [
      { title: "Add your clients — SuCasa" },
      { name: "description", content: "Upload a CSV or add one client to start your SuCasa client book." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Welcome,
});

function Welcome() {
  const t = useT();
  const overviewFn = useServerFn(getBusinessOverview);
  const ensureFn = useServerFn(startDiscovery);
  // Make sure the organization and client book exist (idempotent), then find the book.
  const { data } = useQuery({
    queryKey: ["lender-welcome-book"],
    queryFn: async () => {
      let o: any = await overviewFn({ data: { orgType: "lender" } });
      if (!o?.books?.length) {
        await ensureFn({ data: {} });
        o = await overviewFn({ data: { orgType: "lender" } });
      }
      return o;
    },
  });
  const bookId: string | null = data?.books?.[0]?.id ?? null;

  const card = "flex min-h-40 flex-col items-start gap-2 rounded-2xl border-2 border-border bg-card p-5 text-left shadow-soft transition-colors hover:border-primary focus-visible:border-primary";
  return (
    <BusinessShell kind="lender" bookId={bookId} isManager={data?.isManager}>
      <main className="px-4 py-8 sm:px-5">
        <div className="mx-auto max-w-3xl space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("welcome.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("welcome.sub")}</p>
          </div>
          {!bookId ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("welcome.preparing")}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Link to="/lender/portfolio/$id/import" params={{ id: bookId }} hash="csv" className={card}>
                <FileSpreadsheet className="h-7 w-7 text-primary" />
                <span className="text-lg font-semibold">{t("welcome.csv")}</span>
                <span className="text-sm text-muted-foreground">{t("welcome.csv_body")}</span>
              </Link>
              <Link to="/lender/portfolio/$id/import" params={{ id: bookId }} hash="one" className={card}>
                <UserPlus className="h-7 w-7 text-primary" />
                <span className="text-lg font-semibold">{t("welcome.one")}</span>
                <span className="text-sm text-muted-foreground">{t("welcome.one_body")}</span>
              </Link>
            </div>
          )}
          <Link to="/lender" className="inline-block text-sm font-medium text-primary underline">{t("welcome.later")}</Link>
        </div>
      </main>
    </BusinessShell>
  );
}
