import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getCapacity, recommendCapacityPlan } from "@/lib/capacity.functions";

/**
 * When a lender stops sponsoring an agent, the agent keeps every Home Profile
 * and document. This card tells them how long they have to decide and what the
 * cheapest way to keep everything running would be.
 */
export function AgentContinuationCard({ orgId }: { orgId: string }) {
  const capacityFn = useServerFn(getCapacity);
  const recFn = useServerFn(recommendCapacityPlan);

  const { data: capacity } = useQuery({
    queryKey: ["capacity", orgId],
    queryFn: () => capacityFn({ data: { orgId } }),
    enabled: Boolean(orgId),
  });
  const { data: rec } = useQuery({
    queryKey: ["capacity-recommendation", orgId],
    queryFn: () => recFn({ data: { orgId } }),
    enabled: Boolean(orgId),
  });

  const org = (capacity as any)?.org;
  const summary = (capacity as any)?.summary;
  const r = (rec as any)?.recommendation;
  const sponsored = org?.subscriptionStatus === "sponsored" || (summary?.totalCapacity ?? 0) > 0;
  if (!org || !r || (sponsored && org.subscriptionStatus === "active")) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Keep your Home Profiles running</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          You have {(rec as any).activeProfiles.toLocaleString()} active Home Profiles. They stay
          yours — profiles, history and documents — whatever you choose next.
        </p>
        <p>
          Best fit: <span className="font-medium">{r.summary}</span> — $
          {(r.monthlyCents / 100).toLocaleString()}/month for {r.totalProfiles.toLocaleString()}{" "}
          Home Profiles.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <a href="/pricing">See plans</a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href="/agent/network">Find a sponsoring lender</a>
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Nothing is deleted. Profiles you don&apos;t cover simply go inactive and can be brought
          back any time.
        </p>
      </CardContent>
    </Card>
  );
}
