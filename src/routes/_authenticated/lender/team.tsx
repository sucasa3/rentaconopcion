import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, UserPlus } from "lucide-react";
import { BusinessShell } from "@/components/business-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";
import { getBusinessOverview } from "@/lib/business.functions";
import {
  cancelLoanOfficerInvite,
  getLenderTeam,
  inviteLoanOfficer,
  reactivateLoanOfficer,
  removeLoanOfficer,
  resendLoanOfficerInvite,
  setRetainedOfficers,
} from "@/lib/lender-team.functions";

export const Route = createFileRoute("/_authenticated/lender/team")({
  head: () => ({
    meta: [
      { title: "Team — SuCasa Lender" },
      { name: "description", content: "Manage loan officer seats and invitations for your branch." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TeamPage,
});

function TeamPage() {
  const t = useT();
  const qc = useQueryClient();
  const overviewFn = useServerFn(getBusinessOverview);
  const teamFn = useServerFn(getLenderTeam);
  const inviteFn = useServerFn(inviteLoanOfficer);
  const resendFn = useServerFn(resendLoanOfficerInvite);
  const cancelFn = useServerFn(cancelLoanOfficerInvite);
  const removeFn = useServerFn(removeLoanOfficer);
  const reactivateFn = useServerFn(reactivateLoanOfficer);
  const retainFn = useServerFn(setRetainedOfficers);

  const { data: overview } = useQuery({
    queryKey: ["business-overview", "lender"],
    queryFn: () => overviewFn({ data: { orgType: "lender" } }),
    staleTime: 60_000,
  });
  const orgId: string | null = (overview as any)?.orgs?.[0]?.id ?? null;
  const { data: team } = useQuery({
    queryKey: ["lender-team", orgId],
    queryFn: () => teamFn({ data: { orgId: orgId! } }),
    enabled: Boolean(orgId),
  });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "manager">("member");
  const [link, setLink] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [keep, setKeep] = useState<string[]>([]);
  useEffect(() => {
    if (team) setKeep(team.retainedMemberIds);
  }, [team]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["lender-team", orgId] });
  const onErr = (e: Error) => toast.error(e.message);

  const invite = useMutation({
    mutationFn: () => inviteFn({ data: { orgId: orgId!, email, role } }),
    onSuccess: (r) => {
      setLink(r.url);
      setResent(false);
      setEmail("");
      refresh();
    },
    onError: onErr,
  });
  const resend = useMutation({
    mutationFn: (inviteId: string) => resendFn({ data: { inviteId } }),
    onSuccess: (r) => {
      setLink(r.url);
      setResent(true);
      refresh();
    },
    onError: onErr,
  });
  const cancel = useMutation({
    mutationFn: (inviteId: string) => cancelFn({ data: { inviteId } }),
    onSuccess: refresh,
    onError: onErr,
  });
  const remove = useMutation({
    mutationFn: (userId: string) => removeFn({ data: { orgId: orgId!, userId } }),
    onSuccess: refresh,
    onError: onErr,
  });
  const reactivate = useMutation({
    mutationFn: (userId: string) => reactivateFn({ data: { orgId: orgId!, userId } }),
    onSuccess: refresh,
    onError: onErr,
  });
  const retain = useMutation({
    mutationFn: () => retainFn({ data: { orgId: orgId!, userIds: keep } }),
    onSuccess: () => {
      toast.success(t("team.downgrade_saved"));
      refresh();
    },
    onError: onErr,
  });

  const used = team ? team.activeMembers + team.pendingInvites : 0;
  const full = team ? used >= team.seatLimit : false;
  const downgrade =
    team && team.pendingSeatLimit != null && team.pendingSeatLimit < team.activeMembers
      ? team.pendingSeatLimit
      : null;

  return (
    <BusinessShell kind="lender" bookId={null} isManager>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("team.title")}</h1>
          {team && (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("team.seats_used", { used, limit: team.seatLimit })}
              {team.pendingInvites > 0 && ` · ${t("team.pending", { count: team.pendingInvites })}`}
            </p>
          )}
        </div>

        {team && !team.teamEnabled && (
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6 text-sm">
              <p>{t("team.solo")}</p>
              <Button asChild size="sm">
                <Link to="/lender/billing" search={{ checkout: undefined }}>{t("team.upgrade")}</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {team?.isTeamManager && downgrade != null && (
          <Card className="border-status-warning">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t("team.downgrade_title", {
                  date: team.pendingPlanEffectiveAt
                    ? new Date(team.pendingPlanEffectiveAt).toLocaleDateString()
                    : "—",
                })}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">{t("team.downgrade_body", { limit: downgrade })}</p>
              <ul className="space-y-1">
                {team.members.map((m) => {
                  const owner = m.role === "owner";
                  return (
                    <li key={m.userId}>
                      <label className="flex min-h-11 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={owner || keep.includes(m.userId)}
                          disabled={owner}
                          onChange={(e) =>
                            setKeep((k) =>
                              e.target.checked ? [...k, m.userId] : k.filter((x) => x !== m.userId),
                            )
                          }
                        />
                        {m.name} · {t(`team.role.${m.role}` as any)}
                      </label>
                    </li>
                  );
                })}
              </ul>
              <Button size="sm" disabled={retain.isPending} onClick={() => retain.mutate()}>
                {t("team.downgrade_save")}
              </Button>
            </CardContent>
          </Card>
        )}

        {team?.isTeamManager && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("team.invite_title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">{t("team.invite_how")}</p>
              {full ? (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <p className="text-muted-foreground">{t("team.full")}</p>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/lender/billing" search={{ checkout: undefined }}>{t("team.upgrade")}</Link>
                  </Button>
                </div>
              ) : (
                <form
                  className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (email) invite.mutate();
                  }}
                >
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("team.invite_email")}
                    aria-label={t("team.invite_email")}
                  />
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as "member" | "manager")}
                    className="min-h-10 rounded-md border border-border bg-background px-3 text-sm"
                    aria-label="Role"
                  >
                    <option value="member">{t("team.invite_role_member")}</option>
                    <option value="manager">{t("team.invite_role_manager")}</option>
                  </select>
                  <Button type="submit" disabled={invite.isPending}>
                    <UserPlus className="h-4 w-4" /> {t("team.invite_btn")}
                  </Button>
                </form>
              )}
              {link && (
                <div className="rounded-md border border-border bg-surface p-3 text-sm">
                  <p className="text-muted-foreground" role="status">{t(resent ? "team.resend_note" : "team.invite_link")}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate text-xs" data-testid="invite-link">{link}</code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard?.writeText(link);
                        toast.success(t("team.copied"));
                      }}
                    >
                      <Copy className="h-4 w-4" /> {t("team.copy")}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("team.members")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {(team?.members ?? []).map((m) => (
                <li key={m.userId} className="flex min-h-12 items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    {m.name} {m.isMe && <span className="text-muted-foreground">({t("team.you")})</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant="secondary">{t(`team.role.${m.role}` as any)}</Badge>
                    {team?.isTeamManager && m.role !== "owner" && !m.isMe && (
                      <Button size="sm" variant="ghost" onClick={() => remove.mutate(m.userId)}>
                        {t("team.remove")}
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {(team?.invites.length ?? 0) > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("team.invites")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {team!.invites.map((i: any) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0 truncate">{i.email}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {i.expired
                        ? t("team.expired")
                        : t("team.expires", { date: new Date(i.expires_at).toLocaleDateString() })}
                      {team!.isTeamManager && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => resend.mutate(i.id)}>
                            {t("team.resend")}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => cancel.mutate(i.id)}>
                            {t("team.cancel")}
                          </Button>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {(team?.suspended.length ?? 0) > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("team.suspended")}</CardTitle>
              <p className="text-xs text-muted-foreground">{t("team.suspended_body")}</p>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {team!.suspended.map((s) => (
                  <li key={s.userId} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0 truncate">{s.name}</span>
                    {team!.isTeamManager && (
                      <Button size="sm" variant="outline" disabled={full} onClick={() => reactivate.mutate(s.userId)}>
                        {t("team.reactivate")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </BusinessShell>
  );
}
