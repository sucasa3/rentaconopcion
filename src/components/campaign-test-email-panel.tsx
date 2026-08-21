import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mail } from "lucide-react";
import { sendCampaignTestEmail } from "@/lib/campaigns.functions";

export function CampaignTestEmailPanel() {
  const [email, setEmail] = useState("");
  const sendFn = useServerFn(sendCampaignTestEmail);

  const send = useMutation({
    mutationFn: () => sendFn({ data: { email: email.trim(), pushToCrm: true } }),
  });

  const result = send.data;

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div>
        <h2 className="text-base font-semibold">Campaign email dry-run</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Sends one real, partner-branded campaign email to the address you enter
          and pushes the matching contact into GoHighLevel.
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={() => send.mutate()}
          disabled={send.isPending || !email.trim()}
          className="inline-flex items-center justify-center gap-1.5 rounded-full gradient-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          <Mail className="h-3.5 w-3.5" />
          {send.isPending ? "Sending…" : "Send test email"}
        </button>
      </div>

      {send.isError && (
        <p className="mt-3 text-xs text-destructive">{(send.error as Error).message}</p>
      )}

      {result && (
        <div className="mt-4 space-y-1 rounded-2xl bg-muted px-4 py-3 text-xs">
          <p className="font-medium">
            {result.emailSent
              ? `Email sent to ${result.to}`
              : `Email not sent (${result.emailReason ?? "unknown"})`}
          </p>
          <p className="text-muted-foreground">Campaign: {result.campaign}</p>
          <p className="text-muted-foreground">Subject: {result.subject}</p>
          <p className="text-muted-foreground">
            From: {result.fromName}
            {result.replyTo ? ` · reply-to ${result.replyTo}` : ""}
          </p>
          <p className="text-muted-foreground">
            CRM: {result.crm.pushed ? `contact ${result.crm.contactId}` : `failed — ${result.crm.error}`}
          </p>
        </div>
      )}
    </div>
  );
}
