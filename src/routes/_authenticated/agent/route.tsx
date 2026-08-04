import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/agent")({
  ssr: false,
  component: () => <Outlet />,
});
