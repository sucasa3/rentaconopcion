import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { addPortfolioClient, ingestPortfolioCsv } from "@/lib/lender.functions";
import { UserPlus } from "lucide-react";
import { BulkClientUpload } from "@/components/bulk-client-upload";
import { recordAuthenticatedAgentEvent } from "@/lib/agent-funnel.functions";
import { useLanguage } from "@/lib/i18n";
import { getBusinessOverview } from "@/lib/business.functions";
import { Button } from "@/components/ui/button";
import { UploadResultsPanel } from "@/components/upload-results-panel";
import { UploadResultsHistory } from "@/components/upload-results-history";
import { singleContactCsv, singleContactMode } from "@/lib/single-contact";

export const Route = createFileRoute("/_authenticated/lender/portfolio/$id/import")({
  head: () => ({ meta: [
    { title: "Add homeowners to your book — SuCasa Lender" },
    { name: "description", content: "Upload or add homeowners to your personal SuCasa client book." },
    { property: "og:title", content: "Add homeowners to your book — SuCasa Lender" },
    { property: "og:description", content: "Add your own clients before explicitly assigning them to your branch team." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
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
  const overviewFn = useServerFn(getBusinessOverview);
  const { data: overview } = useQuery({ queryKey: ["business-overview", "lender"], queryFn: () => overviewFn({ data: { orgType: "lender" } }) });
  const [form, setForm] = useState({ ...EMPTY });
  const [batchId, setBatchId] = useState<string | null>(null);
  const track = useServerFn(recordAuthenticatedAgentEvent);
  const { language } = useLanguage();
  const L = (en: string, es: string) => (language === "es" ? es : en);

  const ingest = useMutation({
    mutationFn: (v: { csv: string; single?: boolean }) => {
      if (!v.single) void track({ data: { action: "lender_full_upload_started" } }).catch(() => undefined);
      return ingestFn({ data: { portfolioId: id, csv: v.csv } });
    },
    onSuccess: (r: any, v) => {
      if (!v.single) void track({ data: { action: "lender_full_upload_completed" } }).catch(() => undefined);
      if (r?.mixed?.batchId) {
        qc.invalidateQueries({ queryKey: ["lender-portfolio", id] });
        setBatchId(r.mixed.batchId);
        if (v.single) { toast.success(L("Contact saved", "Contacto guardado"), { description: L("Saved as a contact only — see results below.", "Guardado solo como contacto — mira los resultados abajo.") }); setForm({ ...EMPTY }); }
        return;
      }
      if (v.single) { toast.error(L("Contacts without an address aren't available on your account yet. Please add an address.", "Los contactos sin dirección aún no están disponibles en tu cuenta. Agrega una dirección.")); return; }
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

  const mode = singleContactMode(form);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  if (!overview) return <p className="text-sm text-muted-foreground">{L("Loading your book…", "Cargando tu cartera…")}</p>;
  if (overview.personalBookId !== id) return <div className="space-y-3">
    <p className="text-sm">{L("New homeowners belong to your own book. You can assign them to your team afterward.", "Los nuevos propietarios pertenecen a tu propia cartera. Después puedes asignarlos a tu equipo.")}</p>
    {overview.personalBookId && <Button asChild><Link to="/lender/portfolio/$id/import" params={{ id: overview.personalBookId }}>{L("Add to my book", "Agregar a mi cartera")}</Link></Button>}
  </div>;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" />
          <h2 id="one" className="scroll-mt-20 text-base font-semibold">{L("Add one client", "Agregar un cliente")}</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {L("Required: full name, plus an address, phone or email. With an address, the rest fills in from property records.", "Obligatorio: nombre completo, más una dirección, teléfono o correo. Con dirección, lo demás se completa con los registros de la propiedad.")}
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
        {mode === "contact_only" && (
          <p className="mt-3 text-xs text-muted-foreground">{L("No address — this will be saved as a contact only. It won't use a Home Profile or run any search; you can approve an owner search below.", "Sin dirección — se guardará solo como contacto. No usa un perfil de hogar ni hace búsquedas; puedes aprobar una búsqueda de propietario abajo.")}</p>
        )}
        {mode === "invalid" && form.fullName.trim() && (form.phone || form.email) && (
          <p className="mt-3 text-xs text-destructive">{L("Enter a valid 10-digit phone or email, or add an address.", "Ingresa un teléfono de 10 dígitos o un correo válido, o agrega una dirección.")}</p>
        )}
        <button
          disabled={mode === "invalid" || add.isPending || ingest.isPending}
          onClick={() => { if (mode === "address") add.mutate(); else if (mode === "contact_only") ingest.mutate({ csv: singleContactCsv(form), single: true }); }}
          className="mt-4 inline-flex items-center gap-1 rounded-full gradient-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          <UserPlus className="h-3 w-3" /> {add.isPending || ingest.isPending ? L("Adding…", "Agregando…") : mode === "contact_only" ? L("Save contact", "Guardar contacto") : L("Add client", "Agregar cliente")}
        </button>
      </div>

      <div id="csv" className="scroll-mt-20" />
      <BulkClientUpload onCsv={(csv) => ingest.mutate({ csv })} busy={ingest.isPending} />
      <UploadResultsHistory bookId={id} onSelect={setBatchId} />
      {batchId && <UploadResultsPanel batchId={batchId} onDone={() => navigate({ to: "/lender/portfolio/$id", params: { id } })} />}
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
