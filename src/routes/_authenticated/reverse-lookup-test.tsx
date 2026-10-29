import { useState } from "react";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { PhoneSearch, CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react";
import { isPreviewHost } from "@/lib/stripe-mode";
import {
  approveReverseLookupProperty,
  listReverseLookupContacts,
  listReverseLookupHistory,
  runContactReverseLookup,
} from "@/lib/batchdata-reverse.functions";

export const Route = createFileRoute("/_authenticated/reverse-lookup-test")({
  head: () => ({
    meta: [
      { title: "Reverse Lookup Test Lab — SuCasa" },
      {
        name: "description",
        content: "Preview-only reverse lookup testing: discover a possible homeowner and property association from a contact's phone or email.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Reverse Lookup Test Lab — SuCasa" },
      { property: "og:description", content: "Preview-only reverse lookup testing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PreviewGate,
});

const STATUS_STYLE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  matched: { label: "Matched", variant: "default" },
  needs_review: { label: "Needs review", variant: "secondary" },
  no_match: { label: "No match", variant: "outline" },
  invalid_input: { label: "Invalid input", variant: "destructive" },
  provider_error: { label: "Provider error", variant: "destructive" },
  pending: { label: "Running…", variant: "outline" },
};

function ReverseLookupLab() {
  const queryClient = useQueryClient();
  const listContacts = useServerFn(listReverseLookupContacts);
  const listHistory = useServerFn(listReverseLookupHistory);
  const runLookup = useServerFn(runContactReverseLookup);
  const approve = useServerFn(approveReverseLookupProperty);
  const [busyClient, setBusyClient] = useState<string | null>(null);

  const contacts = useQuery({
    queryKey: ["reverse-contacts"],
    queryFn: () => listContacts(),
  });
  const history = useQuery({
    queryKey: ["reverse-history"],
    queryFn: () => listHistory(),
  });

  const runMutation = useMutation({
    mutationFn: (clientId: string) => runLookup({ data: { clientId } }),
    onSuccess: (r: any) => {
      toast.success(r.cached ? "Reused the existing result — no new charge" : `Lookup complete: ${r.status}`);
      queryClient.invalidateQueries({ queryKey: ["reverse-history"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Lookup failed"),
    onSettled: () => setBusyClient(null),
  });

  const approveMutation = useMutation({
    mutationFn: (opts: { lookupId: string; personIndex: number }) => approve({ data: opts }),
    onSuccess: (r: any) => {
      toast.success(
        r.addressUpdated
          ? "Property approved — address added to the contact and queued for records"
          : "Property approved — queued for records (existing address kept)",
      );
      queryClient.invalidateQueries({ queryKey: ["reverse-history"] });
      queryClient.invalidateQueries({ queryKey: ["reverse-contacts"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not hand off"),
  });

  const usage = history.data?.usage;

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-5 px-4 py-6">
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <PhoneSearch className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold tracking-tight">Reverse Lookup Test Lab</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Preview only. Start from a contact's phone or email to discover a possible homeowner and property
            association. Property owners only, one contact at a time, results held for your review.
          </p>
        </header>

        {usage && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Reverse wallet — estimated usage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>
                <span className="font-medium">${(usage.usedCents / 100).toFixed(2)}</span> estimated this month
                across {usage.lookups} lookup{usage.lookups === 1 ? "" : "s"} · testing limit $
                {(usage.capCents / 100).toFixed(2)}/month
              </p>
              <p className="text-xs text-muted-foreground">
                Planning estimate only — not provider-confirmed. Testing wallet started at approximately $
                {(usage.walletStartCents / 100).toFixed(0)} (unverified). Property-lookup subscription is tracked
                separately.
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Your contacts with a phone or email</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {contacts.isPending && <p className="text-xs text-muted-foreground">Loading contacts…</p>}
            {!contacts.isPending && (contacts.data?.contacts ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">
                No contacts with a phone or email in your workspace yet.
              </p>
            )}
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {(contacts.data?.contacts ?? []).map((c: any) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-xl border bg-background px-3 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{c.name ?? "Unnamed"}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                      {c.address ? ` · ${c.address}` : ""}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyClient === c.id}
                    onClick={() => {
                      setBusyClient(c.id);
                      runMutation.mutate(c.id);
                    }}
                  >
                    {busyClient === c.id ? "Running…" : "Reverse lookup"}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {history.isPending && <p className="text-xs text-muted-foreground">Loading…</p>}
            {!history.isPending && (history.data?.lookups ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">No reverse lookups yet.</p>
            )}
            {(history.data?.lookups ?? []).map((l: any) => {
              const style = STATUS_STYLE[l.status] ?? STATUS_STYLE.pending;
              const persons = (l.persons as any[]) ?? [];
              return (
                <div key={l.id} className="space-y-2 rounded-xl border bg-background p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="font-medium">
                        {[l.input_phone, l.input_email].filter(Boolean).join(" · ") || "Lookup"}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {new Date(l.created_at).toLocaleString()} · est. $
                        {((l.estimated_cost_cents ?? 0) / 100).toFixed(2)} ({l.billing_basis})
                      </span>
                    </span>
                    <div className="flex items-center gap-1">
                      {l.multi_person_flag && (
                        <Badge variant="secondary">
                          <AlertTriangle className="mr-1 h-3 w-3" /> Multiple people
                        </Badge>
                      )}
                      <Badge variant={style.variant}>{style.label}</Badge>
                    </div>
                  </div>

                  {l.error_message && (
                    <p className="text-xs text-muted-foreground">{l.error_message}</p>
                  )}

                  {persons.map((p: any, idx: number) => (
                    <div key={idx} className="rounded-lg border bg-muted/40 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">
                            {p.fullName ?? "Unknown name"}
                            {p.propertyOwner === true && (
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                property owner at linked address
                              </span>
                            )}
                          </p>
                          {p.property?.fullAddress && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              Possible property: {p.property.fullAddress}
                            </p>
                          )}
                          {p.property?.owners?.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Owners of record: {p.property.owners.join(", ")}
                            </p>
                          )}
                          {(p.addresses ?? []).length > 1 && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {(p.addresses as any[]).length} associated addresses preserved
                            </p>
                          )}
                          {l.name_evidence === "mismatch" && (
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-700">
                              <AlertTriangle className="h-3 w-3" /> Name does not match the contact
                            </p>
                          )}
                        </div>
                        {l.handed_off_at ? (
                          <Badge variant="outline">
                            <CheckCircle2 className="mr-1 h-3 w-3" /> Handed off
                          </Badge>
                        ) : (
                          (l.status === "matched" || l.status === "needs_review") &&
                          p.property?.fullAddress && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={approveMutation.isPending}
                              onClick={() =>
                                approveMutation.mutate({ lookupId: l.id, personIndex: idx })
                              }
                            >
                              Approve &amp; queue for records
                            </Button>
                          )
                        )}
                      </div>
                    </div>
                  ))}

                  {l.status === "no_match" && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <XCircle className="h-3 w-3" /> No property owner matched — no charge per the documented
                      billing model.
                    </p>
                  )}
                  {l.status === "pending" && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" /> In progress…
                    </p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          A provider match is a possible association, not verified ownership. Approving a property only queues it
          for the existing records process — a paid property lookup still requires the separate release step. No
          homeowner account, consent, outreach, or sharing is created here.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}

function PreviewGate() {
  return (
    <ClientOnly
      fallback={
        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          <main className="flex-1 px-5 py-16 text-center text-sm text-muted-foreground">Loading…</main>
          <SiteFooter />
        </div>
      }
    >
      {typeof window !== "undefined" && isPreviewHost(window.location.host) ? (
        <ReverseLookupLab />
      ) : (
        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          <main className="flex-1 px-5 py-16 text-center text-sm text-muted-foreground">
            The reverse lookup test lab is available in preview only.
          </main>
          <SiteFooter />
        </div>
      )}
    </ClientOnly>
  );
}
