import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TestReport } from "@/lib/batchdata-report";

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function BatchdataReportView({ report }: { report: TestReport }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Outcome</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Homes submitted" value={report.submitted} />
          <Stat label="Matched" value={report.matched} />
          <Stat label="Unmatched" value={report.unmatched} />
          <Stat label="Full profile" value={report.full} />
          <Stat label="Partial" value={report.partial} />
          <Stat label="Failed" value={report.failed} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Call accounting</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Total provider calls" value={report.totalCalls} />
          <Stat label="Required by provider" value={report.providerCalls} hint="First attempt, unique address" />
          <Stat label="Application-generated" value={report.applicationCalls} hint="Retries + duplicates" />
          <Stat label="Failed calls" value={report.failedCalls} />
          <Stat label="Retry calls" value={report.retryCalls} />
          <Stat label="Duplicate calls" value={report.duplicateCalls} />
          <Stat label="Cache hits" value={report.cacheHits} />
          <Stat label="Duplicate addresses in file" value={report.duplicateAddresses} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Calls per home</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Average" value={report.avgCallsPerHome} />
            <Stat label="Median" value={report.medianCallsPerHome} />
            <Stat label="Min" value={report.minCallsPerHome} />
            <Stat label="Max" value={report.maxCallsPerHome} />
            <Stat label="Per matched home" value={report.avgCallsPerMatched} />
            <Stat label="Per fully enriched" value={report.avgCallsPerFull} />
          </div>
          <div className="space-y-1">
            {report.distribution.map((d) => (
              <div key={d.bucket} className="flex items-center justify-between rounded-xl border bg-background px-3 py-2 text-sm">
                <span>{d.bucket}</span>
                <span className="tabular-nums text-muted-foreground">{d.homes} homes</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Data coverage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {report.coverage.map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-2 rounded-xl border bg-background px-3 py-2 text-sm">
              <span className="truncate">{c.label}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="tabular-nums text-muted-foreground">
                  {c.returnedHomes} · {c.pctOfMatched}%
                </span>
                <Badge variant={c.status === "Returned" ? "secondary" : "destructive"}>{c.status}</Badge>
              </span>
            </div>
          ))}
          <p className="pt-1 text-[11px] text-muted-foreground">
            Percentages are of matched homes. All groups arrive in the same single bundled lookup — 1 call required.
          </p>
        </CardContent>
      </Card>

      {report.partialReasons.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Why homes are PARTIAL</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {report.partialReasons.map((r) => (
              <div key={r.key} className="flex items-center justify-between rounded-xl border bg-background px-3 py-2 text-sm">
                <span>Missing {r.label.toLowerCase()}</span>
                <span className="tabular-nums text-muted-foreground">{r.homes} homes</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Scale projection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {report.scale.map((s) => (
            <div key={s.homes} className="flex items-center justify-between rounded-xl border bg-background px-3 py-2 text-sm">
              <span>{s.homes.toLocaleString()} homes</span>
              <span className="tabular-nums text-muted-foreground">
                {s.expected.toLocaleString()} calls ({s.low.toLocaleString()}–{s.high.toLocaleString()})
              </span>
            </div>
          ))}
          <p className="pt-1 text-[11px] text-muted-foreground">
            Derived from this run's observed rate; range uses observed min and max calls per home.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
