import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FlaskConical, CheckCircle2, XCircle, Download } from "lucide-react";
import { BulkClientUpload } from "@/components/bulk-client-upload";
import { BatchdataReportView } from "@/components/batchdata-report-view";
import { buildReport, type CallRow } from "@/lib/batchdata-report";
import {
  getBatchdataTestResults,
  getBatchdataTestRuns,
  listBatchdataCandidates,
  parseBatchdataTestCsv,
  startBatchdataTestRun,
  testBatchdataConnection,
} from "@/lib/batchdata-test.functions";


export const Route = createFileRoute("/_authenticated/batchdata-test")({
  head: () => ({
    meta: [
      { title: "BatchData Test Lab — SuCasa" },
      { name: "description", content: "Isolated BatchData provider testing. No production property data is affected." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "BatchData Test Lab — SuCasa" },
      { property: "og:description", content: "Isolated BatchData provider testing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BatchdataTestLab,
});

function useIsAdmin() {
  return useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return false;
      const { data } = await supabase.rpc("has_role", { _user_id: auth.user.id, _role: "admin" });
      return Boolean(data);
    },
    staleTime: 60_000,
  });
}

function BatchdataTestLab() {
  const { data: isAdmin, isPending } = useIsAdmin();
  const queryClient = useQueryClient();

  const connTest = useServerFn(testBatchdataConnection);
  const listCandidates = useServerFn(listBatchdataCandidates);
  const startRun = useServerFn(startBatchdataTestRun);
  const listRuns = useServerFn(getBatchdataTestRuns);
  const listResults = useServerFn(getBatchdataTestResults);

  const [label, setLabel] = useState("BatchData test run");
  const [pasted, setPasted] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [activeRun, setActiveRun] = useState<string | null>(null);
  const [conn, setConn] = useState<any>(null);

  const candidates = useQuery({
    queryKey: ["bd-candidates"],
    queryFn: () => listCandidates({ data: { limit: 100 } }),
    enabled: Boolean(isAdmin),
  });

  const runs = useQuery({
    queryKey: ["bd-runs"],
    queryFn: () => listRuns(),
    enabled: Boolean(isAdmin),
  });

  const results = useQuery({
    queryKey: ["bd-results", activeRun],
    queryFn: () => listResults({ data: { runId: activeRun! } }),
    enabled: Boolean(activeRun),
  });

  const connMutation = useMutation({
    mutationFn: () => connTest(),
    onSuccess: (r) => setConn(r),
    onError: (e: any) => toast.error(e?.message ?? "Connection test failed"),
  });

  const runMutation = useMutation({
    mutationFn: () =>
      startRun({
        data: {
          label,
          contactIds: selected,
          pastedAddresses: pasted.split("\n").map((l) => l.trim()).filter(Boolean),
        },
      }),
    onSuccess: (r: any) => {
      toast.success("Test run complete");
      setActiveRun(r.runId);
      queryClient.invalidateQueries({ queryKey: ["bd-runs"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Test run failed"),
  });

  const totalSelected = useMemo(
    () => selected.length + pasted.split("\n").filter((l) => l.trim()).length,
    [selected, pasted],
  );

  function exportCsv() {
    const rows = results.data ?? [];
    if (!rows.length) return;
    const header = ["input_address", "matched", "success", "http_status", "duration_ms", "owner", "estimate", "loan_amount", "error"];
    const lines = rows.map((r: any) => {
      const n = r.normalized;
      return [
        r.input_address,
        r.matched,
        r.success,
        r.http_status,
        r.duration_ms,
        n?.ownership?.ownerName ?? "",
        n?.valuation?.estimate ?? "",
        n?.mortgage?.loanAmount ?? "",
        (r.error_message ?? "").replace(/"/g, "'"),
      ]
        .map((v) => `"${String(v ?? "")}"`)
        .join(",");
    });
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `batchdata-test-${activeRun}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isPending) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex-1 px-5 py-16 text-center text-sm text-muted-foreground">Checking access…</main>
        <SiteFooter />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex-1 px-5 py-16 text-center text-sm text-muted-foreground">Admins only.</main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-5 px-4 py-6">
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold tracking-tight">BatchData Test Lab</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Isolated provider testing. Nothing here writes to production property data or the enrichment queue.
          </p>
        </header>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Connection test</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button size="sm" onClick={() => connMutation.mutate()} disabled={connMutation.isPending}>
              {connMutation.isPending ? "Testing…" : "Run connection test"}
            </Button>
            {conn && (
              <div className="rounded-xl border bg-background p-3 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  {conn.pass ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  {conn.pass ? "PASS" : "FAIL"}
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                  <dt>API key configured</dt>
                  <dd>{conn.keyConfigured ? "Yes" : "No"}</dd>
                  <dt>HTTP status</dt>
                  <dd>{conn.status}</dd>
                  <dt>Response time</dt>
                  <dd>{conn.durationMs} ms</dd>
                  <dt>Provider request id</dt>
                  <dd>{conn.requestId ?? "—"}</dd>
                </dl>
                <p className="mt-2 text-xs">{conn.message}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New test run</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Run label" />

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Pick existing contacts ({selected.length} selected)
              </p>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border bg-background p-2">
                {(candidates.data ?? []).map((c: any) => {
                  const on = selected.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setSelected((prev) => (on ? prev.filter((x) => x !== c.id) : [...prev, c.id].slice(0, 100)))
                      }
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                        on ? "bg-primary/10 text-foreground" : "hover:bg-muted"
                      }`}
                    >
                      <span className="truncate">
                        <span className="font-medium">{c.name ?? "Unnamed"}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{c.address}</span>
                      </span>
                      {on && <Badge variant="secondary">Selected</Badge>}
                    </button>
                  );
                })}
                {candidates.isPending && <p className="p-2 text-xs text-muted-foreground">Loading contacts…</p>}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Or paste addresses (one per line)
              </p>
              <Textarea
                rows={4}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder="123 Main St, Miami, FL 33131"
              />
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{totalSelected} address(es) queued · max 100 per run</p>
              <Button
                onClick={() => runMutation.mutate()}
                disabled={runMutation.isPending || totalSelected === 0}
              >
                {runMutation.isPending ? "Running…" : "Start test run"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Runs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(runs.data ?? []).map((r: any) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setActiveRun(r.id)}
                className={`w-full rounded-xl border p-3 text-left text-sm ${
                  activeRun === r.id ? "border-primary bg-primary/5" : "bg-background hover:bg-muted"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{r.label}</span>
                  <Badge variant="secondary">{r.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.submitted_count} submitted · {r.matched_count} matched · {r.unmatched_count} unmatched ·{" "}
                  {r.failed_count} failed · {r.api_request_count} API requests · est. $
                  {(r.estimated_cost_cents / 100).toFixed(2)}
                </p>
              </button>
            ))}
            {!runs.isPending && (runs.data ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">No test runs yet.</p>
            )}
          </CardContent>
        </Card>

        {activeRun && (
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Results</CardTitle>
              <Button size="sm" variant="outline" onClick={exportCsv}>
                <Download className="mr-1 h-4 w-4" /> CSV
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {results.isPending && <p className="text-xs text-muted-foreground">Loading…</p>}
              {(results.data ?? []).map((r: any) => {
                const n = r.normalized;
                return (
                  <div key={r.id} className="rounded-xl border bg-background p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">{r.input_address}</span>
                      <Badge variant={r.matched ? "default" : r.success ? "secondary" : "destructive"}>
                        {r.matched ? "Matched" : r.success ? "No match" : "Failed"}
                      </Badge>
                    </div>
                    {n && (
                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <dt>Owner</dt>
                        <dd>{n.ownership?.ownerName ?? "—"}</dd>
                        <dt>Estimated value</dt>
                        <dd>{n.valuation?.estimate ? `$${Number(n.valuation.estimate).toLocaleString()}` : "—"}</dd>
                        <dt>Loan amount</dt>
                        <dd>{n.mortgage?.loanAmount ? `$${Number(n.mortgage.loanAmount).toLocaleString()}` : "—"}</dd>
                        <dt>Year built</dt>
                        <dd>{n.property?.yearBuilt ?? "—"}</dd>
                        <dt>Last sale</dt>
                        <dd>{n.sales?.lastSaleDate ?? "—"}</dd>
                      </dl>
                    )}
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      HTTP {r.http_status} · {r.duration_ms} ms {r.error_message ? `· ${r.error_message}` : ""}
                    </p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
