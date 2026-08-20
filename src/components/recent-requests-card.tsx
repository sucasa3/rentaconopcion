import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PenLine } from "lucide-react";

import { listMyRequests } from "@/lib/service-requests.functions";
import { LogExternalServiceDialog } from "@/components/log-external-service-dialog";
import type { RecentRequest } from "@/lib/mock-data";

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    Matched: "bg-primary/10 text-primary",
    "In Progress": "bg-accent text-accent-foreground",
    Completed: "bg-growth/15 text-growth",
  };
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium ${
        map[status] ?? "bg-secondary text-secondary-foreground"
      }`}
    >
      {status}
    </span>
  );
}

/** Work done on the home — through SuCasa or logged from outside. */
export function RecentRequestsCard() {
  const [logOpen, setLogOpen] = useState(false);
  const [requests, setRequests] = useState<RecentRequest[]>([]);

  const listReqFn = useServerFn(listMyRequests);
  const { data: dbRequests } = useQuery({
    queryKey: ["my-requests"],
    queryFn: () => listReqFn(),
  });

  useEffect(() => {
    if (!dbRequests) return;
    setRequests(
      (dbRequests as any[]).map((r) => ({
        id: r.id,
        category: r.category,
        status: r.status,
        when: new Date(r.created_at).toLocaleDateString(),
        source: r.source === "external" ? "external" : "sucasa",
        vendorName: r.vendor_name ?? undefined,
        amountCents: r.amount_cents ?? undefined,
      })),
    );
  }, [dbRequests]);

  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Work on your home</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLogOpen(true)}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
          >
            <PenLine className="h-3 w-3" /> Log outside service
          </button>
          <Link to="/request" className="text-xs font-medium text-primary">
            New request
          </Link>
        </div>
      </div>

      <div className="mt-4 divide-y divide-border rounded-2xl border border-border">
        {requests.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">
            No requests yet. Start one from your to-do list, or log work you had done elsewhere.
          </p>
        ) : (
          requests.map((r) => (
            <Link
              key={r.id}
              to="/requests/$id"
              params={{ id: r.id }}
              className="flex items-center justify-between gap-3 p-4 transition hover:bg-secondary/60"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {r.category}{" "}
                  <span className="text-muted-foreground">· {r.id.slice(0, 8)}</span>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.vendorName ? `${r.vendorName} · ` : ""}
                  {r.when}
                  {typeof r.amountCents === "number"
                    ? ` · $${(r.amountCents / 100).toLocaleString()}`
                    : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {r.source === "external" && (
                  <span className="rounded-full border border-border bg-secondary px-2 py-1 text-[10px] font-medium text-muted-foreground">
                    External
                  </span>
                )}
                <StatusPill status={r.status} />
              </div>
            </Link>
          ))
        )}
      </div>

      <LogExternalServiceDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        onLogged={(row) => {
          setRequests((prev) => [
            {
              id: row.id,
              category: row.category,
              status: row.status,
              when: "Just now",
              source: "external",
              vendorName: row.vendorName ?? undefined,
              amountCents: row.amountCents ?? undefined,
            },
            ...prev,
          ]);
        }}
      />
    </div>
  );
}
