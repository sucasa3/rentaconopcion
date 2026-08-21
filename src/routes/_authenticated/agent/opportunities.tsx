import { createFileRoute, redirect } from "@tanstack/react-router";

/** Opportunities are now part of the "Today" work queue on the agent dashboard. */
export const Route = createFileRoute("/_authenticated/agent/opportunities")({
  beforeLoad: () => {
    throw redirect({ to: "/agent", hash: "work-queue" });
  },
});
