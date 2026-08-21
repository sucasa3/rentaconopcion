import { createFileRoute, redirect } from "@tanstack/react-router";

/** Tasks now live in the "Today" work queue on the lender dashboard. */
export const Route = createFileRoute("/_authenticated/lender/tasks")({
  beforeLoad: () => {
    throw redirect({ to: "/lender", hash: "work-queue" });
  },
});
