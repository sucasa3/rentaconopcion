import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { getPortfolio, ingestPortfolioCsv } from "@/lib/lender.functions";
import { ArrowLeft, Upload, Lock, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/lender/portfolio/$id")({
  head: () => ({
    meta: [
      { title: "Portfolio — SuCasa Lender" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortfolioDetail,
});

function money(cents: number | null | undefined) {
  if (cents == null) return "—";
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

function PortfolioDetail() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getPortfolio);
  const ingestFn = useServerFn(ingestPortfolioCsv);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["lender-portfolio", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const ingest = useMutation({
    mutationFn: (csv: string) => ingestFn({ data: { portfolioId: id, csv } }),
    onSuccess: (r: any) => {
      toast.success(`Imported ${r.inserted} clients`);
      qc.invalidateQueries({ queryKey: ["lender-portfolio", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  async function handleFile(f: File) {
    const text = await f.text();
    ingest.mutate(text);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 px-5 py-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <Link
            to="/lender"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary"
          >
            <ArrowLeft className="h-3 w-3" /> All portfolios
          </Link>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : error ? (
            <p className="text-sm text-destructive">{(error as Error).message}</p>
          ) : data ? (
            <>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  {data.portfolio.orgName}
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                  {data.portfolio.name}
                </h1>
              </div>

              <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">Import clients</h2>
                    <p className="text-xs text-muted-foreground">
                      CSV columns: full_name, address, city, state, zip, email, loan_balance, rate, note
                    </p>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                    }}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={ingest.isPending}
                    className="inline-flex items-center gap-1 rounded-full gradient-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    <Upload className="h-3 w-3" /> {ingest.isPending ? "Importing…" : "Upload CSV"}
                  </button>
                </div>
              </div>

              <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
                <h2 className="text-base font-semibold">Clients ({data.clients.length})</h2>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Name</th>
                        <th className="py-2 pr-3 font-medium">Address</th>
                        <th className="py-2 pr-3 font-medium">Loan @ close</th>
                        <th className="py-2 pr-3 font-medium">Rate</th>
                        <th className="py-2 pr-3 font-medium">Consent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.clients.map((c: any) => (
                        <tr key={c.id} className="border-b border-border/60">
                          <td className="py-3 pr-3">{c.full_name}</td>
                          <td className="py-3 pr-3 text-muted-foreground">
                            {[c.address, c.city, c.state].filter(Boolean).join(", ")}
                          </td>
                          <td className="py-3 pr-3">{money(c.loan_balance_cents)}</td>
                          <td className="py-3 pr-3">{c.rate_at_close ? `${c.rate_at_close}%` : "—"}</td>
                          <td className="py-3 pr-3">
                            <ConsentPill state={c.consent_state} />
                          </td>
                        </tr>
                      ))}
                      {data.clients.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-muted-foreground">
                            No clients yet — upload a CSV above.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function RefiPill({ signal }: { signal: string | null }) {
  if (!signal) return <span className="text-xs text-muted-foreground">—</span>;
  const map: Record<string, string> = {
    strong: "bg-growth/15 text-growth",
    possible: "bg-accent text-accent-foreground",
    none: "bg-secondary text-secondary-foreground",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${map[signal] ?? "bg-secondary"}`}>
      {signal}
    </span>
  );
}

function ConsentPill({ state }: { state: string }) {
  if (state === "granted")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-growth/15 px-2 py-0.5 text-[10px] font-medium text-growth">
        <CheckCircle2 className="h-3 w-3" /> Granted
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      <Lock className="h-3 w-3" /> {state === "cold-lead" ? "Cold lead" : "Pending"}
    </span>
  );
}
