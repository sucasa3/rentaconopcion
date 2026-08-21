import { createFileRoute, redirect } from "@tanstack/react-router";

/** Tasks now live in the "Today" work queue on the agent dashboard. */
export const Route = createFileRoute("/_authenticated/agent/tasks")({
  beforeLoad: () => {
    throw redirect({ to: "/agent", hash: "work-queue" });
  },
});
