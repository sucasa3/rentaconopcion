import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { saveCampaignOverride, resetCampaignOverride } from "@/lib/campaigns.functions";
import { X } from "lucide-react";

export type OverrideRow = {
  campaign_id: string;
  subject: string | null;
  intro: string | null;
  closing: string | null;
  cta_label: string | null;
  cta_url: string | null;
};

export function CampaignOverrideDialog({
  orgId,
  campaignId,
  campaignName,
  defaults,
  current,
  onClose,
}: {
  orgId: string;
  campaignId: string;
  campaignName: string;
  defaults: { cta_label: string | null; cta_url: string | null };
  current: OverrideRow | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveCampaignOverride);
  const reset = useServerFn(resetCampaignOverride);

  const [form, setForm] = useState({
    subject: current?.subject ?? "",
    intro: current?.intro ?? "",
    closing: current?.closing ?? "",
    cta_label: current?.cta_label ?? "",
    cta_url: current?.cta_url ?? "",
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["org-branding", orgId] });
    qc.invalidateQueries({ queryKey: ["campaign-preview"] });
  };

  const saveMut = useMutation({
    mutationFn: () =>
      save({
        data: {
          orgId,
          campaignId,
          subject: form.subject || null,
          intro: form.intro || null,
          closing: form.closing || null,
          cta_label: form.cta_label || null,
          cta_url: form.cta_url || "",
        },
      }),
    onSuccess: () => {
      toast.success("Wording saved");
      invalidate();
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const resetMut = useMutation({
    mutationFn: () => reset({ data: { orgId, campaignId } }),
    onSuccess: () => {
      toast.success("Reset to SuCasa defaults");
      invalidate();
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-border bg-card p-6 shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold">Edit wording · {campaignName}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Leave a field blank to keep the SuCasa-written version. The personalized data paragraph is
              always generated fresh for each client.
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <Field
            label="Subject line"
            value={form.subject}
            onChange={(v) => setForm({ ...form, subject: v })}
            placeholder="Your home value update"
          />
          <Field
            label="Opening line"
            textarea
            value={form.intro}
            onChange={(v) => setForm({ ...form, intro: v })}
            placeholder="Hi {first name}, here's your monthly check-in."
          />
          <Field
            label="Closing line"
            textarea
            value={form.closing}
            onChange={(v) => setForm({ ...form, closing: v })}
            placeholder="Reply any time — happy to walk through the numbers."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Button label"
              value={form.cta_label}
              onChange={(v) => setForm({ ...form, cta_label: v })}
              placeholder={defaults.cta_label ?? "See my options"}
            />
            <Field
              label="Button link"
              value={form.cta_url}
              onChange={(v) => setForm({ ...form, cta_url: v })}
              placeholder={defaults.cta_url ?? "https://…"}
            />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            onClick={() => resetMut.mutate()}
            disabled={resetMut.isPending}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Reset to default
          </button>
          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="rounded-full gradient-brand px-5 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {saveMut.isPending ? "Saving…" : "Save wording"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <label className="block text-xs font-medium">
      <span className="text-muted-foreground">{label}</span>
      {textarea ? (
        <textarea
          rows={2}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal"
        />
      ) : (
        <input
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal"
        />
      )}
    </label>
  );
}
