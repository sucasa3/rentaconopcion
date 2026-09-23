import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Sparkles, Search, Loader2, ArrowRight, X } from "lucide-react";
import { searchClients } from "@/lib/copilot.functions";
import { useT } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Result = {
  id: string;
  portfolio_id: string;
  name: string;
  email: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  rate: number | null;
  equity_cents: number;
  savings_per_month: number;
  intent: "high" | "medium" | "low" | null;
  last_contact_at: string | null;
};

function money(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

export function CopilotSearch({
  portfolioId,
  detailPath,
}: {
  /** Limit the search to one book. Omit to search everything the user can see. */
  portfolioId?: string;
  /** Route that shows a single client, e.g. "/lender/portfolio/$id". */
  detailPath: (r: Result) => { to: string; params?: any; search?: any };
}) {
  const t = useT();
  const EXAMPLES = [t("biz.copilot.ex1"), t("biz.copilot.ex2"), t("biz.copilot.ex3"), t("biz.copilot.ex4"), t("biz.copilot.ex5")];
  const [q, setQ] = useState("");
  const run = useServerFn(searchClients);

  const mutation = useMutation({
    mutationFn: (question: string) =>
      run({ data: { question, portfolioId: portfolioId ?? null } }) as Promise<{
        summary: string;
        columns: string[];
        used: number;
        cap: number;
        total_book?: number;
        results: Result[];
      }>,
  });

  const data = mutation.data;
  const cols = data?.columns ?? [];

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const question = q.trim();
    if (question) mutation.mutate(question);
  }

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
        <h2 className="text-sm font-semibold">{t("biz.copilot.title")}</h2>
        <Badge variant="secondary" className="ml-auto text-[10px]">
          {t("biz.copilot.beta")}
        </Badge>
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("biz.copilot.placeholder")}
            className="pl-9"
            aria-label={t("biz.copilot.aria")}
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label={t("biz.copilot.clear")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button type="submit" disabled={mutation.isPending || !q.trim()}>
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("biz.copilot.search")}
        </Button>
      </form>

      {!data && !mutation.isPending && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setQ(ex);
                mutation.mutate(ex);
              }}
              className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {mutation.isError && (
        <p className="mt-3 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
          {(mutation.error as Error).message}
        </p>
      )}

      {data && (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="font-normal">
              {data.summary}
            </Badge>
            <span>
              {t(data.results.length === 1 ? "biz.copilot.match_one" : "biz.copilot.match_many", {
                count: data.results.length.toLocaleString(),
              })}
              {data.total_book ? ` ${t("biz.copilot.of_book", { total: data.total_book.toLocaleString() })}` : ""}
            </span>
            <span className="ml-auto">
              {t("biz.copilot.usage", { used: data.used, cap: data.cap })}
            </span>
          </div>

          {data.results.length === 0 ? (
            <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
              {t("biz.copilot.empty")}
            </p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {data.results.map((r) => {
                const link = detailPath(r);
                return (
                  <li key={r.id}>
                    <Link
                      to={link.to as any}
                      params={link.params}
                      search={link.search}
                      className="flex items-center gap-3 px-3 py-2.5 transition hover:bg-muted/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {r.email ?? ([r.city, r.state].filter(Boolean).join(", ") || "—")}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-xs">
                        {cols.includes("intent") && r.intent && (
                          <Badge
                            variant={r.intent === "high" ? "default" : "secondary"}
                            className="uppercase"
                          >
                            {t(`biz.intent.${r.intent}` as const)}
                          </Badge>
                        )}
                        {cols.includes("rate") && (
                          <span className="tabular-nums">
                            {r.rate != null ? `${r.rate.toFixed(2)}%` : "—"}
                          </span>
                        )}
                        {cols.includes("equity") && (
                          <span className="tabular-nums">{money(r.equity_cents)}</span>
                        )}
                        {cols.includes("savings") && (
                          <span className="tabular-nums">${r.savings_per_month}/mo</span>
                        )}
                        {cols.includes("last_contact") && (
                          <span className="text-muted-foreground">
                            {r.last_contact_at
                              ? new Date(r.last_contact_at).toLocaleDateString()
                              : t("biz.copilot.never")}
                          </span>
                        )}
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
