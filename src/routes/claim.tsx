import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { claimHomeowner, getClaimPreview } from "@/lib/homeowner-claim.functions";

export const Route = createFileRoute("/claim")({
  validateSearch: z.object({ t: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Claim your SuCasa Home Record" },
      { name: "description", content: "Confirm your home and claim the free Home Record your agent prepared." },
      { property: "og:title", content: "Claim your SuCasa Home Record" },
      { property: "og:description", content: "Confirm your home and start tracking value and upkeep." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClaimPage,
});

const REASONS: Record<string, string> = {
  expired: "This link has expired. Ask your agent for a new one.",
  replaced: "A newer link was created. Please use the latest link from your agent.",
  invalid: "This link isn't valid.",
  email_mismatch: "You're signed in with a different email than this invitation. Sign out and use the invited email.",
  already_claimed: "This home record was already claimed by another account.",
  need_address: "Please enter the correct address.",
};

function ClaimPage() {
  const { t: token } = Route.useSearch();
  const navigate = useNavigate();
  const previewFn = useServerFn(getClaimPreview);
  const claimFn = useServerFn(claimHomeowner);
  const [userEmail, setUserEmail] = useState<string | null | undefined>(undefined);
  const [homeCorrect, setHomeCorrect] = useState<boolean | null>(null);
  const [corrected, setCorrected] = useState("");
  const [connect, setConnect] = useState<"accept" | "decline" | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["claim-preview", token],
    enabled: Boolean(token),
    queryFn: () => previewFn({ data: { token: token! } }),
  });

  const claim = useMutation({
    mutationFn: () => claimFn({ data: { token: token!, homeCorrect: homeCorrect!, correctedAddress: corrected || undefined, connect: connect! } }),
    onSuccess: (r) => { if (r.ok) navigate({ to: "/home-care" }); },
  });

  const here = typeof window !== "undefined" ? window.location.href : "";
  const sendLink = async (email: string) => {
    sessionStorage.setItem("sucasa.claim_return", here);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: here } });
    if (!error) setSent(true);
  };

  let body: React.ReactNode;
  if (!token) body = <p>Open the link your agent shared with you.</p>;
  else if (isLoading || userEmail === undefined) body = <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />;
  else if (!data?.ok) body = <p>{REASONS[(data as any)?.reason] ?? REASONS.invalid}</p>;
  else if (!userEmail) {
    body = (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Hi {data.firstName}, claim your Home Record</h1>
        <p className="text-muted-foreground">{data.agentName} prepared this for {data.address}. Sign in with {data.maskedEmail} to continue.</p>
        {sent ? <p className="text-sm">Check your email for a sign-in link.</p> : (
          <Button className="w-full" onClick={() => sendLink(data.email)}>Email me a sign-in link</Button>
        )}
        <Button variant="outline" className="w-full" onClick={() => { sessionStorage.setItem("sucasa.claim_return", here); lovable.auth.signInWithOAuth("google", { redirect_uri: here }); }}>Continue with Google</Button>
      </div>
    );
  } else {
    const ready = homeCorrect !== null && connect !== null && (homeCorrect || corrected.trim().length > 4);
    body = (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Confirm your home</h1>
        <div className="space-y-2">
          <p className="font-medium">Is this your home?</p>
          <p className="rounded-lg border border-border p-3">{data.address}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant={homeCorrect === true ? "default" : "outline"} onClick={() => setHomeCorrect(true)}>Yes, that's it</Button>
            <Button variant={homeCorrect === false ? "default" : "outline"} onClick={() => setHomeCorrect(false)}>No, fix it</Button>
          </div>
          {homeCorrect === false && <Input placeholder="Correct address" value={corrected} onChange={(e) => setCorrected(e.target.value)} />}
        </div>
        <div className="space-y-2">
          <p className="font-medium">Connect with {data.agentName}?</p>
          <p className="text-sm text-muted-foreground">Connecting lets {data.agentName} see your Home Record. Existing connections with other professionals stay as they are.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant={connect === "accept" ? "default" : "outline"} onClick={() => setConnect("accept")}>Connect</Button>
            <Button variant={connect === "decline" ? "default" : "outline"} onClick={() => setConnect("decline")}>Not now</Button>
          </div>
        </div>
        {claim.data && !claim.data.ok && <p className="text-sm text-destructive">{REASONS[claim.data.reason] ?? REASONS.invalid}</p>}
        <Button className="w-full" disabled={!ready || claim.isPending} onClick={() => claim.mutate()}>
          {claim.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Claim my Home Record"}
        </Button>
        <p className="text-xs text-muted-foreground">Signed in as {userEmail}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-12 text-center sm:text-left">{body}</main>
      <SiteFooter />
    </div>
  );
}
