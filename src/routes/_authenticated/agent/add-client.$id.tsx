import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, UserPlus } from "lucide-react";
import { BusinessShell } from "@/components/business-shell";
import { addAgentPortfolioClient, ingestAgentPortfolioCsv } from "@/lib/agent.functions";
import { BulkClientUpload } from "@/components/bulk-client-upload";
import { UploadResultsPanel } from "@/components/upload-results-panel";
import { UploadResultsHistory } from "@/components/upload-results-history";

export const Route = createFileRoute("/_authenticated/agent/add-client/$id")({
  head: () => ({
    meta: [
      { title: "Add a homeowner — SuCasa Agent" },
      { name: "description", content: "Add homeowners or review retained contacts and upload results in your SuCasa sphere." },
      { property: "og:title", content: "Add a homeowner — SuCasa Agent" },
      { property: "og:description", content: "Manage your personal homeowner uploads and review retained contacts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AddAgentClient,
});

const EMPTY = {
  fullName: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  email: "",
  phone: "",
  notes: "",
};

function AddAgentClient() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const addFn = useServerFn(addAgentPortfolioClient);
  const ingestFn = useServerFn(ingestAgentPortfolioCsv);
  const [form, setForm] = useState({ ...EMPTY });
  const [batchId, setBatchId] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          portfolioId: id,
          fullName: form.fullName,
          address: form.address,
          city: form.city || null,
          state: form.state || null,
          zip: form.zip || null,
          email: form.email || null,
          phone: form.phone || null,
          notes: form.notes || null,
        },
      }),
    onSuccess: (r: any) => {
      const st = r?.enrichment?.status as string | undefined;
      const description =
        st === "enriched"
          ? "Property records were found and added to their profile."
          : st === "cached"
            ? "Property records were already on file for this address."
            : st === "no_match"
              ? "No property record matched that address — please double-check it."
              : st === "failed"
                ? "The records lookup failed; it will retry automatically."
                : "Property records are being gathered now.";
      toast.success("Homeowner added", { description });
      setForm({ ...EMPTY });
      qc.invalidateQueries({ queryKey: ["agent-portfolio", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const ingest = useMutation({
    mutationFn: (csv: string) => ingestFn({ data: { portfolioId: id, csv } }),
    onSuccess: (r: any) => {
      if (r?.mixed?.batchId) {
        qc.invalidateQueries({ queryKey: ["agent-portfolio", id] });
        qc.invalidateQueries({ queryKey: ["agent-credits"] });
        setBatchId(r.mixed.batchId);
        return;
      }
      toast.success(`Imported ${r.inserted} homeowner${r.inserted === 1 ? "" : "s"}`, {
        description:
          r.skipped > 0
            ? `${r.skipped} held back — you're out of homeowner credits. Earn more or unlock extra capacity.`
            : undefined,
      });
      qc.invalidateQueries({ queryKey: ["agent-portfolio", id] });
      qc.invalidateQueries({ queryKey: ["agent-credits"] });
      if (r.inserted > 0) navigate({ to: "/agent/reveal/$id", params: { id } });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <BusinessShell kind="agent" bookId={id}>
      <main className="px-4 py-6 sm:px-5 sm:py-8">
        <div className="mx-auto max-w-2xl space-y-5">
          <Link
            to="/agent/portfolio/$id"
            params={{ id }}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary"
          >
            <ArrowLeft className="h-3 w-3" /> Back to sphere
          </Link>

          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Add a homeowner</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Add one below, or upload an Excel/CSV list to add many at once.
            </p>
          </div>

          <div className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-6">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Full name" value={form.fullName} onChange={set("fullName")} />
              <Field label="Address" value={form.address} onChange={set("address")} />
              <Field label="City" value={form.city} onChange={set("city")} />
              <Field label="State" value={form.state} onChange={set("state")} />
              <Field label="ZIP" value={form.zip} onChange={set("zip")} />
              <Field label="Email" value={form.email} onChange={set("email")} />
              <Field label="Phone" value={form.phone} onChange={set("phone")} />
              <Field label="Note" value={form.notes} onChange={set("notes")} />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                disabled={!form.fullName || !form.address || add.isPending}
                onClick={() => add.mutate()}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                <UserPlus className="h-4 w-4" /> {add.isPending ? "Adding…" : "Add homeowner"}
              </button>
              <button
                onClick={() => navigate({ to: "/agent/portfolio/$id", params: { id } })}
                className="rounded-full border border-border px-5 py-2.5 text-sm font-medium hover:bg-secondary"
              >
                Done
              </button>
            </div>
          </div>

          <div id="upload" className="scroll-mt-20" />
          <BulkClientUpload
            onCsv={(csv) => ingest.mutate(csv)}
            busy={ingest.isPending}
            title="Add many at once"
          />
          <UploadResultsHistory bookId={id} onSelect={setBatchId} />
          {batchId && <UploadResultsPanel batchId={batchId} onDone={() => navigate({ to: "/agent/reveal/$id", params: { id } })} />}
        </div>
      </main>
    </BusinessShell>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="block text-xs text-muted-foreground">
      {label}
      <input
        value={value}
        onChange={onChange}
        className="mt-1 w-full rounded-full border border-border bg-background px-3 py-2 text-sm text-foreground"
      />
    </label>
  );
}
