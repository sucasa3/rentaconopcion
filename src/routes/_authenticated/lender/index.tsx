import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { createPortfolio, listMyPortfolios, seedDemoPortfolio, seedRosterImport } from "@/lib/lender.functions";
import { Building2, Plus, Users, Sparkles } from "lucide-react";

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
  const seedFn = useServerFn(seedDemoPortfolio);
  const rosterFn = useServerFn(seedRosterImport);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["lender-portfolios"],
    queryFn: () => listFn(),
  });
  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState("");

  // Loan officers (non-managers) land straight in their own book.
  const myBook =
    data && !data.isManager
      ? (data.portfolios as any[]).find((p) => p.assigned_user_id === data.myUserId) ??
        ((data.portfolios as any[]).length === 1 ? (data.portfolios as any[])[0] : null)
      : null;
  useEffect(() => {
    if (myBook) navigate({ to: "/lender/portfolio/$id", params: { id: myBook.id }, replace: true });
  }, [myBook?.id]);


  const create = useMutation({
    mutationFn: () => createFn({ data: { orgId, name } }),
    onSuccess: () => {
      toast.success("Portfolio created");
      setName("");
      qc.invalidateQueries({ queryKey: ["lender-portfolios"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const seed = useMutation({
    mutationFn: () => seedFn(),
    onSuccess: (r: any) => {
      toast.success(
        r.seeded ? "Seeded 250-client demo portfolio" : "Demo portfolio ready",
      );
      qc.invalidateQueries({ queryKey: ["lender-portfolios"] });
      navigate({ to: "/lender/portfolio/$id", params: { id: r.portfolioId } });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const roster = useMutation({
    mutationFn: () => rosterFn(),
    onSuccess: (r: any) => {
      toast.success(r.seeded ? "Imported 76 client homeowners" : "Client roster ready");
      qc.invalidateQueries({ queryKey: ["lender-portfolios"] });
      navigate({ to: "/lender/portfolio/$id", params: { id: r.portfolioId } });
    },
    onError: (e: any) => toast.error(e.message),
  });


  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 px-5 py-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Lender Portal</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                Your portfolios
              </h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/lender/campaigns"
                className="inline-flex items-center gap-1 rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Campaigns
              </Link>
              <button
                onClick={() => roster.mutate()}
                disabled={roster.isPending}
                className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-500/10 disabled:opacity-60"
              >
                <Sparkles className="h-3 w-3" />
                {roster.isPending ? "Importing…" : "Import 76 client roster"}
              </button>
              <button
                onClick={() => seed.mutate()}
                disabled={seed.isPending}
                className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-60"
              >
                <Sparkles className="h-3 w-3" />
                {seed.isPending ? "Seeding…" : "Preview 250-client demo"}
              </button>
            </div>
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
                  No organizations yet — click <strong>Preview 250-client demo</strong> above to
                  create a demo lender org with a seeded book.
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
