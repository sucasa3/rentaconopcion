import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Menu, X } from "lucide-react";
import logoAsset from "@/assets/sucasa-logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { IDX_BASE_URL } from "@/lib/site-urls";
import { useLanguage } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const navigate = useNavigate();
  const { t } = useLanguage();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  const links = [
    { to: "/services", label: t("pub.nav.services") },
    { to: "/partner", label: t("pub.nav.for_pros") },
    { to: "/lenders", label: t("pub.nav.for_lenders") },
    { to: "/agents", label: t("pub.nav.for_agents") },
    { to: "/dashboard", label: t("pub.nav.my_home") },
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
          <a href={IDX_BASE_URL} target="_blank" rel="noopener noreferrer" className="rounded-full px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
            {t("pub.nav.browse_homes")}
          </a>
          <LanguageSwitcher compact className="ml-1" />
          {session ? (
            <button onClick={signOut} className="ml-2 rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-secondary">
              {t("pub.nav.sign_out")}
            </button>
          ) : (
            <>
              <Link to="/auth" className="ml-2 rounded-full px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary">
                {t("pub.nav.sign_in")}
              </Link>
              <Link to="/onboarding" className="rounded-full gradient-brand px-4 py-2 text-sm font-medium text-white shadow-soft">
                {t("pub.nav.get_started")}
              </Link>
            </>
          )}
        </nav>
        <div className="flex items-center gap-2 md:hidden">
          <LanguageSwitcher compact />
          <button onClick={() => setOpen(v => !v)} className="grid h-10 w-10 place-items-center rounded-full border border-border" aria-label={t("pub.nav.toggle_menu")}>
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-border bg-background md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 p-4">
            {links.map(l => (
              <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="rounded-xl px-4 py-3 text-sm text-foreground hover:bg-secondary">
                {l.label}
              </Link>
            ))}
            <a href={IDX_BASE_URL} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className="rounded-xl px-4 py-3 text-sm text-foreground hover:bg-secondary">
              {t("pub.nav.browse_homes")}
            </a>
            {session ? (
              <button onClick={() => { setOpen(false); signOut(); }} className="mt-2 rounded-xl border border-border px-4 py-3 text-center text-sm font-medium">
                {t("pub.nav.sign_out")}
              </button>
            ) : (
              <>
                <Link to="/auth" onClick={() => setOpen(false)} className="rounded-xl px-4 py-3 text-center text-sm font-medium">
                  {t("pub.nav.sign_in")}
                </Link>
                <Link to="/onboarding" onClick={() => setOpen(false)} className="mt-1 rounded-xl gradient-brand px-4 py-3 text-center text-sm font-medium text-white">
                  {t("pub.nav.create_profile")}
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

export function SiteFooter({ professionalExtra }: { professionalExtra?: ReactNode } = {}) {
  const { t } = useLanguage();
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 md:grid-cols-4">
        <div>
          <img src={logoAsset.url} alt="SuCasa" className="h-8 w-auto" />
          <p className="mt-3 text-sm text-muted-foreground">{t("pub.footer.tagline")}</p>
        </div>
        <FooterCol title={t("pub.footer.homeowners")} links={[[t("pub.nav.browse_homes"), IDX_BASE_URL], [t("pub.footer.create_profile"), "/onboarding"], [t("pub.nav.my_home"), "/dashboard"], [t("pub.footer.request_service"), "/request"]]} />
        <div>
          <FooterCol title={t("pub.footer.professionals")} links={[[t("pub.footer.for_agents"), "/agents"], [t("pub.footer.agent_pricing"), "/agents/pricing"], [t("pub.footer.agent_deck"), "/agents/deck"], [t("pub.footer.for_lenders"), "/lenders"], [t("pub.footer.lender_pricing"), "/lenders/pricing"], [t("pub.footer.lender_deck"), "/lenders/deck"], [t("pub.footer.become_partner"), "/partner"], [t("pub.footer.pro_dashboard"), "/pro"]]} />
          {professionalExtra && <div className="mt-2">{professionalExtra}</div>}
        </div>
        <FooterCol title={t("pub.footer.company")} links={[[t("pub.nav.services"), "/services"], [t("pub.nav.sign_in"), "/auth"]]} />
      </div>
      <div className="border-t border-border py-6 text-center text-xs text-muted-foreground">{t("pub.footer.rights", { year: new Date().getFullYear() })}</div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      <ul className="mt-3 space-y-2">
        {links.map(([label, href]) => (
          <li key={href}>
            {href.startsWith("http") ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground">{label}</a>
            ) : (
              <Link to={href} className="text-sm text-muted-foreground hover:text-foreground">{label}</Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
