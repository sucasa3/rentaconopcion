import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { createPortfolio, listMyPortfolios } from "@/lib/lender.functions";
import { Building2, Plus, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/lender/")({
  head: () => ({
    meta: [
      { title: "Lender Portal — SuCasa" },
      { name: "description", content: "Manage your client portfolios and refi opportunities." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LenderHome,
});

function LenderHome() {
  const listFn = useServerFn(listMyPortfolios);
  const createFn = useServerFn(createPortfolio);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["lender-portfolios"],
    queryFn: () => listFn(),
  });
  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState("");

  const create = useMutation({
    mutationFn: () => createFn({ data: { orgId, name } }),
    onSuccess: () => {
      toast.success("Portfolio created");
      setName("");
      qc.invalidateQueries({ queryKey: ["lender-portfolios"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 px-5 py-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Lender Portal</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              Your portfolios
            </h1>
          </div>

          {error ? (
            <div className="rounded-3xl border border-border bg-card p-6 text-sm text-muted-foreground">
              {(error as Error).message}
            </div>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              {data && data.orgs.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
                  No organizations yet. An admin needs to add you to a lender org.
                </div>
              ) : (
                <>
                  <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
                    <h2 className="text-base font-semibold">New portfolio</h2>
                    <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                      <select
                        value={orgId}
                        onChange={(e) => setOrgId(e.target.value)}
                        className="rounded-full border border-border bg-background px-3 py-2 text-sm"
                      >
                        <option value="">Choose organization…</option>
                        {data?.orgs.map((o: any) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Portfolio name (e.g. Q3 Refi Book)"
                        className="rounded-full border border-border bg-background px-3 py-2 text-sm"
                      />
                      <button
                        disabled={!orgId || !name || create.isPending}
                        onClick={() => create.mutate()}
                        className="inline-flex items-center gap-1 rounded-full gradient-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        <Plus className="h-3 w-3" /> Create
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {data?.portfolios.map((p: any) => (
                      <Link
                        key={p.id}
                        to="/lender/portfolio/$id"
                        params={{ id: p.id }}
                        className="rounded-3xl border border-border bg-card p-6 shadow-soft transition hover:border-primary"
                      >
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-primary" />
                          <span className="text-xs text-muted-foreground">
                            {data.orgs.find((o: any) => o.id === p.org_id)?.name}
                          </span>
                        </div>
                        <p className="mt-2 text-lg font-semibold">{p.name}</p>
                        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3 w-3" /> {p.client_count} clients
                        </p>
                      </Link>
                    ))}
                    {data && data.portfolios.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No portfolios yet — create one above.
                      </p>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
