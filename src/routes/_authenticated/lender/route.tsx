import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getMyWorkspace } from "@/lib/business.functions";

export const Route = createFileRoute("/_authenticated/lender")({
  ssr: false,
  // Accounts without a lender workspace go to their own home instead of an empty lender shell.
  beforeLoad: async () => {
    const ws = await getMyWorkspace();
    if (!ws.isLender && !ws.isAdmin) {
      throw redirect({ to: ws.isAgent ? "/agent" : "/dashboard", replace: true });
    }
  },
  component: () => <Outlet />,
});
