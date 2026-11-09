import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { createClaimLink, getClaimStatus } from "@/lib/homeowner-claim.functions";

const STATE: Record<string, string> = {
  none: "No invitation yet",
  link_copied: "Link created — not claimed yet (we don't know if it was sent)",
  expired: "Link expired — not claimed",
  replaced: "Older link replaced",
  claimed: "Claimed by homeowner",
};
const CONN: Record<string, string> = {
  accepted: "Connected with you",
  declined: "Declined connection",
  conflict: "Already linked to another account — not changed",
};

export function HomeownerInviteCard({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const statusFn = useServerFn(getClaimStatus);
  const createFn = useServerFn(createClaimLink);
  const [copied, setCopied] = useState<string | null>(null);
  const { data: s } = useQuery({ queryKey: ["claim-status", clientId], queryFn: () => statusFn({ data: { clientId } }) });
  const create = useMutation({
    mutationFn: () => createFn({ data: { clientId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["claim-status", clientId] }),
  });
  const copy = async (text: string, label: string) => { await navigator.clipboard.writeText(text); setCopied(label); };

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <p className="font-medium">Homeowner invitation</p>
      <p className="text-sm text-muted-foreground">{STATE[s?.state ?? "none"]}</p>
      {s?.connection && <p className="text-sm">Connection: {CONN[s.connection]}</p>}
      {s?.state === "claimed" && <p className="text-sm">{s.activated ? "Activated (home confirmed + first maintenance saved)" : s.homeCorrected ? "Not activated — homeowner corrected the address, needs review" : "Not activated yet"}</p>}
      {s?.state !== "claimed" && (
        <Button size="sm" variant="outline" disabled={create.isPending} onClick={() => create.mutate()}>
          {create.data ? "Create new link" : "Create invite link"}
        </Button>
      )}
      {create.error && <p className="text-sm text-destructive">{(create.error as Error).message}</p>}
      {create.data && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => copy(create.data.url, "link")}>Copy link</Button>
          <Button size="sm" variant="outline" onClick={() => copy(create.data.messages.en, "en")}>Copy English text</Button>
          <Button size="sm" variant="outline" onClick={() => copy(create.data.messages.es, "es")}>Copiar texto en español</Button>
          {copied && <p className="w-full text-xs text-muted-foreground">Copied. Nothing is sent automatically — share it yourself.</p>}
        </div>
      )}
    </div>
  );
}
