import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import {
  acceptProfessionalInvite,
  declineProfessionalInvite,
  previewProfessionalInvite,
} from "@/lib/professional-invitations.functions";

/**
 * Public claim page for an invited professional.
 *
 * Everything shown here comes from a server function that reveals only who
 * invited whom — no homeowner, property or mortgage information — because the
 * visitor has not proved their identity yet. Claiming requires signing in with
 * the invited address, and grants no homeowner access at all.
 */
export const Route = createFileRoute("/professional-invite")({
  validateSearch: z.object({ t: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Claim your SuCasa professional profile" },
      {
        name: "description",
        content:
          "An agent you work with listed you on SuCasa. Claim your professional profile to confirm your own details.",
      },
      { property: "og:title", content: "Claim your SuCasa professional profile" },
      {
        property: "og:description",
        content: "Confirm your name and company on SuCasa. You control what is shared.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProfessionalInvitePage,
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-lg px-5 py-10 sm:py-16">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}

const REASON_COPY: Record<string, string> = {
  expired: "This invitation link has expired. Ask the agent who invited you to send a new one.",
  revoked: "This invitation was withdrawn.",
  declined: "This invitation was already declined.",
  invalid: "This link isn't valid. Open the link from your invitation email.",
  malformed: "This link isn't valid. Open the link from your invitation email.",
  unsupported_version: "This link is out of date. Ask for a new invitation.",
};

function ProfessionalInvitePage() {
  const { t: token } = Route.useSearch();
  const previewFn = useServerFn(previewProfessionalInvite);
  const acceptFn = useServerFn(acceptProfessionalInvite);
  const declineFn = useServerFn(declineProfessionalInvite);

  const [signedInEmail, setSignedInEmail] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedInEmail(data.user?.email ?? null));
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["pro-invite-preview", token],
    enabled: Boolean(token),
    queryFn: () => previewFn({ data: { token: token! } }),
    staleTime: 60_000,
  });

  const accept = useMutation({
    mutationFn: () => acceptFn({ data: { token: token! } }),
  });
  const decline = useMutation({
    mutationFn: () => declineFn({ data: { token: token! } }),
  });

  if (!token) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight">Invitation link needed</h1>
        <p className="mt-2 text-muted-foreground">
          Open the link from your invitation email to continue.
        </p>
      </Shell>
    );
  }

  if (isLoading || signedInEmail === undefined) {
    return (
      <Shell>
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
      </Shell>
    );
  }

  if (!data?.valid) {
    const reason = (data as { reason?: string } | undefined)?.reason ?? "invalid";
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight">This invitation isn't available</h1>
        <p className="mt-2 text-muted-foreground">{REASON_COPY[reason] ?? REASON_COPY["invalid"]}</p>
      </Shell>
    );
  }

  const invite = data;
  const result = accept.data;

  if (result?.outcome === "claimed" || result?.outcome === "already_claimed_by_you") {
    return (
      <Shell>
        <CheckCircle2 className="h-8 w-8 text-status-positive" />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Your profile is yours</h1>
        <p className="mt-2 text-muted-foreground">
          Your name and email are now confirmed on SuCasa. Homeowner information is never included:
          each homeowner decides separately whether to share anything with you.
        </p>
      </Shell>
    );
  }

  if (result?.outcome === "reconciliation_required") {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight">We need to check something first</h1>
        <p className="mt-2 text-muted-foreground">
          There is already a SuCasa profile connected to a different account, so we won't merge the
          two automatically. Our team will sort it out with you — nothing was changed.
        </p>
      </Shell>
    );
  }

  const wrongAccount = result?.outcome === "wrong_account";
  const notVerified = result?.outcome === "email_not_verified";

  if (decline.data?.ok) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight">Thanks for letting us know</h1>
        <p className="mt-2 text-muted-foreground">
          You've declined this invitation and won't be asked again by this agent.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-xs font-medium uppercase tracking-wide text-sucasa-orange">
        Invited by {invite.inviterOrgName}
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        {invite.invitedName ? `${invite.invitedName}, claim your profile` : "Claim your profile"}
      </h1>
      <p className="mt-2 text-muted-foreground">
        {invite.inviterOrgName} listed you as a professional they work with. Claiming your profile
        confirms your own details — your name, your company, your email.
      </p>

      <div className="mt-5 rounded-2xl border border-border bg-surface-intelligence p-4">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
          <p className="text-sm text-muted-foreground">
            Claiming your profile gives you no homeowner details. Homeowners choose separately
            whether to connect and what to share.
          </p>
        </div>
      </div>

      <p className="mt-5 text-sm text-muted-foreground">
        Invited address: <span className="font-medium text-foreground">{invite.invitedEmail}</span>
      </p>

      {signedInEmail === null ? (
        <div className="mt-4 rounded-2xl border border-border p-4">
          <p className="text-sm font-medium">Sign in to continue</p>
          <p className="mt-1 text-sm text-muted-foreground">
            To confirm it's really you, sign in with {invite.invitedEmail}, then reopen this link.
          </p>
          <a
            href={`/auth?email=${encodeURIComponent(invite.invitedEmail)}`}
            className="mt-3 inline-flex rounded-full gradient-brand px-5 py-2.5 text-sm font-semibold text-white"
          >
            Sign in
          </a>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {wrongAccount && (
            <p className="rounded-2xl border border-status-caution/30 bg-status-caution/10 p-3 text-sm">
              You're signed in as {signedInEmail}. This invitation belongs to {invite.invitedEmail} —
              sign in with that address to claim it.
            </p>
          )}
          {notVerified && (
            <p className="rounded-2xl border border-status-caution/30 bg-status-caution/10 p-3 text-sm">
              Please confirm your email address first, then reopen this link.
            </p>
          )}
          <button
            onClick={() => accept.mutate()}
            disabled={accept.isPending}
            className="w-full rounded-full gradient-brand px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {accept.isPending ? "Confirming…" : "Claim my profile"}
          </button>
          <button
            onClick={() => decline.mutate()}
            disabled={decline.isPending}
            className="w-full rounded-full border border-border px-5 py-3 text-sm font-medium hover:bg-muted"
          >
            I'd rather not appear
          </button>
        </div>
      )}
    </Shell>
  );
}
