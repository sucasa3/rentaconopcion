import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Landmark, Check, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";
import { getMyLendingContact, requestMortgageConversation } from "@/lib/lending-partner.functions";

const CFPB_URL = "https://www.consumerfinance.gov/owning-a-home/";

/**
 * "Explore your mortgage options" on /money. Shows a lender only when the
 * homeowner's own agent designated one; otherwise neutral information only.
 */
export function MortgageOptionsCard() {
  const t = useT();
  const fetchFn = useServerFn(getMyLendingContact);
  const { data, isLoading } = useQuery({
    queryKey: ["my-lending-contact"],
    queryFn: () => fetchFn(),
    staleTime: 60_000,
  });
  const [open, setOpen] = useState(false);

  if (isLoading) return null;

  return (
    <section className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="rounded-2xl bg-primary/10 p-2 text-primary">
          <Landmark className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{t("lend.title")}</h3>
          {!data && <p className="mt-1 text-sm text-muted-foreground">{t("lend.neutral_body")}</p>}
        </div>
      </div>

      {data && (
        <div className="mt-4 rounded-2xl border border-border p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("lend.label")}
          </p>
          <p className="mt-2 text-base font-semibold">{data.officer.name}</p>
          <p className="text-sm text-muted-foreground">
            {[data.officer.title, data.officer.company].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {[
              data.officer.nmls ? t("lend.nmls", { id: data.officer.nmls }) : null,
              data.officer.companyNmls ? t("lend.company_nmls", { id: data.officer.companyNmls }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {data.agentName ? t("lend.via", { agent: data.agentName }) : t("lend.via_generic")}
          </p>
          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("lend.disclosure")}
          </p>
          {data.requestedAt ? (
            <div className="mt-4 flex items-center gap-2 text-sm font-medium text-success">
              <Check className="h-4 w-4" />
              <span>
                {t("lend.requested")} — {t("lend.requested_line", { name: data.officer.name ?? "" })}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-4 w-full rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:w-auto"
            >
              {t("lend.request")}
            </button>
          )}
        </div>
      )}

      <div className="mt-4 rounded-2xl bg-secondary/60 p-4">
        <p className="text-sm font-semibold">{t("lend.independent_title")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("lend.independent_body")}</p>
        <a
          href={CFPB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          {t("lend.independent_link")} <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {data && <RequestDialog open={open} onOpenChange={setOpen} contact={data} />}
    </section>
  );
}

type Contact = NonNullable<Awaited<ReturnType<typeof getMyLendingContact>>>;

function RequestDialog({
  open,
  onOpenChange,
  contact,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contact: Contact;
}) {
  const t = useT();
  const qc = useQueryClient();
  const sendFn = useServerFn(requestMortgageConversation);
  const [channel, setChannel] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [optIn, setOptIn] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail(contact.me.email ?? "");
      setPhone(contact.me.phone ?? "");
      setChannel(contact.me.email ? "email" : "phone");
      setOptIn(false);
    }
  }, [open, contact.me.email, contact.me.phone]);

  const send = useMutation({
    mutationFn: () =>
      sendFn({
        data: {
          designationId: contact.designationId,
          channel,
          email: channel === "email" ? email.trim() || null : null,
          phone: channel === "phone" ? phone.trim() || null : null,
          includeValueEquity: optIn,
          confirmed: true,
        },
      }),
    onSuccess: () => {
      toast.success(t("lend.sent_toast"));
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["my-lending-contact"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const name = contact.officer.name ?? "";
  const company = contact.officer.company ? ` (${contact.officer.company})` : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("lend.modal_title", { name })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">{t("lend.modal_body", { name, company })}</p>
          {contact.officer.nmls && (
            <p className="text-xs text-muted-foreground">{t("lend.nmls", { id: contact.officer.nmls })}</p>
          )}

          <div>
            <p className="font-semibold">{t("lend.modal_shares")}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
              <li>{t("lend.share_name")}{contact.me.name ? ` — ${contact.me.name}` : ""}</li>
              <li>{t("lend.share_contact")}</li>
              <li>{t("lend.share_address")}{contact.me.address ? ` — ${contact.me.address}` : ""}</li>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">{t("lend.modal_not_shared")}</p>
          </div>

          <div>
            <p className="font-semibold">{t("lend.modal_channel")}</p>
            <div className="mt-2 flex gap-2">
              {(["email", "phone"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  className={`flex-1 rounded-full border px-3 py-2 text-xs font-semibold ${
                    channel === c ? "border-primary bg-primary/10 text-primary" : "border-border"
                  }`}
                >
                  {t(c === "email" ? "lend.channel_email" : "lend.channel_phone")}
                </button>
              ))}
            </div>
            <Input
              className="mt-2"
              type={channel === "email" ? "email" : "tel"}
              value={channel === "email" ? email : phone}
              onChange={(e) => (channel === "email" ? setEmail(e.target.value) : setPhone(e.target.value))}
              aria-label={t(channel === "email" ? "lend.channel_email" : "lend.channel_phone")}
            />
          </div>

          <label className="flex items-start gap-2 text-xs">
            <Checkbox checked={optIn} onCheckedChange={(v) => setOptIn(v === true)} className="mt-0.5" />
            <span>{t("lend.modal_optin")}</span>
          </label>

          <p className="text-xs text-muted-foreground">{t("lend.modal_not_marketing")}</p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 rounded-full border border-border py-2.5 text-xs font-semibold hover:bg-secondary"
            >
              {t("lend.cancel")}
            </button>
            <button
              type="button"
              disabled={send.isPending}
              onClick={() => send.mutate()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-primary py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              {send.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("lend.confirm")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
