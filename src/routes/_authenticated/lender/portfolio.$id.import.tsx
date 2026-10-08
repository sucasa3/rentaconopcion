import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { addPortfolioClient, ingestPortfolioCsv } from "@/lib/lender.functions";
import { UserPlus } from "lucide-react";
import { BulkClientUpload } from "@/components/bulk-client-upload";
import { recordAuthenticatedAgentEvent } from "@/lib/agent-funnel.functions";
import { useLanguage } from "@/lib/i18n";

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
  const ingestFn = useServerFn(ingestPortfolioCsv);
  const addFn = useServerFn(addPortfolioClient);
  const [form, setForm] = useState({ ...EMPTY });
  const track = useServerFn(recordAuthenticatedAgentEvent);
  const { language } = useLanguage();
  const L = (en: string, es: string) => (language === "es" ? es : en);

  const ingest = useMutation({
    mutationFn: (csv: string) => {
      void track({ data: { action: "lender_full_upload_started" } }).catch(() => undefined);
      return ingestFn({ data: { portfolioId: id, csv } });
    },
    onSuccess: (r: any) => {
      void track({ data: { action: "lender_full_upload_completed" } }).catch(() => undefined);
      toast.success(
        r.existing
          ? L(`Imported ${r.inserted} clients · ${r.existing} already in this book were skipped`, `Se importaron ${r.inserted} clientes · se omitieron ${r.existing} que ya estaban en esta cartera`)
          : L(`Imported ${r.inserted} clients`, `Se importaron ${r.inserted} clientes`),
      );
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
      toast.success(L("Client added", "Cliente agregado"));
      setForm({ ...EMPTY });
      qc.invalidateQueries({ queryKey: ["lender-portfolio", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" />
          <h2 id="one" className="scroll-mt-20 text-base font-semibold">{L("Add one client", "Agregar un cliente")}</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {L("Name and address are required — everything else fills in from property records.", "El nombre y la dirección son obligatorios — lo demás se completa con los registros de la propiedad.")}
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Field label={L("Full name", "Nombre completo")} value={form.fullName} onChange={set("fullName")} />
          <Field label={L("Address", "Dirección")} value={form.address} onChange={set("address")} />
          <Field label={L("City", "Ciudad")} value={form.city} onChange={set("city")} />
          <Field label={L("State", "Estado")} value={form.state} onChange={set("state")} />
          <Field label={L("ZIP", "Código postal")} value={form.zip} onChange={set("zip")} />
          <Field label={L("Email", "Correo")} value={form.email} onChange={set("email")} />
          <Field label={L("Phone", "Teléfono")} value={form.phone} onChange={set("phone")} />
          <Field label={L("Loan at close ($)", "Préstamo al cierre ($)")} value={form.loanAmount} onChange={set("loanAmount")} />
          <Field label={L("Rate (%)", "Tasa (%)")} value={form.rate} onChange={set("rate")} />
          <Field label={L("Close date", "Fecha de cierre")} value={form.closeDate} onChange={set("closeDate")} placeholder={L("YYYY-MM-DD", "AAAA-MM-DD")} />
        </div>
        <button
          disabled={!form.fullName || !form.address || add.isPending}
          onClick={() => add.mutate()}
          className="mt-4 inline-flex items-center gap-1 rounded-full gradient-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          <UserPlus className="h-3 w-3" /> {add.isPending ? L("Adding…", "Agregando…") : L("Add client", "Agregar cliente")}
        </button>
      </div>

      <div id="csv" className="scroll-mt-20" />
      <BulkClientUpload onCsv={(csv) => ingest.mutate(csv)} busy={ingest.isPending} />
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
