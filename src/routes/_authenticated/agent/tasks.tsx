import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BusinessShell } from "@/components/business-shell";
import { TasksWorkspace } from "@/components/tasks-workspace";
import { getBusinessOverview } from "@/lib/business.functions";

export const Route = createFileRoute("/_authenticated/agent/tasks")({
  head: () => ({
    meta: [
      { title: "Your tasks — SuCasa" },
      {
        name: "description",
        content: "Everything on your plate today, generated from what's happening in your book.",
      },
      { property: "og:title", content: "Your tasks — SuCasa" },
      {
        property: "og:description",
        content: "Everything on your plate today, generated from what's happening in your book.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AgentTasks,
});

function AgentTasks() {
  const overviewFn = useServerFn(getBusinessOverview);
  const { data } = useQuery({
    queryKey: ["business-overview", "agent"],
    queryFn: () => overviewFn({ data: { orgType: "agent" } }),
    staleTime: 60_000,
  });
  return (
    <BusinessShell kind="agent" bookId={data?.books?.[0]?.id ?? null}>
      <TasksWorkspace kind="agent" />
    </BusinessShell>
  );
}
