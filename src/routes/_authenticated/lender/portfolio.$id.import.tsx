import { useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { addPortfolioClient, ingestPortfolioCsv } from "@/lib/lender.functions";
import { Upload, UserPlus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/lender/portfolio/$id/import")({
  component: PortfolioImport,
});

const EMPTY = {
  fullName: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  email: "",
  phone: "",
  loanAmount: "",
  rate: "",
  closeDate: "",
};

function PortfolioImport() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const ingestFn = useServerFn(ingestPortfolioCsv);
  const addFn = useServerFn(addPortfolioClient);
  const [form, setForm] = useState({ ...EMPTY });

  const ingest = useMutation({
    mutationFn: (csv: string) => ingestFn({ data: { portfolioId: id, csv } }),
    onSuccess: (r: any) => {
      toast.success(`Imported ${r.inserted} clients`);
      qc.invalidateQueries({ queryKey: ["lender-portfolio", id] });
      navigate({ to: "/lender/portfolio/$id", params: { id } });
    },
    onError: (e: any) => toast.error(e.message),
  });

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
          loanAmount: form.loanAmount ? Number(form.loanAmount) : null,
          rate: form.rate ? Number(form.rate) : null,
          closeDate: form.closeDate || null,
          notes: null,
        },
      }),
    onSuccess: () => {
      toast.success("Client added");
      setForm({ ...EMPTY });
      qc.invalidateQueries({ queryKey: ["lender-portfolio", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  async function handleFile(f: File) {
    const text = await f.text();
    ingest.mutate(text);
    if (fileRef.current) fileRef.current.value = "";
  }

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Add one client</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Name and address are required — everything else fills in from property records.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Field label="Full name" value={form.fullName} onChange={set("fullName")} />
          <Field label="Address" value={form.address} onChange={set("address")} />
          <Field label="City" value={form.city} onChange={set("city")} />
          <Field label="State" value={form.state} onChange={set("state")} />
          <Field label="ZIP" value={form.zip} onChange={set("zip")} />
          <Field label="Email" value={form.email} onChange={set("email")} />
          <Field label="Phone" value={form.phone} onChange={set("phone")} />
          <Field label="Loan at close ($)" value={form.loanAmount} onChange={set("loanAmount")} />
          <Field label="Rate (%)" value={form.rate} onChange={set("rate")} />
          <Field label="Close date" value={form.closeDate} onChange={set("closeDate")} placeholder="YYYY-MM-DD" />
        </div>
        <button
          disabled={!form.fullName || !form.address || add.isPending}
          onClick={() => add.mutate()}
          className="mt-4 inline-flex items-center gap-1 rounded-full gradient-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          <UserPlus className="h-3 w-3" /> {add.isPending ? "Adding…" : "Add client"}
        </button>
      </div>

      <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Import a list</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          CSV columns: <code>full_name, address, city, state, zip, email, loan_balance, rate, note</code>.
          Only <code>full_name</code> and <code>address</code> are required.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={ingest.isPending}
          className="mt-4 inline-flex items-center gap-1 rounded-full border border-border px-5 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-60"
        >
          <Upload className="h-3 w-3" /> {ingest.isPending ? "Importing…" : "Choose CSV file"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-xs text-muted-foreground">
      {label}
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="mt-1 w-full rounded-full border border-border bg-background px-3 py-2 text-sm text-foreground"
      />
    </label>
  );
}
