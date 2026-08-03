import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getPartnerOverview,
  upsertPartner,
  setPartnerActive,
  deletePartner,
} from "@/lib/partners.functions";
import { Network, Plus, Trash2 } from "lucide-react";

type PartnerForm = {
  name: string;
  endpoint_url: string;
  auth_type: "bearer" | "header" | "none";
  secret_name: string;
  categories: string;
  states: string;
  metros: string;
  priority: string;
  payout_notes: string;
};

const EMPTY: PartnerForm = {
  name: "",
  endpoint_url: "",
  auth_type: "bearer",
  secret_name: "",
  categories: "",
  states: "",
  metros: "",
  priority: "100",
  payout_notes: "",
};

const list = (s: string) =>
  s.split(",").map((x) => x.trim()).filter(Boolean);

export function AdminPartnerPanel() {
  const overview = useServerFn(getPartnerOverview);
  const save = useServerFn(upsertPartner);
  const toggle = useServerFn(setPartnerActive);
  const remove = useServerFn(deletePartner);
  const qc = useQueryClient();
  const [form, setForm] = useState<PartnerForm>(EMPTY);
  const [open, setOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["partner-network"],
    queryFn: () => overview(),
    refetchInterval: 30000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["partner-network"] });

  const saveMut = useMutation({
    mutationFn: () =>
      save({
        data: {
          name: form.name,
          endpoint_url: form.endpoint_url,
          auth_type: form.auth_type,
          secret_name: form.secret_name || null,
          categories: list(form.categories),
          states: list(form.states).map((s) => s.toUpperCase()),
          metros: list(form.metros),
          priority: Number(form.priority) || 100,
          active: false,
          payout_notes: form.payout_notes || null,
        },
      }),
    onSuccess: () => {
      setForm(EMPTY);
      setOpen(false);
      invalidate();
    },
  });
  const toggleMut = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => toggle({ data: v }),
    onSettled: invalidate,
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSettled: invalidate,
  });

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="inline-flex items-center gap-2 text-base font-semibold">
            <Network className="h-4 w-4" /> Partner network
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Overflow for leads no SuCasa pro covers or claims. Partners start inactive — nothing sends until you flip them on.
          </p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
        >
          <Plus className="h-3 w-3" /> Add partner
        </button>
      </div>

      {open && (
        <div className="mt-5 grid gap-3 rounded-2xl border border-border p-4 sm:grid-cols-2">
          <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Field
            label="Endpoint URL"
            value={form.endpoint_url}
            onChange={(v) => setForm({ ...form, endpoint_url: v })}
            placeholder="https://partner.com/api/leads"
          />
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-muted-foreground">Auth type</label>
            <select
              value={form.auth_type}
              onChange={(e) => setForm({ ...form, auth_type: e.target.value as PartnerForm["auth_type"] })}
              className="rounded-xl border border-border bg-background px-3 py-2 text-xs"
            >
              <option value="bearer">Bearer token</option>
              <option value="header">X-API-Key header</option>
              <option value="none">None</option>
            </select>
          </div>
          <Field
            label="Secret name"
            value={form.secret_name}
            onChange={(v) => setForm({ ...form, secret_name: v })}
            placeholder="PARTNER_API_KEY"
          />
          <Field
            label="Categories (blank = all)"
            value={form.categories}
            onChange={(v) => setForm({ ...form, categories: v })}
            placeholder="Plumbing, Roofing"
          />
          <Field
            label="States (blank = all)"
            value={form.states}
            onChange={(v) => setForm({ ...form, states: v })}
            placeholder="GA, FL"
          />
          <Field label="Metros (blank = all)" value={form.metros} onChange={(v) => setForm({ ...form, metros: v })} />
          <Field label="Priority" value={form.priority} onChange={(v) => setForm({ ...form, priority: v })} />
          <div className="sm:col-span-2">
            <Field
              label="Payout notes"
              value={form.payout_notes}
              onChange={(v) => setForm({ ...form, payout_notes: v })}
              placeholder="$35 per qualified lead"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !form.name || !form.endpoint_url}
              className="rounded-full gradient-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {saveMut.isPending ? "Saving…" : "Save partner (inactive)"}
            </button>
            {saveMut.error && (
              <p className="mt-2 text-xs text-destructive">{(saveMut.error as Error).message}</p>
            )}
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-destructive">{(error as Error).message}</p>}
      {isLoading && <p className="mt-3 text-xs text-muted-foreground">Loading…</p>}

      {data && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Partners ({data.partners.length})
            </h3>
            {!data.partners.length ? (
              <p className="mt-2 text-xs text-muted-foreground">No partners configured yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {data.partners.map((p) => (
                  <li key={p.id} className="rounded-2xl border border-border p-3 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">{p.name}</p>
                        <p className="break-all text-muted-foreground">{p.endpoint_url}</p>
                        <p className="mt-1 text-muted-foreground">
                          {p.categories.length ? p.categories.join(", ") : "all categories"} ·{" "}
                          {p.states.length ? p.states.join(", ") : "all states"} · priority {p.priority}
                        </p>
                        {p.payout_notes && <p className="mt-1 text-muted-foreground">{p.payout_notes}</p>}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <button
                          onClick={() => toggleMut.mutate({ id: p.id, active: !p.active })}
                          className={`rounded-full px-3 py-1 text-[10px] font-semibold ${
                            p.active ? "bg-primary text-primary-foreground" : "border border-border"
                          }`}
                        >
                          {p.active ? "Active" : "Inactive"}
                        </button>
                        <button
                          onClick={() => removeMut.mutate(p.id)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Delete ${p.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Recent handoffs ({data.handoffs.length})
            </h3>
            {!data.handoffs.length ? (
              <p className="mt-2 text-xs text-muted-foreground">No leads handed off yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {data.handoffs.map((h) => {
                  const req = h.service_requests as unknown as {
                    category: string;
                    city: string | null;
                    state: string | null;
                  };
                  const partner = h.lead_partners as unknown as { name: string } | null;
                  return (
                    <li key={h.id} className="rounded-2xl border border-border p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold">{req?.category}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            h.status === "sent"
                              ? "bg-primary/10 text-primary"
                              : h.status === "failed"
                                ? "bg-destructive/10 text-destructive"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {h.status}
                        </span>
                      </div>
                      <p className="text-muted-foreground">
                        {[req?.city, req?.state].filter(Boolean).join(", ") || "no location"} ·{" "}
                        {partner?.name ?? "unmatched"}
                      </p>
                      {h.error_message && <p className="mt-1 text-destructive">{h.error_message}</p>}
                      {h.partner_lead_id && (
                        <p className="mt-1 text-muted-foreground">Partner lead #{h.partner_lead_id}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
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
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold text-muted-foreground">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-xl border border-border bg-background px-3 py-2 text-xs"
      />
    </div>
  );
}
