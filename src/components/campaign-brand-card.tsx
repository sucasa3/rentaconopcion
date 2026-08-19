import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { saveOrgBranding } from "@/lib/campaigns.functions";
import { Upload } from "lucide-react";

export type OrgBrandRow = {
  id: string;
  name: string;
  org_type: string | null;
  sender_name: string | null;
  reply_to_email: string | null;
  contact_name: string | null;
  contact_title: string | null;
  contact_phone: string | null;
  license_number: string | null;
  logo_url: string | null;
  signoff: string | null;
};

const FIELDS: Array<{ key: keyof OrgBrandRow; label: string; placeholder: string }> = [
  { key: "sender_name", label: "From name", placeholder: "Jane Smith — Acme Lending" },
  { key: "reply_to_email", label: "Reply-to email", placeholder: "jane@acmelending.com" },
  { key: "contact_name", label: "Contact name", placeholder: "Jane Smith" },
  { key: "contact_title", label: "Title", placeholder: "Senior Loan Officer" },
  { key: "contact_phone", label: "Phone", placeholder: "(404) 555-0134" },
  { key: "license_number", label: "License #", placeholder: "NMLS 123456" },
  { key: "signoff", label: "Sign-off line", placeholder: "Always here if you have questions." },
];

export function CampaignBrandCard({ org }: { org: OrgBrandRow }) {
  const qc = useQueryClient();
  const save = useServerFn(saveOrgBranding);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<OrgBrandRow>(org);
  const [uploading, setUploading] = useState(false);

  useEffect(() => setForm(org), [org]);

  const mut = useMutation({
    mutationFn: () =>
      save({
        data: {
          orgId: org.id,
          sender_name: form.sender_name ?? "",
          reply_to_email: form.reply_to_email ?? "",
          contact_name: form.contact_name ?? "",
          contact_title: form.contact_title ?? "",
          contact_phone: form.contact_phone ?? "",
          license_number: form.license_number ?? "",
          logo_url: form.logo_url ?? "",
          signoff: form.signoff ?? "",
        },
      }),
    onSuccess: () => {
      toast.success("Branding saved");
      qc.invalidateQueries({ queryKey: ["org-branding", org.id] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  async function onLogo(file: File) {
    setUploading(true);
    try {
      const path = `${org.id}/logo-${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("partner-logos").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: signed } = await supabase.storage
        .from("partner-logos")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      setForm((f) => ({ ...f, logo_url: signed?.signedUrl ?? null }));
      toast.success("Logo uploaded — remember to save");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const signature = [
    form.contact_name,
    form.contact_title,
    org.name,
    form.contact_phone,
    form.reply_to_email,
    form.license_number ? `License ${form.license_number}` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <h2 className="text-base font-semibold">Team defaults</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Used for clients that aren&rsquo;t assigned to a specific loan officer, and to fill in any field a
        teammate leaves blank in their own email identity.
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <label key={String(f.key)} className="text-xs font-medium">
              <span className="text-muted-foreground">{f.label}</span>
              <input
                value={(form[f.key] as string) ?? ""}
                placeholder={f.placeholder}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal"
              />
            </label>
          ))}

          <div className="text-xs font-medium sm:col-span-2">
            <span className="text-muted-foreground">Logo</span>
            <div className="mt-1 flex items-center gap-3">
              {form.logo_url ? (
                <img src={form.logo_url} alt={`${org.name} logo`} className="h-10 w-auto rounded-lg bg-muted" />
              ) : (
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <Upload className="h-4 w-4" />
                </span>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onLogo(f);
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
              >
                {uploading ? "Uploading…" : form.logo_url ? "Replace logo" : "Upload logo"}
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-muted/50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Signature preview
          </p>
          <div className="mt-3 space-y-1 text-xs">
            <p className="font-medium">
              From: {form.sender_name || org.name}
              {form.reply_to_email ? ` <${form.reply_to_email}>` : ""}
            </p>
            <div className="mt-3 border-t border-border pt-3">
              {form.logo_url && (
                <img src={form.logo_url} alt={`${org.name} logo`} className="mb-2 h-8 w-auto" />
              )}
              {form.signoff && <p className="mb-2 text-muted-foreground">{form.signoff}</p>}
              {signature.map((line, i) => (
                <p key={i} className={i === 0 ? "font-semibold" : "text-muted-foreground"}>
                  {line}
                </p>
              ))}
              <p className="mt-3 text-[10px] text-muted-foreground">
                Sent by SuCasa on behalf of {org.name}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          className="rounded-full gradient-brand px-5 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {mut.isPending ? "Saving…" : "Save branding"}
        </button>
      </div>
    </div>
  );
}
