import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import logoAsset from "@/assets/sucasa-logo.png.asset.json";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const links = [
    { to: "/services", label: "Services" },
    { to: "/partner", label: "For Pros" },
    { to: "/dashboard", label: "Dashboard" },
  ] as const;
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link to="/" className="flex items-center gap-2" aria-label="SuCasa home">
          <img src={logoAsset.url} alt="SuCasa" className="h-8 w-auto" />
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {links.map(l => (
            <Link key={l.to} to={l.to} className="rounded-full px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" activeProps={{ className: "text-foreground bg-secondary" }}>
              {l.label}
            </Link>
          ))}
          <Link to="/onboarding" className="ml-2 rounded-full gradient-brand px-4 py-2 text-sm font-medium text-white shadow-soft">
            Get Started
          </Link>
        </nav>
        <button onClick={() => setOpen(v => !v)} className="grid h-10 w-10 place-items-center rounded-full border border-border md:hidden" aria-label="Toggle menu">
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>
      {open && (
        <div className="border-t border-border bg-background md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 p-4">
            {links.map(l => (
              <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="rounded-xl px-4 py-3 text-sm text-foreground hover:bg-secondary">
                {l.label}
              </Link>
            ))}
            <Link to="/onboarding" onClick={() => setOpen(false)} className="mt-2 rounded-xl gradient-brand px-4 py-3 text-center text-sm font-medium text-white">
              Create Free Home Profile
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl gradient-brand text-white"><Home className="h-4 w-4" /></span>
            <span className="text-lg font-semibold">SuCasa</span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">The trusted operating system for homeownership.</p>
        </div>
        <FooterCol title="Homeowners" links={[["Create Profile", "/onboarding"], ["Dashboard", "/dashboard"], ["Request Service", "/request"]]} />
        <FooterCol title="Professionals" links={[["Become a Partner", "/partner"], ["Pro Dashboard", "/pro"]]} />
        <FooterCol title="Company" links={[["Services", "/services"], ["Admin", "/admin"]]} />
      </div>
      <div className="border-t border-border py-6 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} SuCasa. All rights reserved.</div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      <ul className="mt-3 space-y-2">
        {links.map(([label, href]) => (
          <li key={href}><Link to={href} className="text-sm text-muted-foreground hover:text-foreground">{label}</Link></li>
        ))}
      </ul>
    </div>
  );
}
