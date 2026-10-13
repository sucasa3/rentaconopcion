import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/lib/i18n";

/**
 * Email ownership check for professional workspaces. A code (or the link in the
 * same email) creates a fresh session the server recognizes as verified.
 */
export function ProEmailVerify({ email, redirectTo, onVerified }: { email: string; redirectTo: string; onVerified: () => void }) {
  const { t } = useLanguage();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
    });
    setBusy(false);
    if (e) setError(e.message);
    else setSent(true);
  }

  async function verify(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
    setBusy(false);
    if (e) setError(t("pro.verify_bad"));
    else onVerified();
  }

  return (
    <div className="mt-5 space-y-4">
      <Mail className="mx-auto h-10 w-10 text-primary" />
      <h3 className="text-center font-semibold text-foreground">{t("pro.verify_title")}</h3>
      <p className="text-center text-sm text-muted-foreground">
        {sent ? t("pro.verify_sent", { email }) : t("pro.verify_body", { email })}
      </p>
      {sent ? (
        <form onSubmit={verify} className="space-y-3">
          <label className="block text-sm font-medium text-foreground">
            {t("pro.verify_code")}
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3 text-center text-lg tracking-widest text-foreground"
            />
          </label>
          <Button type="submit" className="min-h-12 w-full" disabled={busy || code.length < 6}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("pro.verify_submit")}
          </Button>
          <button type="button" className="w-full text-sm font-medium text-primary underline" disabled={busy} onClick={send}>
            {t("pro.verify_resend")}
          </button>
        </form>
      ) : (
        <Button type="button" className="min-h-12 w-full" disabled={busy} onClick={send}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {t("pro.verify_send")}
        </Button>
      )}
      <p className="text-center text-xs text-muted-foreground">{t("pro.verify_google")}</p>
      {error ? <p role="alert" className="text-sm text-status-attention">{error}</p> : null}
    </div>
  );
}
