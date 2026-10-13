import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

/**
 * Corporate email scanners open every link in an email. Sign-in emails link
 * here instead of straight to the one-time verify URL, so a scanner's visit
 * consumes nothing: the token is used only when a person presses the button.
 */
const ALLOWED_HOST = (() => {
  try { return new URL(import.meta.env.VITE_SUPABASE_URL as string).host; } catch { return ""; }
})();

function safeTarget(to: unknown): string | null {
  if (typeof to !== "string") return null;
  try {
    const u = new URL(to);
    return u.protocol === "https:" && u.host === ALLOWED_HOST && u.pathname.startsWith("/auth/v1/verify") ? u.toString() : null;
  } catch { return null; }
}

export const Route = createFileRoute("/auth_/continue")({
  validateSearch: (s: Record<string, unknown>): { to?: string; lang?: string } => ({
    to: typeof s["to"] === "string" ? (s["to"] as string) : undefined,
    lang: s["lang"] === "es" ? "es" : "en",
  }),
  head: () => ({
    meta: [
      { title: "Continue signing in · SuCasa" },
      { name: "description", content: "Confirm to continue signing in to SuCasa." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Continue signing in · SuCasa" },
      { property: "og:description", content: "Confirm to continue signing in to SuCasa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Continue,
});

function Continue() {
  const { to, lang } = Route.useSearch();
  const target = safeTarget(to);
  const es = lang === "es";
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold text-foreground">{es ? "Continúa tu inicio de sesión" : "Continue signing in"}</h1>
      {target ? (
        <>
          <p className="text-sm text-muted-foreground">{es ? "Toca el botón para terminar de iniciar sesión en SuCasa." : "Tap the button to finish signing in to SuCasa."}</p>
          <form method="get" action={target.split("?")[0]} className="contents">
            {[...new URL(target).searchParams].map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <Button type="submit" size="lg">{es ? "Iniciar sesión" : "Sign in"}</Button>
          </form>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{es ? "Este enlace no es válido. Usa el código de 6 dígitos del correo." : "This link isn't valid. Use the 6-digit code from the email instead."}</p>
      )}
    </main>
  );
}
