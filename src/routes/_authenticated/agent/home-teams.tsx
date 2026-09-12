import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BusinessShell } from "@/components/business-shell";
import {
  HOMEOWNER_CONFIRMED_NOTICE,
  isLockedByHomeowner,
  progressLabel,
  rankProfessionals,
  suggestionLabel,
  summarizeBulk,
  type NetworkProfessional,
  type ReviewQueueItem,
} from "@/lib/agent-network";
import {
  addProfessionalToNetwork,
  bulkSetClientLender,
  listHomeTeamReviewQueue,
  listMyProfessionalNetwork,
  rejectHomeTeamSuggestion,
  setClientLender,
  setHomeTeamDecision,
} from "@/lib/agent-network.functions";
import { listMyOrgs } from "@/lib/network.functions";
import { ArrowLeft, ArrowRight, Check, Lock, Plus, Search, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/agent/home-teams")({
  head: () => ({
    meta: [
      { title: "Complete Home Teams — SuCasa" },
      {
        name: "description",
        content:
          "Name each client's loan officer in seconds, using the people you already work with.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HomeTeamsPage,
});

function HomeTeamsPage() {
  const orgsFn = useServerFn(listMyOrgs);
  const { data: orgsData } = useQuery({ queryKey: ["my-orgs"], queryFn: () => orgsFn() });
  const agentOrgs = (orgsData?.orgs ?? []).filter((o: any) => o.org_type === "agent");
  const orgId = agentOrgs[0]?.id ?? "";

  return (
    <BusinessShell kind="agent">
      <main className="px-4 py-6 sm:px-5 sm:py-8">
        <div className="mx-auto max-w-3xl space-y-5">
          <div>
            <Link
              to="/agent/network"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Professional network
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Complete Home Teams
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              One question per client: who is their loan officer? Skip anything you're unsure of.
            </p>
          </div>
          {orgId ? (
            <Review orgId={orgId} />
          ) : (
            <div className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              You're not part of an agent workspace yet.
            </div>
          )}
        </div>
      </main>
    </BusinessShell>
  );
}

function Review({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const queueFn = useServerFn(listHomeTeamReviewQueue);
  const peopleFn = useServerFn(listMyProfessionalNetwork);
  const assignFn = useServerFn(setClientLender);
  const decisionFn = useServerFn(setHomeTeamDecision);
  const rejectFn = useServerFn(rejectHomeTeamSuggestion);
  const bulkFn = useServerFn(bulkSetClientLender);
  const addFn = useServerFn(addProfessionalToNetwork);

  const queueKey = ["home-team-queue", orgId];
  const peopleKey = ["my-network", orgId];

  const { data: queue } = useQuery({
    queryKey: queueKey,
    queryFn: () => queueFn({ data: { orgId } }),
  });
  const { data: net } = useQuery({
    queryKey: peopleKey,
    queryFn: () => peopleFn({ data: { orgId } }),
  });

  const items: ReviewQueueItem[] = (queue?.items ?? []) as ReviewQueueItem[];
  const people: NetworkProfessional[] = (net?.people ?? []) as NetworkProfessional[];

  const [cursor, setCursor] = useState(0);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newOrg, setNewOrg] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const current = items[cursor];
  const ranked = useMemo(
    () => rankProfessionals(people, { query, recentIds: recent }),
    [people, query, recent],
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: queueKey });
    qc.invalidateQueries({ queryKey: peopleKey });
  };
  const advance = () => setCursor((c) => Math.min(c + 1, Math.max(items.length - 1, 0)));

  const assign = useMutation({
    mutationFn: (v: { professionalId: string; candidateId?: string | null }) =>
      assignFn({
        data: {
          orgId,
          portfolioClientId: current!.portfolioClientId,
          professionalId: v.professionalId,
          candidateId: v.candidateId ?? null,
        },
      }),
    onSuccess: (r: any, v) => {
      if (r.outcome === "blocked_homeowner_confirmed") {
        toast.error(HOMEOWNER_CONFIRMED_NOTICE);
        return;
      }
      setRecent((prev) => [v.professionalId, ...prev.filter((id) => id !== v.professionalId)].slice(0, 5));
      toast.success(r.outcome === "unchanged" ? "Already set" : "Home Team updated");
      refresh();
      advance();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const decide = useMutation({
    mutationFn: (decision: "no_lender" | "unknown") =>
      decisionFn({ data: { orgId, portfolioClientId: current!.portfolioClientId, decision } }),
    onSuccess: (r: any) => {
      if (r.outcome === "blocked_homeowner_confirmed") {
        toast.error(HOMEOWNER_CONFIRMED_NOTICE);
        return;
      }
      toast.success("Noted");
      refresh();
      advance();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const rejectSuggestion = useMutation({
    mutationFn: (candidateId: string) => rejectFn({ data: { orgId, candidateId } }),
    onSuccess: () => {
      toast.success("Suggestion dismissed");
      refresh();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const bulk = useMutation({
    mutationFn: (professionalId: string) =>
      bulkFn({ data: { orgId, professionalId, portfolioClientIds: selected } }),
    onSuccess: (r: any) => {
      const s = summarizeBulk(r.results ?? []);
      toast.success(s.message);
      setSelected([]);
      setBulkMode(false);
      refresh();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const add = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          orgId,
          fullName: newName,
          orgNameRaw: newOrg || null,
          email: newEmail || null,
          phone: newPhone || null,
          role: "loan_officer" as const,
        },
      }),
    onSuccess: (r: any) => {
      setAdding(false);
      setNewName("");
      setNewOrg("");
      setNewEmail("");
      setNewPhone("");
      if (r.possibleDuplicates > 0) {
        toast.success("Added — we found a similar person, so it's flagged for review");
      } else {
        toast.success("Added to your network");
      }
      qc.invalidateQueries({ queryKey: peopleKey });
      if (current) assign.mutate({ professionalId: r.professionalId });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const progress = queue?.progress ?? { reviewed: 0, total: 0 };

  if (!items.length) {
    return (
      <div className="rounded-3xl border border-dashed border-border p-8 text-center">
        <ShieldCheck className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">No clients to review yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Import or add clients and their Home Teams will show up here.
        </p>
      </div>
    );
  }

  if (progress.reviewed >= progress.total) {
    return (
      <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-soft">
        <Check className="mx-auto h-6 w-6 text-status-positive" />
        <p className="mt-2 text-sm font-medium">
          {progress.reviewed} Home Team{progress.reviewed === 1 ? "" : "s"} reviewed
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Nothing left in the queue. Come back after your next import.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{progressLabel(progress)}</p>
        <button
          onClick={() => {
            setBulkMode((b) => !b);
            setSelected([]);
          }}
          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          {bulkMode ? "One at a time" : "Select several"}
        </button>
      </div>

      {bulkMode ? (
        <div className="space-y-3">
          <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
            <p className="text-sm font-semibold">Apply one person to several clients</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Clients with a homeowner-confirmed lender aren't listed here.
            </p>
            <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
              {items
                .filter((i) => !isLockedByHomeowner(i))
                .map((i) => (
                  <label
                    key={i.portfolioClientId}
                    className="flex items-center gap-3 rounded-2xl border border-border px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(i.portfolioClientId)}
                      onChange={(e) =>
                        setSelected((prev) =>
                          e.target.checked
                            ? [...prev, i.portfolioClientId]
                            : prev.filter((id) => id !== i.portfolioClientId),
                        )
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{i.clientName}</span>
                      {i.suggestions[0] && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {suggestionLabel(i.suggestions[0].institution)}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
            </div>
          </div>

          {selected.length > 0 && (
            <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
              <p className="text-sm font-semibold">
                Use one person for {selected.length} client{selected.length === 1 ? "" : "s"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {ranked.map((p) => (
                  <button
                    key={p.id}
                    disabled={bulk.isPending}
                    onClick={() => bulk.mutate(p.id)}
                    className="rounded-full border border-sucasa-orange/40 bg-sucasa-orange/10 px-4 py-2 text-xs font-semibold text-sucasa-orange disabled:opacity-60"
                  >
                    Use {p.full_name}
                  </button>
                ))}
                {!ranked.length && (
                  <p className="text-xs text-muted-foreground">
                    Add someone to your network first.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      ) : current ? (
        <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
          <p className="text-lg font-semibold">{current.clientName}</p>
          {current.address && (
            <p className="mt-0.5 text-xs text-muted-foreground">{current.address}</p>
          )}

          <div className="mt-3 space-y-1.5">
            {current.suggestions.map((s) => (
              <div
                key={s.candidateId}
                className="flex items-center justify-between gap-2 rounded-2xl border border-surface-intelligence-border bg-surface-intelligence px-3 py-2 text-surface-intelligence-foreground"
              >
                <p className="min-w-0 text-xs">{suggestionLabel(s.institution)}</p>
                <button
                  onClick={() => rejectSuggestion.mutate(s.candidateId)}
                  className="shrink-0 text-[11px] font-medium text-muted-foreground underline"
                >
                  Not correct
                </button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              On file:{" "}
              {current.onFile ? (
                <span className="font-medium text-foreground">
                  {current.onFile.professionalName}
                  {current.onFile.status === "confirmed" ? " — confirmed by homeowner" : ""}
                </span>
              ) : (
                "none yet"
              )}
            </p>
          </div>

          {isLockedByHomeowner(current) ? (
            <div className="mt-4 flex items-start gap-2 rounded-2xl border border-border px-3 py-3">
              <Lock className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{HOMEOWNER_CONFIRMED_NOTICE}</p>
            </div>
          ) : (
            <>
              {recent.length > 0 && (
                <div className="mt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Recently used
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {recent.map((id) => {
                      const p = people.find((x) => x.id === id);
                      if (!p) return null;
                      return (
                        <button
                          key={id}
                          onClick={() => assign.mutate({ professionalId: id })}
                          className="rounded-full border border-sucasa-orange/40 bg-sucasa-orange/10 px-4 py-2 text-xs font-semibold text-sucasa-orange"
                        >
                          {p.full_name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-4">
                <div className="flex items-center gap-2 rounded-full border border-border px-3 py-2">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search my network"
                    className="w-full bg-transparent text-sm outline-none"
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ranked.slice(0, 8).map((p) => (
                    <button
                      key={p.id}
                      disabled={assign.isPending}
                      onClick={() =>
                        assign.mutate({
                          professionalId: p.id,
                          candidateId: current.suggestions[0]?.candidateId ?? null,
                        })
                      }
                      className="rounded-full border border-border px-4 py-2 text-xs font-medium hover:bg-muted disabled:opacity-60"
                    >
                      {p.full_name}
                      {p.org_name ? ` · ${p.org_name}` : ""}
                    </button>
                  ))}
                </div>
              </div>

              {adding ? (
                <div className="mt-4 space-y-2 rounded-2xl border border-border p-3">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Loan officer name"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  />
                  <input
                    value={newOrg}
                    onChange={(e) => setNewOrg(e.target.value)}
                    placeholder="Company (optional)"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  />
                  <input
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="Email (optional)"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  />
                  <input
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="Phone (optional)"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => add.mutate()}
                      disabled={newName.trim().length < 2 || add.isPending}
                      className="rounded-full gradient-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      Add and use
                    </button>
                    <button
                      onClick={() => setAdding(false)}
                      className="rounded-full border border-border px-4 py-2 text-xs font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAdding(true)}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-sucasa-orange"
                >
                  <Plus className="h-3 w-3" /> Add a different lender
                </button>
              )}

              <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                <button
                  onClick={() => decide.mutate("no_lender")}
                  className="rounded-full border border-border px-4 py-2 text-xs font-medium hover:bg-muted"
                >
                  No current lender
                </button>
                <button
                  onClick={() => decide.mutate("unknown")}
                  className="rounded-full border border-border px-4 py-2 text-xs font-medium hover:bg-muted"
                >
                  I don't know
                </button>
                <button
                  onClick={advance}
                  className="ml-auto inline-flex items-center gap-1 rounded-full px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Skip <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
