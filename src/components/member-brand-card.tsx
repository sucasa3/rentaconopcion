import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { saveMemberBranding } from "@/lib/campaigns.functions";
import { Upload } from "lucide-react";

export type MemberBrandRow = {
  user_id: string;
  sender_name: string | null;
  reply_to_email: string | null;
  contact_name: string | null;
  contact_title: string | null;
  contact_phone: string | null;
  license_number: string | null;
  logo_url: string | null;
  signoff: string | null;
};

const FIELDS: Array<{ key: keyof MemberBrandRow; label: string; placeholder: string }> = [
  { key: "sender_name", label: "From name", placeholder: "Jane Smith — Acme Lending" },
  { key: "reply_to_email", label: "Reply-to email", placeholder: "jane@acmelending.com" },
  { key: "contact_name", label: "Your name", placeholder: "Jane Smith" },
  { key: "contact_title", label: "Title", placeholder: "Senior Loan Officer" },
  { key: "contact_phone", label: "Phone", placeholder: "(404) 555-0134" },
  { key: "license_number", label: "License / NMLS #", placeholder: "NMLS 123456" },
  { key: "signoff", label: "Sign-off line", placeholder: "Always here if you have questions." },
];

export function MemberBrandCard({
  orgId,
  orgName,
  profile,
  fallback,
}: {
  orgId: string;
  orgName: string;
  profile: MemberBrandRow;
  /** Org-level defaults used whenever a personal field is left blank. */
  fallback: Partial<MemberBrandRow> | null;
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveMemberBranding);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<MemberBrandRow>(profile);
  const [uploading, setUploading] = useState(false);

  useEffect(() => setForm(profile), [profile]);

  const eff = (k: keyof MemberBrandRow) =>
    (form[k] as string | null) || ((fallback?.[k] as string | null) ?? null);

  const mut = useMutation({
    mutationFn: () =>
      save({
        data: {
          orgId,
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
      toast.success("Your email identity is saved");
      qc.invalidateQueries({ queryKey: ["member-branding", orgId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  async function onLogo(file: File) {
    setUploading(true);
    try {
      const path = `${orgId}/member-${profile.user_id}-${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("partner-logos").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: signed } = await supabase.storage
        .from("partner-logos")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      setForm((f) => ({ ...f, logo_url: signed?.signedUrl ?? null }));
      toast.success("Image uploaded — remember to save");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const signature = [
    eff("contact_name"),
    eff("contact_title"),
    orgName,
    eff("contact_phone"),
    eff("reply_to_email"),
    eff("license_number") ? `License ${eff("license_number")}` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <h2 className="text-base font-semibold">My email identity</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Campaigns for the clients assigned to you go out under your name, with replies landing in your inbox.
        Leave a field blank to use your team&rsquo;s default.
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map((f) => {
            const inherited = !form[f.key] && !!fallback?.[f.key];
            return (
              <label key={String(f.key)} className="text-xs font-medium">
                <span className="text-muted-foreground">{f.label}</span>
                <input
                  value={(form[f.key] as string) ?? ""}
                  placeholder={(fallback?.[f.key] as string) || f.placeholder}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal"
                />
                {inherited && (
                  <span className="mt-1 block text-[10px] font-normal text-muted-foreground">
                    Using team default
                  </span>
                )}
              </label>
            );
          })}

          <div className="text-xs font-medium sm:col-span-2">
            <span className="text-muted-foreground">Headshot or logo</span>
            <div className="mt-1 flex items-center gap-3">
              {eff("logo_url") ? (
                <img src={eff("logo_url")!} alt="Sender logo" className="h-10 w-auto rounded-lg bg-muted" />
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
                {uploading ? "Uploading…" : form.logo_url ? "Replace image" : "Upload image"}
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
              From: {eff("sender_name") || orgName}
              {eff("reply_to_email") ? ` <${eff("reply_to_email")}>` : ""}
            </p>
            <div className="mt-3 border-t border-border pt-3">
              {eff("logo_url") && <img src={eff("logo_url")!} alt="" className="mb-2 h-8 w-auto" />}
              {eff("signoff") && <p className="mb-2 text-muted-foreground">{eff("signoff")}</p>}
              {signature.map((line, i) => (
                <p key={i} className={i === 0 ? "font-semibold" : "text-muted-foreground"}>
                  {line}
                </p>
              ))}
              <p className="mt-3 text-[10px] text-muted-foreground">
                Sent by SuCasa on behalf of {orgName}
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
          {mut.isPending ? "Saving…" : "Save my identity"}
        </button>
      </div>
    </div>
  );
}
