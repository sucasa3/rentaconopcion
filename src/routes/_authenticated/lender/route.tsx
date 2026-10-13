import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getMyWorkspace } from "@/lib/business.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/lender")({
  ssr: false,
  // Accounts without a lender workspace go to their own home instead of an empty lender shell.
  beforeLoad: async () => {
    const ws = await getMyWorkspace();
    if (!ws.isLender && !ws.isAdmin) {
      // Officers paused by a seat reduction still see their paused-access message.
      const { data: paused } = await supabase.from("lender_suspended_members").select("id").limit(1);
      if (paused?.length) return;
      throw redirect({ to: ws.isAgent ? "/agent" : "/dashboard", replace: true });
    }
  },
  component: () => <Outlet />,
});
