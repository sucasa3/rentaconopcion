import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import {
  getAgentPortfolio,
  enrichAgentPortfolio,
  setListingStatus,
  generateAgentBrief,
} from "@/lib/agent.functions";
import {
  ArrowLeft,
  Search,
  Sparkles,
  Loader2,
  Mail,
  Phone,
  X,
  Flame,
  Copy,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/agent/portfolio/$id")({
  head: () => ({
    meta: [
      { title: "Sphere intelligence — SuCasa Agent" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AgentPortfolio,
});

const money = (n: number | null | undefined) =>
  n == null ? "—" : `$${Math.round(n).toLocaleString()}`;

const BAND_META: Record<string, { label: string; tone: string }> = {
  hot: { label: "Hot", tone: "bg-growth/15 text-growth border-growth/30" },
  warm: { label: "Warm", tone: "bg-amber-500/10 text-amber-700 border-amber-500/30" },
  nurture: { label: "Nurture", tone: "bg-primary/10 text-primary border-primary/30" },
  hold: { label: "Hold", tone: "bg-secondary text-muted-foreground border-border" },
};

const STATUSES = ["off_market", "active", "pending", "sold", "expired", "withdrawn"] as const;

function AgentPortfolio() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getAgentPortfolio);
  const enrichFn = useServerFn(enrichAgentPortfolio);
  const listingFn = useServerFn(setListingStatus);
  const briefFn = useServerFn(generateAgentBrief);
  const qc = useQueryClient();

  const [band, setBand] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [brief, setBrief] = useState<string>("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["agent-portfolio", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const enrich = useMutation({
    mutationFn: () => enrichFn({ data: { portfolioId: id, limit: 10 } }),
    onSuccess: (r: any) => {
      toast.success(`Pulled property records for ${r.enriched} homes`);
      qc.invalidateQueries({ queryKey: ["agent-portfolio", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveListing = useMutation({
    mutationFn: (v: any) => listingFn({ data: v }),
    onSuccess: () => {
      toast.success("Listing status saved");
      qc.invalidateQueries({ queryKey: ["agent-portfolio", id] });
      setSelected(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const makeBrief = useMutation({
    mutationFn: (clientId: string) => briefFn({ data: { clientId, language: "en" as const } }),
    onSuccess: (r: any) => setBrief(r.brief),
    onError: (e: any) => toast.error(e.message),
  });

  const clients = useMemo(() => {
    const rows = data?.clients ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter(
      (c: any) =>
        (band === "all" || c.band === band) &&
        (!q ||
          (c.name ?? "").toLowerCase().includes(q) ||
          (c.address ?? "").toLowerCase().includes(q)),
    );
  }, [data, band, search]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Link
          to="/agent"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Agent portal
        </Link>

        {isLoading && <p className="mt-8 text-muted-foreground">Loading sphere…</p>}
        {error && <p className="mt-8 text-destructive">{(error as Error).message}</p>}

        {data && (
          <>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">{data.portfolio.name}</h1>
                <p className="text-sm text-muted-foreground">{data.portfolio.orgName}</p>
              </div>
              <button
                onClick={() => enrich.mutate()}
                disabled={enrich.isPending}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:border-primary/40 disabled:opacity-60"
              >
                {enrich.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 text-growth" />
                )}
                Pull property records (10)
              </button>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Stat label="Households" value={String(data.summary.total)} />
              <Stat label="With records" value={String(data.summary.with_intel)} />
              <Stat label="Hot" value={String(data.summary.bands.hot)} accent />
              <Stat label="Expired" value={String(data.summary.expired)} />
              <Stat label="Sphere equity" value={money(data.summary.total_equity)} />
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              {["all", "hot", "warm", "nurture", "hold"].map((b) => (
                <button
                  key={b}
                  onClick={() => setBand(b)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${
                    band === b
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {b}
                </button>
              ))}
              <div className="relative ml-auto">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name or address"
                  className="w-56 rounded-lg border border-border bg-card py-2 pl-8 pr-3 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Household</th>
                    <th className="px-4 py-3">Move score</th>
                    <th className="px-4 py-3 hidden md:table-cell">Top signal</th>
                    <th className="px-4 py-3 hidden lg:table-cell">Value</th>
                    <th className="px-4 py-3 hidden lg:table-cell">Equity</th>
                    <th className="px-4 py-3 hidden sm:table-cell">Tenure</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c: any) => (
                    <tr
                      key={c.id}
                      onClick={() => {
                        setSelected(c);
                        setBrief("");
                      }}
                      className="cursor-pointer border-t border-border/60 hover:bg-secondary/40"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium">{c.name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.address}
                          {c.city ? `, ${c.city}` : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${
                            BAND_META[c.band]?.tone
                          }`}
                        >
                          {c.band === "hot" && <Flame className="h-3 w-3" />}
                          {c.move_score} · {BAND_META[c.band]?.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                        {c.signals[0]?.label ?? (c.has_intel ? "No signals" : "No records yet")}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">{money(c.estimated_value)}</td>
                      <td className="px-4 py-3 hidden lg:table-cell">{money(c.equity_dollars)}</td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {c.tenure_years ? `${c.tenure_years.toFixed(1)} yr` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {clients.length === 0 && (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No households match this filter.
                </p>
              )}
            </div>
          </>
        )}
      </main>

      {selected && (
        <ClientDrawer
          client={selected}
          brief={brief}
          briefLoading={makeBrief.isPending}
          onBrief={() => makeBrief.mutate(selected.id)}
          onClose={() => setSelected(null)}
          onSaveListing={(v: any) => saveListing.mutate({ clientId: selected.id, ...v })}
          saving={saveListing.isPending}
        />
      )}
      <SiteFooter />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${accent ? "text-growth" : ""}`}>{value}</p>
    </div>
  );
}

function ClientDrawer({
  client,
  brief,
  briefLoading,
  onBrief,
  onClose,
  onSaveListing,
  saving,
}: {
  client: any;
  brief: string;
  briefLoading: boolean;
  onBrief: () => void;
  onClose: () => void;
  onSaveListing: (v: any) => void;
  saving: boolean;
}) {
  const [status, setStatus] = useState<string>(client.listing?.status ?? "off_market");
  const [otherAgent, setOtherAgent] = useState<boolean>(
    client.listing?.listed_with_other_agent ?? false,
  );
  const [agentName, setAgentName] = useState<string>(client.listing?.listing_agent_name ?? "");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/40" onClick={onClose}>
      <aside
        className="h-full w-full max-w-md overflow-y-auto bg-background p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">{client.name ?? "Household"}</h2>
            <p className="text-sm text-muted-foreground">
              {client.address}
              {client.city ? `, ${client.city}` : ""} {client.state} {client.zip}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${BAND_META[client.band]?.tone}`}
          >
            Move score {client.move_score} · {BAND_META[client.band]?.label}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <Field label="Est. value" value={money(client.estimated_value)} />
          <Field label="Equity" value={money(client.equity_dollars)} />
          <Field
            label="Tenure"
            value={client.tenure_years ? `${client.tenure_years.toFixed(1)} yr` : "—"}
          />
          <Field
            label="Beds / baths"
            value={client.beds ? `${client.beds} / ${client.baths ?? "—"}` : "—"}
          />
          <Field label="Sqft" value={client.sqft ? client.sqft.toLocaleString() : "—"} />
          <Field label="Year built" value={client.year_built ?? "—"} />
          <Field label="Permits" value={money(client.permit_total_value)} />
          <Field
            label="Taxes"
            value={
              client.tax_amount
                ? `${money(client.tax_amount)}${
                    client.tax_change_pct
                      ? ` (${client.tax_change_pct > 0 ? "+" : ""}${client.tax_change_pct}%)`
                      : ""
                  }`
                : "—"
            }
          />
        </div>

        <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Signals
        </h3>
        <ul className="mt-2 space-y-2">
          {client.signals.length === 0 && (
            <li className="text-sm text-muted-foreground">
              {client.has_intel
                ? "No movement signals yet."
                : "No property records pulled for this address yet."}
            </li>
          )}
          {client.signals.map((s: any, i: number) => (
            <li key={i} className="rounded-lg border border-border bg-card p-3">
              <p className="text-sm font-medium">{s.label}</p>
              <p className="text-xs text-muted-foreground">{s.detail}</p>
            </li>
          ))}
        </ul>

        <div className="mt-5 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Suggested opener
          </p>
          <p className="mt-1 text-sm">{client.opener}</p>
          <button
            onClick={() => {
              navigator.clipboard.writeText(client.opener);
              toast.success("Copied");
            }}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary"
          >
            <Copy className="h-3 w-3" /> Copy
          </button>
        </div>

        <button
          onClick={onBrief}
          disabled={briefLoading}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {briefLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Generate listing brief
        </button>
        {brief && (
          <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-border bg-card p-3 text-sm">
            {brief}
          </pre>
        )}

        <div className="mt-5 flex gap-2">
          {client.phone && (
            <a
              href={`tel:${client.phone}`}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <Phone className="h-4 w-4" /> Call
            </a>
          )}
          {client.email && (
            <a
              href={`mailto:${client.email}`}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <Mail className="h-4 w-4" /> Email
            </a>
          )}
        </div>

        <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Listing status
        </h3>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={otherAgent}
            onChange={(e) => setOtherAgent(e.target.checked)}
          />
          Listed with another agent
        </label>
        {otherAgent && (
          <input
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            placeholder="Listing agent name"
            className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
          />
        )}
        <button
          onClick={() =>
            onSaveListing({
              status,
              listedWithOtherAgent: otherAgent,
              listingAgentName: agentName || null,
            })
          }
          disabled={saving}
          className="mt-3 w-full rounded-lg border border-border px-4 py-2 text-sm font-medium hover:border-primary/40 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save listing status"}
        </button>
      </aside>
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}
