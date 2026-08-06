import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listOrgCampaignClients, previewCampaignForClient } from "@/lib/campaigns.functions";
import { X } from "lucide-react";

export function CampaignPreviewDialog({
  orgId,
  campaignId,
  campaignName,
  onClose,
}: {
  orgId: string;
  campaignId: string;
  campaignName: string;
  onClose: () => void;
}) {
  const clientsFn = useServerFn(listOrgCampaignClients);
  const previewFn = useServerFn(previewCampaignForClient);
  const [clientId, setClientId] = useState("");

  const { data: clients } = useQuery({
    queryKey: ["org-campaign-clients", orgId],
    queryFn: () => clientsFn({ data: { orgId } }),
  });

  const chosen = clientId || clients?.[0]?.id || "";

  const { data: preview, isFetching } = useQuery({
    queryKey: ["campaign-preview", orgId, campaignId, chosen],
    queryFn: () => previewFn({ data: { orgId, campaignId, clientId: chosen } }),
    enabled: !!chosen,
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-border bg-card p-6 shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold">Preview · {campaignName}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Exactly what this client would receive. Nothing is sent.
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <select
          value={chosen}
          onChange={(e) => setClientId(e.target.value)}
          className="mt-4 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
        >
          {(clients ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.client_name ?? c.client_email ?? c.address_line1}
            </option>
          ))}
        </select>

        {isFetching && <p className="mt-4 text-xs text-muted-foreground">Building preview…</p>}

        {preview && !isFetching && (
          <div className="mt-4 rounded-2xl border border-border bg-background p-5">
            <div className="border-b border-border pb-3 text-xs text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">From:</span>{" "}
                {preview.branding.senderName || preview.branding.orgName}
                {preview.branding.replyToEmail ? ` <${preview.branding.replyToEmail}>` : ""}
              </p>
              <p>
                <span className="font-medium text-foreground">To:</span>{" "}
                {preview.recipient.name ?? preview.recipient.email ?? "—"}
              </p>
              <p>
                <span className="font-medium text-foreground">Subject:</span> {preview.subject}
              </p>
            </div>

            {preview.branding.logoUrl && (
              <img src={preview.branding.logoUrl} alt="Partner logo" className="mt-4 h-9 w-auto" />
            )}

            <div className="mt-4 space-y-3 text-sm leading-relaxed">
              {preview.body.split("\n\n").map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>

            <p className="mt-4">
              <span className="inline-block rounded-full gradient-brand px-4 py-2 text-xs font-semibold text-white">
                {preview.cta.label}
              </span>
            </p>

            <div className="mt-5 border-t border-border pt-3 text-xs text-muted-foreground">
              {preview.branding.signoff && <p className="mb-2">{preview.branding.signoff}</p>}
              {preview.signature.split("\n").map((line, i) => (
                <p key={i} className={i === 0 ? "font-semibold text-foreground" : undefined}>
                  {line}
                </p>
              ))}
              <p className="mt-3 text-[10px]">{preview.footer}</p>
            </div>

            <p className="mt-4 text-[11px] text-muted-foreground">
              {preview.due ? "Due to send on the next daily pass" : `Not due right now — ${preview.dueReason}`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
