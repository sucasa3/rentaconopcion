import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail, Eye, Pencil } from "lucide-react";
import {
  listCampaigns,
  getOrgCampaignState,
  setCampaignActivation,
  getOrgBranding,
  getMyMemberBranding,
} from "@/lib/campaigns.functions";
import { CampaignBrandCard, type OrgBrandRow } from "@/components/campaign-brand-card";
import { MemberBrandCard, type MemberBrandRow } from "@/components/member-brand-card";
import { CampaignPreviewDialog } from "@/components/campaign-preview-dialog";
import { CampaignOverrideDialog, type OverrideRow } from "@/components/campaign-override-dialog";

export function CampaignsWorkspace({ orgs }: { orgs: Array<{ id: string; name: string }> }) {
  const qc = useQueryClient();
  const campaignsFn = useServerFn(listCampaigns);
  const stateFn = useServerFn(getOrgCampaignState);
  const toggleFn = useServerFn(setCampaignActivation);
  const brandFn = useServerFn(getOrgBranding);
  const memberBrandFn = useServerFn(getMyMemberBranding);

  const [orgId, setOrgId] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId && orgs.length) setOrgId(orgs[0].id);
  }, [orgs, orgId]);

  const { data: campaigns } = useQuery({ queryKey: ["campaigns"], queryFn: () => campaignsFn() });
  const { data: state } = useQuery({
    queryKey: ["org-campaign-state", orgId],
    queryFn: () => stateFn({ data: { orgId } }),
    enabled: !!orgId,
  });
  const { data: brand } = useQuery({
    queryKey: ["org-branding", orgId],
    queryFn: () => brandFn({ data: { orgId } }),
    enabled: !!orgId,
  });

  const { data: mine } = useQuery({
    queryKey: ["member-branding", orgId],
    queryFn: () => memberBrandFn({ data: { orgId } }),
    enabled: !!orgId,
  });

  const toggle = useMutation({
    mutationFn: (v: { campaignId: string; active: boolean }) =>
      toggleFn({ data: { orgId, campaignId: v.campaignId, active: v.active } }),
    onSuccess: () => {
      toast.success("Campaign updated");
      qc.invalidateQueries({ queryKey: ["org-campaign-state", orgId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const activeMap = new Map((state?.activations ?? []).map((a) => [a.campaign_id, a.active]));
  const overrideMap = new Map(
    ((brand?.overrides ?? []) as OverrideRow[]).map((o) => [o.campaign_id, o]),
  );
  const active = campaigns?.find((c) => c.id === (previewId ?? editId));

  return (
    <div className="space-y-6">
      {orgs.length > 1 && (
        <select
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
          className="rounded-full border border-border bg-background px-4 py-2 text-sm"
        >
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      )}

      {brand?.org && mine?.profile && (
        <MemberBrandCard
          orgId={orgId}
          orgName={(brand.org as OrgBrandRow).name}
          profile={mine.profile as MemberBrandRow}
          fallback={brand.org as Partial<MemberBrandRow>}
        />
      )}

      {brand?.org && mine?.canEditOrg && <CampaignBrandCard org={brand.org as OrgBrandRow} />}

      <div className="grid gap-3">
        {(campaigns ?? []).map((c) => {
          const on = !!activeMap.get(c.id);
          const ov = overrideMap.get(c.id);
          return (
            <div
              key={c.id}
              className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-border bg-card p-5 shadow-soft"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Mail className="h-4 w-4" />
                  </span>
                  <p className="text-sm font-semibold">{c.name}</p>
                  {ov && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Customized
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{c.description}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">{c.cadence}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPreviewId(c.id)}
                  disabled={!orgId}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                >
                  <Eye className="h-3 w-3" /> Preview
                </button>
                <button
                  onClick={() => setEditId(c.id)}
                  disabled={!orgId}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button
                  onClick={() => toggle.mutate({ campaignId: c.id, active: !on })}
                  disabled={toggle.isPending || !orgId}
                  className={`rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50 ${
                    on ? "gradient-brand text-white" : "border border-border hover:bg-muted"
                  }`}
                >
                  {on ? "On" : "Off"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {!!state?.sends?.length && (
        <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
          <h2 className="text-base font-semibold">Recent messages</h2>
          <ul className="mt-4 space-y-1 text-xs">
            {state.sends.slice(0, 15).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2">
                <span className="truncate">
                  {s.recipient_name ?? s.recipient_email} · {s.subject}
                </span>
                <span className={s.status === "sent" ? "text-growth" : "text-muted-foreground"}>{s.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {previewId && active && (
        <CampaignPreviewDialog
          orgId={orgId}
          campaignId={previewId}
          campaignName={active.name}
          onClose={() => setPreviewId(null)}
        />
      )}
      {editId && active && (
        <CampaignOverrideDialog
          orgId={orgId}
          campaignId={editId}
          campaignName={active.name}
          defaults={{ cta_label: active.cta_label, cta_url: active.cta_url }}
          current={overrideMap.get(editId) ?? null}
          onClose={() => setEditId(null)}
        />
      )}
    </div>
  );
}
