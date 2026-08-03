import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, CreditCard } from "lucide-react";
import { createProAccount, getMyProAccount, updateMyProProfile } from "@/lib/pro-signup.functions";
import { SERVICE_CATEGORIES } from "@/lib/mock-data";
import { ProLeadInbox } from "@/components/pro-lead-inbox";

const inputCls =
  "w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

const METROS = ["Atlanta, GA", "Austin, TX", "Dallas, TX", "Houston, TX", "Miami, FL", "Orlando, FL", "Charlotte, NC", "Nashville, TN"];

export function ProAccountPanel() {
  const qc = useQueryClient();
  const load = useServerFn(getMyProAccount);
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-pro-account"],
    queryFn: () => load(),
    retry: false,
  });

  if (isLoading) return <div className="rounded-3xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading your pro account…</div>;

  if (error) {
    return (
      <div className="rounded-3xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Please <a href="/auth" className="font-semibold text-primary">sign in</a> to access your pro account.
        </p>
      </div>
    );
  }

  if (!data?.pro) return <ProSignupForm onDone={() => qc.invalidateQueries({ queryKey: ["my-pro-account"] })} />;

  const pro = data.pro;
  if (pro.subscription_status !== "active") return <MembershipPending pro={pro} />;

  return (
    <div className="space-y-6">
      <MembershipCard pro={pro} onToggle={() => qc.invalidateQueries({ queryKey: ["my-pro-account"] })} />
      <ProLeadInbox />
    </div>
  );
}

type Pro = {
  id: string;
  business_name: string;
  category: string;
  subscription_status: string;
  monthly_price_cents: number;
  is_founding_partner: boolean;
  accepting_leads: boolean;
};

function MembershipPending({ pro }: { pro: Pro }) {
  const label =
    pro.subscription_status === "past_due"
      ? "Payment past due"
      : pro.subscription_status === "canceled"
        ? "Membership canceled"
        : "Awaiting payment";
  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
        <Clock className="h-3.5 w-3.5" /> {label}
      </div>
      <h2 className="mt-4 text-xl font-semibold tracking-tight">{pro.business_name}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Your pro profile is created. Leads start routing to you as soon as your membership payment clears.
      </p>
      <div className="mt-4 rounded-2xl bg-muted px-4 py-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Monthly membership</span>
          <span className="font-semibold">
            ${(pro.monthly_price_cents / 100).toFixed(0)}/mo
            {pro.is_founding_partner && <span className="ml-2 text-xs text-primary">Founding partner</span>}
          </span>
        </div>
      </div>
      <p className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground">
        <CreditCard className="h-3.5 w-3.5" /> A SuCasa partner specialist will send your secure payment link. This page updates automatically once billing confirms.
      </p>
    </div>
  );
}

function MembershipCard({ pro, onToggle }: { pro: Pro; onToggle: () => void }) {
  const update = useServerFn(updateMyProProfile);
  const mut = useMutation({
    mutationFn: (accepting_leads: boolean) => update({ data: { accepting_leads } }),
    onSuccess: onToggle,
  });
  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <CheckCircle2 className="h-3.5 w-3.5" /> Membership active
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-tight">{pro.business_name}</h2>
          <p className="text-sm text-muted-foreground">
            {pro.category} · ${(pro.monthly_price_cents / 100).toFixed(0)}/mo
            {pro.is_founding_partner ? " · Founding partner" : ""}
          </p>
        </div>
        <button
          onClick={() => mut.mutate(!pro.accepting_leads)}
          disabled={mut.isPending}
          className="rounded-full border border-border px-4 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50"
        >
          {pro.accepting_leads ? "Pause new leads" : "Resume leads"}
        </button>
      </div>
    </div>
  );
}

function ProSignupForm({ onDone }: { onDone: () => void }) {
  const create = useServerFn(createProAccount);
  const [form, setForm] = useState({
    business_name: "",
    category: SERVICE_CATEGORIES[0].name,
    phone: "",
    email: "",
    language: "en" as "en" | "es",
  });
  const [metros, setMetros] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () =>
      create({
        data: {
          ...form,
          coverage: metros.map((m) => ({ category: form.category, metro: m })),
        },
      }),
    onSuccess: onDone,
    onError: (e) => setErr((e as Error).message),
  });

  const toggleMetro = (m: string) => setMetros((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-8">
      <h2 className="text-xl font-semibold tracking-tight">Become a SuCasa Pro</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Founding partners pay $297/mo (first 3 partners), then $397/mo. Leads route round-robin with a 25-minute claim window.
      </p>

      <div className="mt-6 space-y-4">
        <Field label="Business name">
          <input className={inputCls} value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} placeholder="Sunrise HVAC Co." />
        </Field>
        <Field label="Primary category">
          <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {SERVICE_CATEGORIES.map((c) => (
              <option key={c.slug} value={c.name}>{c.name}</option>
            ))}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone">
            <input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(555) 123-4567" />
          </Field>
          <Field label="Email">
            <input type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" />
          </Field>
        </div>
        <Field label="Preferred language">
          <div className="grid grid-cols-2 gap-2">
            {(["en", "es"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setForm({ ...form, language: l })}
                className={`rounded-2xl border px-4 py-3 text-sm transition ${form.language === l ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-secondary"}`}
              >
                {l === "en" ? "English" : "Español"}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Service areas (metros)">
          <div className="flex flex-wrap gap-2">
            {METROS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => toggleMetro(m)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${metros.includes(m) ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-secondary"}`}
              >
                {m}
              </button>
            ))}
          </div>
        </Field>

        {err && <p className="text-sm text-destructive">{err}</p>}

        <button
          onClick={() => {
            setErr(null);
            if (!form.business_name || !form.phone || !form.email || metros.length === 0) {
              setErr("Add your business name, phone, email and at least one metro.");
              return;
            }
            mut.mutate();
          }}
          disabled={mut.isPending}
          className="w-full rounded-full gradient-brand px-6 py-3 text-sm font-semibold text-white shadow-soft disabled:opacity-60"
        >
          {mut.isPending ? "Creating…" : "Create pro account"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
