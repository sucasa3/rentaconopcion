import { useEffect, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Download,
  Loader2,
  MapPin,
  Phone,
  ShieldCheck,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddressAutocomplete, type AddressValue } from "@/components/address-autocomplete";
import { useT, useLanguage } from "@/lib/i18n";
import {
  cancelPhoneChange,
  confirmPhoneChange,
  exportMyPersonalData,
  getMyAccount,
  requestPhoneChange,
  updateMyAccountBasics,
  updateMyHomeAddress,
} from "@/lib/account.functions";
import {
  closeMyOrganization,
  deleteMyAccount,
  getDeletionPreview,
  transferOrganizationOwnership,
} from "@/lib/account-deletion.functions";

export const Route = createFileRoute("/_authenticated/account")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Account — SuCasa" },
      {
        name: "description",
        content: "Your SuCasa account details, your home, and a copy of your personal data.",
      },
      { property: "og:title", content: "Account — SuCasa" },
      {
        property: "og:description",
        content: "Your SuCasa account details, your home, and a copy of your personal data.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountPage,
});

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-snug text-muted-foreground">{description}</p>
          ) : null}
          <div className="mt-4 space-y-3">{children}</div>
        </div>
      </div>
    </section>
  );
}

function AccountPage() {
  const t = useT();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setLanguage } = useLanguage();

  const account = useQuery({ queryKey: ["my-account"], queryFn: () => getMyAccount() });

  return (
    <div className="min-h-screen bg-surface">
      <main className="px-4 py-6 sm:px-5 sm:py-8">
        <div className="mx-auto max-w-2xl space-y-5">
          <button
            onClick={() => router.history.back()}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("acct.back")}
          </button>

          <header>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {t("acct.title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("acct.subtitle")}</p>
          </header>

          {account.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("acct.loading")}
            </div>
          ) : account.data ? (
            <>
              <DetailsSection
                data={account.data}
                onSaved={async (lang) => {
                  await setLanguage(lang);
                  await queryClient.invalidateQueries({ queryKey: ["my-account"] });
                }}
              />
              <PhoneSection
                phone={account.data.phone}
                pending={account.data.pendingPhone}
                onChanged={() => queryClient.invalidateQueries({ queryKey: ["my-account"] })}
              />
              {account.data.hasOwnHome ? (
                <HomeSection
                  home={account.data.home}
                  onChanged={async () => {
                    await queryClient.invalidateQueries();
                  }}
                />
              ) : null}

              <ExportSection />
              <DeleteSection />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("acct.load_error")}</p>
          )}
        </div>
      </main>
    </div>
  );
}

type AccountData = Awaited<ReturnType<typeof getMyAccount>>;

function DetailsSection({
  data,
  onSaved,
}: {
  data: AccountData;
  onSaved: (lang: "en" | "es") => Promise<void>;
}) {
  const t = useT();
  const [name, setName] = useState(data.fullName);
  const [lang, setLang] = useState<"en" | "es">(data.language === "es" ? "es" : "en");
  const [newEmail, setNewEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);

  useEffect(() => {
    setName(data.fullName);
    setLang(data.language === "es" ? "es" : "en");
  }, [data.fullName, data.language]);

  const save = useMutation({
    mutationFn: () => updateMyAccountBasics({ data: { fullName: name.trim(), language: lang } }),
    onSuccess: async () => {
      toast.success(t("acct.saved"));
      await onSaved(lang);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function changeEmail() {
    const next = newEmail.trim();
    if (!next || !next.includes("@")) {
      toast.error(t("acct.email_invalid"));
      return;
    }
    setEmailBusy(true);
    const { error } = await supabase.auth.updateUser({ email: next });
    setEmailBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewEmail("");
    toast.success(t("acct.email_sent"));
  }

  return (
    <Section icon={<User className="h-4 w-4" />} title={t("acct.section.details")}>
      <div>
        <Label htmlFor="acct-name">{t("acct.name")}</Label>
        <Input
          id="acct-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1.5"
        />
      </div>

      <div>
        <Label htmlFor="acct-lang">{t("acct.language")}</Label>
        <select
          id="acct-lang"
          value={lang}
          onChange={(e) => setLang(e.target.value === "es" ? "es" : "en")}
          className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
        >
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
      </div>

      <Button
        onClick={() => save.mutate()}
        disabled={save.isPending || name.trim().length === 0}
        className="min-h-11 rounded-xl"
      >
        {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {t("acct.save")}
      </Button>

      <div className="rounded-xl border border-border/70 bg-secondary/40 p-3">
        <p className="text-sm font-medium text-foreground">{t("acct.email")}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{data.authEmail ?? "—"}</p>
        <p className="mt-2 text-xs leading-snug text-muted-foreground">{t("acct.email_help")}</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={t("acct.email_new")}
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <Button
            variant="secondary"
            onClick={changeEmail}
            disabled={emailBusy}
            className="min-h-11 shrink-0 rounded-xl"
          >
            {emailBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("acct.email_change")}
          </Button>
        </div>
      </div>
    </Section>
  );
}

function PhoneSection({
  phone,
  pending,
  onChanged,
}: {
  phone: string | null;
  pending: AccountData["pendingPhone"];
  onChanged: () => void | Promise<unknown>;
}) {
  const t = useT();
  const [next, setNext] = useState("");
  const [code, setCode] = useState("");

  const request = useMutation({
    mutationFn: () => requestPhoneChange({ data: { phone: next.trim() } }),
    onSuccess: async (res) => {
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setNext("");
      toast.success(t("acct.code_sent"));
      await onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirm = useMutation({
    mutationFn: () => confirmPhoneChange({ data: { code: code.trim() } }),
    onSuccess: async (res) => {
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setCode("");
      toast.success(t("acct.phone_updated"));
      await onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: () => cancelPhoneChange(),
    onSuccess: async () => {
      setCode("");
      await onChanged();
    },
  });

  return (
    <Section
      icon={<Phone className="h-4 w-4" />}
      title={t("acct.phone")}
      description={t("acct.phone_help")}
    >
      <p className="text-sm text-muted-foreground">{phone ?? t("acct.phone_none")}</p>

      {pending ? (
        <div className="rounded-xl border border-intelligence-accent/50 bg-secondary/40 p-3">
          <p className="text-sm text-foreground">
            {t("acct.code_pending", { number: pending.masked })}
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <Button
              onClick={() => confirm.mutate()}
              disabled={confirm.isPending || code.trim().length < 4}
              className="min-h-11 shrink-0 rounded-xl"
            >
              {confirm.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("acct.verify")}
            </Button>
          </div>
          <button
            onClick={() => cancel.mutate()}
            className="mt-2 text-xs font-medium text-muted-foreground underline"
          >
            {t("acct.cancel")}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={t("acct.phone_new")}
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <Button
            variant="secondary"
            onClick={() => request.mutate()}
            disabled={request.isPending || next.trim().length < 7}
            className="min-h-11 shrink-0 rounded-xl"
          >
            {request.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("acct.phone_change")}
          </Button>
        </div>
      )}
    </Section>
  );
}

function HomeSection({
  home,
  onChanged,
}: {
  home: AccountData["home"];
  onChanged: () => void | Promise<unknown>;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<AddressValue>({
    street: home.address ?? "",
    city: home.city ?? "",
    state: home.state ?? "",
    zip: home.zip ?? "",
  });
  const [confirmed, setConfirmed] = useState(false);

  const current = [home.address, home.city, home.state, home.zip].filter(Boolean).join(", ");
  const valid =
    value.street.trim().length > 2 &&
    ((value.city.trim() && value.state.trim()) || value.zip.trim());

  const save = useMutation({
    mutationFn: () =>
      updateMyHomeAddress({
        data: {
          street: value.street.trim(),
          city: value.city.trim(),
          state: value.state.trim(),
          zip: value.zip.trim(),
          confirmed: true,
        },
      }),
    onSuccess: async (res) => {
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setEditing(false);
      setConfirmed(false);
      toast.success(t("acct.home_saved"));
      await onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Section
      icon={<MapPin className="h-4 w-4" />}
      title={t("acct.section.home")}
      description={t("acct.home_help")}
    >
      <p className="text-sm text-muted-foreground">{current || t("acct.home_none")}</p>

      {editing ? (
        <div className="space-y-3">
          <AddressAutocomplete value={value} onChange={setValue} />
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span>{t("acct.home_confirm")}</span>
          </label>
          <div className="flex gap-2">
            <Button
              onClick={() => save.mutate()}
              disabled={!valid || !confirmed || save.isPending}
              className="min-h-11 rounded-xl"
            >
              {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("acct.home_save")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setConfirmed(false);
              }}
              className="min-h-11 rounded-xl"
            >
              {t("acct.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="secondary"
          onClick={() => setEditing(true)}
          className="min-h-11 rounded-xl"
        >
          {t("acct.home_change")}
        </Button>
      )}
    </Section>
  );
}

function ExportSection() {
  const t = useT();
  const run = useMutation({
    mutationFn: () => exportMyPersonalData(),
    onSuccess: (payload) => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sucasa-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("acct.export_done"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Section
      icon={<Download className="h-4 w-4" />}
      title={t("acct.section.export")}
      description={t("acct.export_help")}
    >
      <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-secondary/40 p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-xs leading-snug text-muted-foreground">{t("acct.export_note")}</p>
      </div>
      <Button
        onClick={() => run.mutate()}
        disabled={run.isPending}
        className="min-h-11 rounded-xl"
      >
        {run.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {t("acct.export_button")}
      </Button>
    </Section>
  );
}

function DeleteSection() {
  const t = useT();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState("");
  const [transferTo, setTransferTo] = useState<Record<string, string>>({});

  const preview = useQuery({
    queryKey: ["deletion-preview"],
    queryFn: () => getDeletionPreview(),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["deletion-preview"] });

  const transfer = useMutation({
    mutationFn: (vars: { orgId: string; toUserId: string }) =>
      transferOrganizationOwnership({ data: vars }),
    onSuccess: async () => {
      toast.success(t("acct.delete_org_transferred"));
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const close = useMutation({
    mutationFn: (orgId: string) => closeMyOrganization({ data: { orgId } }),
    onSuccess: async () => {
      toast.success(t("acct.delete_org_closed"));
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const run = useMutation({
    mutationFn: () => deleteMyAccount({ data: { confirm } }),
    onSuccess: async (res) => {
      if (res.ok) {
        toast.success(t("acct.delete_done"));
        await supabase.auth.signOut();
        window.location.href = "/";
        return;
      }
      toast.error(res.error);
      if (res.reason === "organization") await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const data = preview.data;
  const blocked = (data?.blockingOrgs.length ?? 0) > 0;
  const subLine =
    data?.subscription.kind === "paid"
      ? t("acct.delete_sub_paid")
      : data?.subscription.kind === "sponsored"
        ? t("acct.delete_sub_sponsored")
        : t("acct.delete_sub_none");

  return (
    <Section
      icon={<Trash2 className="h-4 w-4" />}
      title={t("acct.section.delete")}
      description={t("acct.delete_help")}
    >
      {preview.isLoading || !data ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("acct.loading")}
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border/70 bg-secondary/40 p-3">
            <p className="text-sm font-medium text-foreground">{t("acct.delete_what")}</p>
            <ul className="mt-2 space-y-1.5 text-xs leading-snug text-muted-foreground">
              <li>{t("acct.delete_point_stop")}</li>
              <li>{t("acct.delete_point_personal")}</li>
              {data.businessRecords > 0 ? <li>{t("acct.delete_point_business")}</li> : null}
              {data.pendingServiceRequests + data.openIntroductions > 0 ? (
                <li>{t("acct.delete_point_open")}</li>
              ) : null}
              {data.committedServiceRequests > 0 ? (
                <li className="text-foreground">{t("acct.delete_point_committed")}</li>
              ) : null}
              <li>{t("acct.delete_point_new_consent")}</li>
              <li>{subLine}</li>
            </ul>
          </div>

          {blocked ? (
            <div className="space-y-3">
              {data.blockingOrgs.map((org) => (
                <div
                  key={org.orgId}
                  className="rounded-xl border border-border/70 bg-card p-3"
                >
                  <p className="text-sm font-medium text-foreground">
                    {t("acct.delete_org_title")}
                  </p>
                  <p className="mt-1 text-xs leading-snug text-muted-foreground">
                    {t("acct.delete_org_help", { name: org.orgName })}
                  </p>
                  {org.otherMembers.length > 0 ? (
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <select
                        value={transferTo[org.orgId] ?? ""}
                        onChange={(e) =>
                          setTransferTo((p) => ({ ...p, [org.orgId]: e.target.value }))
                        }
                        className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                      >
                        <option value="">—</option>
                        {org.otherMembers.map((m) => (
                          <option key={m.userId} value={m.userId}>
                            {m.role}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="secondary"
                        className="min-h-11 shrink-0 rounded-xl"
                        disabled={!transferTo[org.orgId] || transfer.isPending}
                        onClick={() =>
                          transfer.mutate({
                            orgId: org.orgId,
                            toUserId: transferTo[org.orgId] as string,
                          })
                        }
                      >
                        {t("acct.delete_org_transfer")}
                      </Button>
                    </div>
                  ) : null}
                  <Button
                    variant="ghost"
                    className="mt-2 min-h-11 rounded-xl text-destructive"
                    disabled={close.isPending}
                    onClick={() => close.mutate(org.orgId)}
                  >
                    {t("acct.delete_org_close", { name: org.orgName })}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <>
              {!data.recentAuth ? (
                <p className="text-xs leading-snug text-muted-foreground">
                  {t("acct.delete_reauth")}
                </p>
              ) : null}
              <div>
                <Label htmlFor="acct-delete-confirm">{t("acct.delete_confirm_label")}</Label>
                <Input
                  id="acct-delete-confirm"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="DELETE"
                  className="mt-1.5"
                />
              </div>
              <Button
                variant="destructive"
                className="min-h-11 rounded-xl"
                disabled={confirm.trim().toUpperCase() !== "DELETE" || run.isPending}
                onClick={() => run.mutate()}
              >
                {run.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t("acct.delete_button")}
              </Button>
            </>
          )}
        </>
      )}
    </Section>
  );
}
