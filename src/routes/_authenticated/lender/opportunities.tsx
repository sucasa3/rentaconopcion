import { createFileRoute, redirect } from "@tanstack/react-router";

/** Opportunities are now part of the "Today" work queue on the lender dashboard. */
export const Route = createFileRoute("/_authenticated/lender/opportunities")({
  beforeLoad: () => {
    throw redirect({ to: "/lender", hash: "work-queue" });
  },
});
