import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/home-plan")({
  ssr: false,
  beforeLoad: () => {
    throw redirect({ to: "/home-care" });
  },
  component: () => null,
});
