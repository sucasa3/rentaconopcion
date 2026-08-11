import { createFileRoute } from "@tanstack/react-router";
import { LenderNetworkWorkspace } from "@/components/lender-network-workspace";

export const Route = createFileRoute("/_authenticated/lender/portfolio/$id/network")({
  head: () => ({
    meta: [
      { title: "Agent network — SuCasa Lender" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <LenderNetworkWorkspace />,
});
