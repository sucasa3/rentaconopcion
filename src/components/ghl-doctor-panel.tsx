import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, XCircle, MinusCircle, Stethoscope } from "lucide-react";
import {
  getCampaignCrmFailures,
  retryCampaignCrmPush,
  runGhlConnectionDoctor,
} from "@/lib/ghl.functions";

type Check = { key: string; label: string; status: string; detail: string };

export function GhlDoctorPanel() {
  const qc = useQueryClient();
  const runFn = useServerFn(runGhlConnectionDoctor);
  const failuresFn = useServerFn(getCampaignCrmFailures);
  const retryFn = useServerFn(retryCampaignCrmPush);

  const { data: failures } = useQuery({
    queryKey: ["campaign-crm-failures"],
    queryFn: () => failuresFn(),
    refetchInterval: 30_000,
  });

  const doctor = useMutation({ mutationFn: () => runFn() });
  const retry = useMutation({
    mutationFn: () => retryFn({ data: { limit: 50 } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaign-crm-failures"] }),
  });

  const report = doctor.data;

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">GoHighLevel connection</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Checks the token, scopes, pipeline, custom fields and campaign tags.
          </p>
        </div>
        <button
          onClick={() => doctor.mutate()}
          disabled={doctor.isPending}
          className="inline-flex items-center gap-1.5 rounded-full gradient-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          <Stethoscope className="h-3.5 w-3.5" />
          {doctor.isPending ? "Testing…" : "Test connection"}
        </button>
      </div>

      {doctor.isError && (
        <p className="mt-3 text-xs text-destructive">{(doctor.error as Error).message}</p>
      )}

      {report && (
        <>
          <p
            className={`mt-4 rounded-2xl px-4 py-3 text-xs font-medium ${
              report.ok
                ? "bg-primary/10 text-primary"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {report.ok
              ? "Connection is healthy — contacts can be pushed."
              : "Connection is not usable yet. Fix the failing checks below in GoHighLevel."}
          </p>

          <ul className="mt-3 space-y-2">
            {(report.checks as Check[]).map((c) => (
              <li key={c.key} className="flex gap-2 rounded-2xl border border-border px-3 py-2">
                <StatusIcon status={c.status} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className="mt-0.5 break-words text-xs text-muted-foreground">{c.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-5 border-t border-border/60 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Campaign sends waiting on CRM</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {failures?.total ?? 0} send(s) reached GoHighLevel and failed.
            </p>
          </div>
          <button
            onClick={() => retry.mutate()}
            disabled={retry.isPending || !failures?.total}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary disabled:opacity-50"
          >
            {retry.isPending ? "Retrying…" : "Retry CRM push"}
          </button>
        </div>

        {retry.data && (
          <p className="mt-2 text-xs text-muted-foreground">
            Retried {retry.data.retried} · pushed {retry.data.pushed} · still failing{" "}
            {retry.data.failed}
            {retry.data.lastError ? ` · ${retry.data.lastError}` : ""}
          </p>
        )}

        {!!failures?.rows?.length && (
          <ul className="mt-3 space-y-1 text-xs">
            {failures.rows.slice(0, 5).map((r: any) => (
              <li key={r.id} className="truncate rounded-lg bg-muted px-3 py-2">
                <span className="font-medium">{r.recipient_email}</span> ·{" "}
                <span className="text-destructive">{r.crm_error}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "pass") return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />;
  if (status === "fail") return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />;
  return <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />;
}
