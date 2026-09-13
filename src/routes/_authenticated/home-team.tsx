import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/lib/i18n";
import { CONNECTION_SCOPE_CHOICES } from "@/lib/professional-invitations";
import {
  listMyHomeTeamValidations,
  submitHomeTeamConnection,
  submitHomeTeamValidation,
} from "@/lib/professional-invitations.functions";

/**
 * Homeowner Home Team confirmation.
 *
 * Two deliberately separate questions:
 *   A. Is this really the professional you work with? (truth)
 *   B. Would you like to connect and share anything? (permission)
 *
 * Answering A never shares anything. Only B can create a permission, only for
 * the items the homeowner ticks, and nothing is pre-selected.
 */
export const Route = createFileRoute("/_authenticated/home-team")({
  head: () => ({
    meta: [
      { title: "Your Home Team — SuCasa" },
      {
        name: "description",
        content:
          "Confirm the professionals you work with on your home, and choose separately what you want to share.",
      },
      { property: "og:title", content: "Your Home Team — SuCasa" },
      {
        property: "og:description",
        content: "Confirm who you work with. You decide what is shared, and with whom.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HomeTeamPage,
});

const COPY = {
  en: {
    title: "Your Home Team",
    intro:
      "These are professionals we believe help with your home. Confirming simply tells us what's true — it doesn't share anything.",
    quiet: "Nothing to confirm right now.",
    quietHint: "When someone is added to your Home Team, you'll be asked here first.",
    ask: "Is this your lender?",
    yes: "Yes, that's right",
    no: "No, not my lender",
    unsure: "I'm not sure",
    thanksYes: "Thanks — confirmed",
    thanksNo: "Thanks — we've noted that",
    thanksUnsure: "Thanks — we'll leave it as it is",
    shareTitle: "Would you like to connect with them on SuCasa?",
    shareIntro:
      "This is optional and separate. Choose only what you'd like them to see. You can change your mind later.",
    connect: "Share the selected items",
    skip: "No thanks",
    noShare: "Nothing shared",
    shared: "Shared",
    privacy: "Confirming who you work with never shares your home details.",
  },
  es: {
    title: "Tu equipo del hogar",
    intro:
      "Estos son profesionales que creemos que ayudan con tu casa. Confirmar solo nos dice qué es cierto — no comparte nada.",
    quiet: "No hay nada que confirmar por ahora.",
    quietHint: "Cuando alguien se agregue a tu equipo, te preguntaremos aquí primero.",
    ask: "¿Es este tu prestamista?",
    yes: "Sí, es correcto",
    no: "No, no es mi prestamista",
    unsure: "No estoy seguro",
    thanksYes: "Gracias — confirmado",
    thanksNo: "Gracias — lo hemos anotado",
    thanksUnsure: "Gracias — lo dejamos como está",
    shareTitle: "¿Quieres conectarte con esta persona en SuCasa?",
    shareIntro:
      "Esto es opcional y aparte. Elige solo lo que quieras que vea. Puedes cambiar de opinión después.",
    connect: "Compartir lo seleccionado",
    skip: "No, gracias",
    noShare: "No se compartió nada",
    shared: "Compartido",
    privacy: "Confirmar con quién trabajas nunca comparte los datos de tu casa.",
  },
} as const;

const SCOPE_ES: Record<string, string> = {
  contact: "Mi nombre y datos de contacto",
  property_snapshot: "Datos básicos de mi casa",
  valuation: "El valor estimado de mi casa",
  mortgage: "Los detalles de mi hipoteca",
  equity: "Mi plusvalía estimada",
};

function HomeTeamPage() {
  const { language } = useLanguage();
  const c = COPY[language === "es" ? "es" : "en"];
  const qc = useQueryClient();

  const listFn = useServerFn(listMyHomeTeamValidations);
  const validateFn = useServerFn(submitHomeTeamValidation);
  const connectFn = useServerFn(submitHomeTeamConnection);

  const key = ["home-team-validations"];
  const { data } = useQuery({ queryKey: key, queryFn: () => listFn() });

  /** Per-relationship local step: the connection question only appears after a "yes". */
  const [step, setStep] = useState<Record<string, "asked" | "connect" | "done">>({});
  const [scopes, setScopes] = useState<Record<string, string[]>>({});

  const validate = useMutation({
    mutationFn: (v: { relationshipId: string; answer: "yes" | "no" | "not_sure" }) =>
      validateFn({ data: v }),
    onSuccess: (res: any, v) => {
      toast.success(
        res.recorded === "confirmed" ? c.thanksYes : res.recorded === "rejected" ? c.thanksNo : c.thanksUnsure,
      );
      setStep((s) => ({ ...s, [v.relationshipId]: res.offerConnection ? "connect" : "done" }));
      if (!res.offerConnection) qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const connect = useMutation({
    mutationFn: (v: { relationshipId: string; connect: boolean }) =>
      connectFn({
        data: {
          relationshipId: v.relationshipId,
          connect: v.connect,
          scopes: v.connect ? (scopes[v.relationshipId] ?? []) : [],
        },
      }),
    onSuccess: (res: any, v) => {
      toast.success(res.granted ? c.shared : c.noShare);
      setStep((s) => ({ ...s, [v.relationshipId]: "done" }));
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const pending = (data?.pending ?? []) as {
    relationshipId: string;
    professionalName: string;
    professionalOrg: string | null;
  }[];

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-5">
      <h1 className="text-xl font-semibold tracking-tight">{c.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{c.intro}</p>

      <div className="mt-4 rounded-2xl border border-border bg-surface-intelligence p-4">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
          <p className="text-sm text-muted-foreground">{c.privacy}</p>
        </div>
      </div>

      {pending.length === 0 ? (
        <div className="mt-5 rounded-3xl border border-border bg-card p-6 text-center">
          <Users className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">{c.quiet}</p>
          <p className="mt-1 text-xs text-muted-foreground">{c.quietHint}</p>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {pending.map((p) => {
            const s = step[p.relationshipId];
            const chosen = scopes[p.relationshipId] ?? [];
            return (
              <div key={p.relationshipId} className="rounded-3xl border border-border bg-card p-5">
                <p className="text-sm font-semibold">{p.professionalName}</p>
                {p.professionalOrg && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{p.professionalOrg}</p>
                )}

                {s === "done" ? (
                  <p className="mt-3 flex items-center gap-1.5 text-sm text-status-positive">
                    <CheckCircle2 className="h-4 w-4" /> {c.thanksYes}
                  </p>
                ) : s === "connect" ? (
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="text-sm font-medium">{c.shareTitle}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{c.shareIntro}</p>
                    <div className="mt-3 space-y-2">
                      {CONNECTION_SCOPE_CHOICES.map((opt) => (
                        <label key={opt.scope} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={chosen.includes(opt.scope)}
                            onChange={(e) =>
                              setScopes((prev) => ({
                                ...prev,
                                [p.relationshipId]: e.target.checked
                                  ? [...chosen, opt.scope]
                                  : chosen.filter((x) => x !== opt.scope),
                              }))
                            }
                            className="h-4 w-4 rounded border-border"
                          />
                          {language === "es" ? (SCOPE_ES[opt.scope] ?? opt.label) : opt.label}
                        </label>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={() => connect.mutate({ relationshipId: p.relationshipId, connect: true })}
                        disabled={chosen.length === 0 || connect.isPending}
                        className="rounded-full gradient-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        {c.connect}
                      </button>
                      <button
                        onClick={() => connect.mutate({ relationshipId: p.relationshipId, connect: false })}
                        disabled={connect.isPending}
                        className="rounded-full border border-border px-4 py-2 text-xs font-medium"
                      >
                        {c.skip}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="mt-3 text-sm">{c.ask}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => validate.mutate({ relationshipId: p.relationshipId, answer: "yes" })}
                        disabled={validate.isPending}
                        className="rounded-full gradient-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        {c.yes}
                      </button>
                      <button
                        onClick={() => validate.mutate({ relationshipId: p.relationshipId, answer: "no" })}
                        disabled={validate.isPending}
                        className="rounded-full border border-border px-4 py-2 text-xs font-medium"
                      >
                        {c.no}
                      </button>
                      <button
                        onClick={() =>
                          validate.mutate({ relationshipId: p.relationshipId, answer: "not_sure" })
                        }
                        disabled={validate.isPending}
                        className="rounded-full border border-border px-4 py-2 text-xs font-medium"
                      >
                        {c.unsure}
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
