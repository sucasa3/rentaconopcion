import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { HomeownerShell } from "@/components/homeowner-shell";
import {
  getMyRequestDetail,
  cancelMyRequest,
  homeownerConfirmComplete,
  getInvoiceSignedUrl,
} from "@/lib/service-requests.functions";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Phone,
  Mail,
  MapPin,
  FileText,
  XCircle,
  Loader2,
  Star,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/requests/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Service Request — SuCasa" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RequestDetail,
});

const STEPS = [
  { key: "open", label: "Submitted" },
  { key: "offered", label: "Matching pros" },
  { key: "claimed", label: "Claimed" },
  { key: "scheduled", label: "Scheduled" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
] as const;

function statusIndex(status: string, routing: string): number {
  const s = (status || "").toLowerCase();
  if (s === "completed") return 5;
  if (s === "in_progress") return 4;
  if (s === "scheduled") return 3;
  if (routing === "claimed" || s === "claimed") return 2;
  if (routing === "offered") return 1;
  return 0;
}

function RequestDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchDetail = useServerFn(getMyRequestDetail);
  const cancelFn = useServerFn(cancelMyRequest);
  const confirmFn = useServerFn(homeownerConfirmComplete);
  const signedFn = useServerFn(getInvoiceSignedUrl);

  const { data, isLoading, error } = useQuery({
    queryKey: ["request", id],
    queryFn: () => fetchDetail({ data: { id } }),
    refetchInterval: 20000,
  });

  const cancelMut = useMutation({
    mutationFn: (reason: string) => cancelFn({ data: { id, reason } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["request", id] }),
  });
  const confirmMut = useMutation({
    mutationFn: () => confirmFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["request", id] }),
  });

  const [cancelReason, setCancelReason] = useState("");

  if (isLoading) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading request…
        </div>
      </Shell>
    );
  }
  if (error || !data) {
    return (
      <Shell>
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          {(error as Error)?.message ?? "Request not found."}
        </div>
      </Shell>
    );
  }

  const { request: r, assignment } = data;
  const step = statusIndex(r.status, r.routing_status);
  const pro = (assignment?.pros as any) ?? null;
  const isTerminal = r.status === "completed" || r.status === "cancelled";

  const openInvoice = async () => {
    if (!r.invoice_path) return;
    const { url } = await signedFn({ data: { path: r.invoice_path } });
    window.open(url, "_blank", "noopener");
  };

  return (
    <Shell>
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => navigate({ to: "/dashboard" })}
          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
        </button>
      </div>

      <div className="rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Service request
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{r.category}</h1>
            {(r.city || r.zip) && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {[r.address, r.city, r.state, r.zip].filter(Boolean).join(", ")}
              </p>
            )}
            <p className="mt-0.5 text-xs text-muted-foreground">
              Submitted {new Date(r.created_at).toLocaleString()}
            </p>
          </div>
          <StatusBadge status={r.status} />
        </div>

        {/* Stepper */}
        {r.status !== "cancelled" && (
          <div className="mt-6 grid grid-cols-6 gap-1.5">
            {STEPS.map((s, i) => {
              const done = i <= step;
              const active = i === step;
              return (
                <div key={s.key} className="min-w-0">
                  <div
                    className={`h-1.5 rounded-full ${done ? "bg-primary" : "bg-secondary"} ${active ? "animate-pulse" : ""}`}
                  />
                  <p
                    className={`mt-1.5 truncate text-[10px] ${done ? "font-medium text-foreground" : "text-muted-foreground"}`}
                  >
                    {s.label}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {r.description && (
          <div className="mt-6 rounded-2xl border border-border bg-secondary/40 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              What you need
            </p>
            <p className="mt-1.5 text-sm">{r.description}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {r.timeline && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {r.timeline}
                </span>
              )}
              {(r.budget_min || r.budget_max) && (
                <span>
                  Budget ${r.budget_min ?? 0}–${r.budget_max ?? "?"}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Assigned pro card */}
      {pro ? (
        <div className="mt-4 rounded-3xl border border-border bg-card p-6 shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Your matched pro
          </p>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold tracking-tight">{pro.business_name}</p>
              <p className="text-xs text-muted-foreground">{pro.category}</p>
              {typeof pro.rating === "number" && (
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                  {pro.rating.toFixed(1)} · {pro.reviews_count} reviews
                </p>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              Claimed {new Date(assignment!.claimed_at).toLocaleDateString()}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {pro.phone && (
              <a
                href={`tel:${pro.phone}`}
                className="inline-flex items-center gap-1.5 rounded-full gradient-brand px-4 py-2 text-xs font-semibold text-white shadow-soft"
              >
                <Phone className="h-3.5 w-3.5" /> Call {pro.phone}
              </a>
            )}
            {pro.email && (
              <a
                href={`mailto:${pro.email}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-semibold hover:bg-secondary"
              >
                <Mail className="h-3.5 w-3.5" /> Email
              </a>
            )}
          </div>

          {r.scheduled_at && (
            <p className="mt-4 text-sm">
              <span className="text-muted-foreground">Scheduled for </span>
              <span className="font-semibold">
                {new Date(r.scheduled_at).toLocaleString()}
              </span>
            </p>
          )}
          {r.invoice_path && (
            <button
              onClick={openInvoice}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-semibold hover:bg-secondary"
            >
              <FileText className="h-3.5 w-3.5" /> View invoice
              {typeof r.invoice_cents === "number" &&
                ` · $${(r.invoice_cents / 100).toLocaleString()}`}
            </button>
          )}
        </div>
      ) : r.status !== "cancelled" && r.source === "homeowner" ? (
        <div className="mt-4 rounded-3xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-soft">
          <Clock className="mr-1 inline h-4 w-4" />
          We're notifying local pros. First pro to claim within 25 minutes wins the lead —
          you'll see their contact info here.
        </div>
      ) : null}

      {/* Actions */}
      {!isTerminal && (
        <div className="mt-4 rounded-3xl border border-border bg-card p-6 shadow-soft">
          <p className="text-sm font-semibold">Actions</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {pro && r.status !== "completed" && (
              <button
                onClick={() => confirmMut.mutate()}
                disabled={confirmMut.isPending}
                className="inline-flex items-center gap-1.5 rounded-full gradient-growth px-4 py-2 text-xs font-semibold text-white shadow-soft disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {confirmMut.isPending ? "Confirming…" : "Confirm job complete"}
              </button>
            )}
            <details className="rounded-2xl border border-border">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
                Cancel request
              </summary>
              <div className="space-y-2 border-t border-border p-3">
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                  placeholder="Reason (optional)"
                />
                <button
                  onClick={() => cancelMut.mutate(cancelReason)}
                  disabled={cancelMut.isPending}
                  className="inline-flex items-center gap-1.5 rounded-full bg-destructive px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  {cancelMut.isPending ? "Cancelling…" : "Cancel this request"}
                </button>
              </div>
            </details>
          </div>
          {(cancelMut.error || confirmMut.error) && (
            <p className="mt-2 text-xs text-destructive">
              {((cancelMut.error ?? confirmMut.error) as Error).message}
            </p>
          )}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <HomeownerShell>
      <main className="px-4 py-6 sm:px-5 sm:py-8">
        <div className="mx-auto max-w-2xl">{children}</div>
      </main>
    </HomeownerShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  const map: Record<string, { label: string; cls: string }> = {
    open: { label: "Open", cls: "bg-primary/10 text-primary" },
    claimed: { label: "Claimed", cls: "bg-primary/10 text-primary" },
    scheduled: { label: "Scheduled", cls: "bg-blue-500/10 text-blue-600" },
    in_progress: { label: "In progress", cls: "bg-amber-500/10 text-amber-600" },
    completed: { label: "Completed", cls: "bg-growth/15 text-growth" },
    cancelled: { label: "Cancelled", cls: "bg-destructive/10 text-destructive" },
  };
  const m = map[s] ?? map.open;
  return (
    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${m.cls}`}>
      {m.label}
    </span>
  );
}
