import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Download, Scale } from "lucide-react";
import {
  getBenchmarkReport,
  getBenchmarkSample,
  runBenchmarkTest,
} from "@/lib/benchmark.functions";

function money(n: number | null | undefined) {
  return n == null ? "—" : `$${Math.round(n).toLocaleString()}`;
}

function download(name: string, content: string, type = "text/csv") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0] as Record<string, unknown>);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

/**
 * ATTOM vs BatchData benchmark. Stage 1 (sample) and Stage 3 (report) are
 * read-only. Stage 2 is the only step that spends BatchData credits.
 */
export function BenchmarkPanel() {
  const sampleFn = useServerFn(getBenchmarkSample);
  const runFn = useServerFn(runBenchmarkTest);
  const reportFn = useServerFn(getBenchmarkReport);

  const [sample, setSample] = useState<any>(null);
  const [runId, setRunId] = useState("");
  const [report, setReport] = useState<any>(null);

  const sampleMut = useMutation({
    mutationFn: () => sampleFn({ data: {} }),
    onSuccess: (d) => setSample(d),
    onError: (e: any) => toast.error(e?.message ?? "Sample failed"),
  });

  const runMut = useMutation({
    mutationFn: () => runFn({ data: {} }),
    onSuccess: (d: any) => {
      setRunId(d.runId);
      toast.success(d.blocked ? `Run stopped early: ${d.blocked}` : "Benchmark run complete");
    },
    onError: (e: any) => toast.error(e?.message ?? "Run failed"),
  });

  const reportMut = useMutation({
    mutationFn: () => reportFn({ data: { runId } }),
    onSuccess: (d) => setReport(d),
    onError: (e: any) => toast.error(e?.message ?? "Report failed"),
  });

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-4 w-4" /> ATTOM vs BatchData benchmark
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Same properties, both providers. ATTOM side is read from stored data only — no ATTOM calls
          are ever made here.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stage 1 */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Stage 1</Badge>
            <span className="text-sm font-medium">Deterministic sample (no credits spent)</span>
            <Button size="sm" variant="outline" onClick={() => sampleMut.mutate()} disabled={sampleMut.isPending}>
              {sampleMut.isPending ? "Sampling…" : "Build sample"}
            </Button>
          </div>
          {sample ? (
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <p>
                <strong>{sample.size}</strong> of <strong>{sample.totalEligible}</strong> eligible
                ATTOM properties with stored mortgage records.
              </p>
              <p className="text-muted-foreground">{sample.selectionMethod}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="font-medium">Counties</p>
                  {sample.countyDistribution.slice(0, 8).map((c: any) => (
                    <p key={c.key} className="text-muted-foreground">
                      {c.key} — {c.count}
                    </p>
                  ))}
                </div>
                <div>
                  <p className="font-medium">Property types</p>
                  {sample.typeDistribution.map((c: any) => (
                    <p key={c.key} className="text-muted-foreground">
                      {c.key} — {c.count}
                    </p>
                  ))}
                </div>
                <div>
                  <p className="font-medium">Stored ATTOM value</p>
                  <p className="text-muted-foreground">min {money(sample.valueDistribution.min)}</p>
                  <p className="text-muted-foreground">p25 {money(sample.valueDistribution.p25)}</p>
                  <p className="text-muted-foreground">median {money(sample.valueDistribution.median)}</p>
                  <p className="text-muted-foreground">p75 {money(sample.valueDistribution.p75)}</p>
                  <p className="text-muted-foreground">max {money(sample.valueDistribution.max)}</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => download("benchmark-sample.csv", toCsv(sample.rows))}
              >
                <Download className="mr-1 h-3 w-3" /> Download the 100 selected properties
              </Button>
            </div>
          ) : null}
        </section>

        {/* Stage 2 */}
        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Stage 2</Badge>
            <span className="text-sm font-medium">Run BatchData — 1 call per property, no retries</span>
            <Button size="sm" onClick={() => runMut.mutate()} disabled={runMut.isPending}>
              {runMut.isPending ? "Running…" : "Run benchmark"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Stops immediately if the account blocks further calls. Results land only in the isolated
            test tables.
          </p>
        </section>

        {/* Stage 3 */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Stage 3</Badge>
            <Input
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
              placeholder="run id"
              className="h-8 max-w-xs"
            />
            <Button size="sm" variant="outline" onClick={() => reportMut.mutate()} disabled={!runId || reportMut.isPending}>
              {reportMut.isPending ? "Building…" : "Build comparison report"}
            </Button>
          </div>

          {report ? (
            <div className="space-y-4 text-sm">
              <div className="rounded-lg border p-3">
                <p className="font-semibold">
                  BatchData {report.scorecard.batchScore100}/100 · ATTOM {report.scorecard.attomScore100}/100
                </p>
                <p className="text-muted-foreground">
                  Decision agreement {report.decisions.overallAgreementPct}% · mortgage-dependent{" "}
                  {report.decisions.mortgageDependentAgreementPct}%
                </p>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-2 text-left">Category</th>
                      <th className="p-2 text-right">BatchData</th>
                      <th className="p-2 text-right">ATTOM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.scorecard.rows.map((r: any) => (
                      <tr key={r.category} className="border-t">
                        <td className="p-2">{r.category}</td>
                        <td className="p-2 text-right">{r.batch}</td>
                        <td className="p-2 text-right">{r.attom}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => download("benchmark-per-property.csv", toCsv(report.perProperty))}>
                  <Download className="mr-1 h-3 w-3" /> Per-property CSV
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => download("benchmark-report.json", JSON.stringify(report, null, 2), "application/json")}
                >
                  <Download className="mr-1 h-3 w-3" /> Full report JSON
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      </CardContent>
    </Card>
  );
}
