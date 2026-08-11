import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { getPortfolio, listMyPortfolios } from "@/lib/lender.functions";
import { ArrowLeft, Users, Mail, Upload, Handshake } from "lucide-react";

export const Route = createFileRoute("/_authenticated/lender/portfolio/$id")({
  head: () => ({
    meta: [
      { title: "Client book — SuCasa Lender" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortfolioLayout,
});

function PortfolioLayout() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getPortfolio);
  const listFn = useServerFn(listMyPortfolios);

  const { data } = useQuery({
    queryKey: ["lender-portfolio", id, 6.25],
    queryFn: () => getFn({ data: { id, benchmarkRate: 6.25 } }),
  });
  const { data: mine } = useQuery({ queryKey: ["lender-portfolios"], queryFn: () => listFn() });
  const isManager = !!mine?.isManager;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 px-5 py-8">
        <div className="mx-auto max-w-6xl space-y-5">
          {isManager && (
            <Link
              to="/lender"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary"
            >
              <ArrowLeft className="h-3 w-3" /> Team roster
            </Link>
          )}

          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {data?.portfolio.orgName ?? "Lender portal"}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              {data?.portfolio.name ?? "Client book"}
            </h1>
          </div>

          <nav className="sticky top-0 z-20 -mx-1 flex gap-1 overflow-x-auto border-b border-border bg-background/90 px-1 py-2 backdrop-blur">
            <Tab to="/lender/portfolio/$id" id={id} exact label="Clients" icon={Users} />
            <Tab to="/lender/portfolio/$id/campaigns" id={id} label="Campaigns" icon={Mail} />
            <Tab to="/lender/portfolio/$id/import" id={id} label="Add clients" icon={Upload} />
            <Tab
              to="/lender/portfolio/$id/network"
              id={id}
              label="Agent network"
              icon={Handshake}
            />
          </nav>

          <Outlet />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function Tab({
  to,
  id,
  label,
  icon: Icon,
  exact,
}: {
  to: string;
  id: string;
  label: string;
  icon: typeof Users;
  exact?: boolean;
}) {
  return (
    <Link
      to={to}
      params={{ id }}
      activeOptions={{ exact: !!exact }}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
      activeProps={{ className: "bg-primary/10 text-primary" }}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}
