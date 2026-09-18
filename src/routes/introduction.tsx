import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CheckCircle2, Mail, MessageSquare, Phone, ShieldCheck } from "lucide-react";
import {
  answerIntroductionLink,
  readIntroductionLink,
  withdrawIntroductionPermission,
} from "@/lib/introductions.functions";
import { consentDisclosure, type IntroductionChannel } from "@/lib/introductions";
import { useLanguage } from "@/lib/i18n";

/**
 * The homeowner's decision page. Public and token-mediated: no SuCasa account
 * is required, and nothing about the homeowner has been shared with the lender
 * before this page is answered.
 *
 * Two separate questions, in order: do you want this connection at all, and —
 * only if yes — which ways may this specific company contact you.
 */
export const Route = createFileRoute("/introduction")({
  validateSearch: z.object({ t: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "An introduction request — SuCasa" },
      {
        name: "description",
        content:
          "Someone would like to introduce you for a financing conversation. Accepting is optional.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: IntroductionPage,
});

const COPY = {
  en: {
    loading: "Opening your request…",
    badLink: "This link is no longer valid",
    badLinkHint:
      "It may have expired, already been used, or been withdrawn. Nothing has been shared, and nothing is needed from you.",
    optional: "Accepting is optional",
    yes: "Yes, connect me",
    no: "No thanks",
    how: "How may they contact you?",
    channels: { call: "Call me", text: "Text me", email: "Email me" },
    pick: "Choose at least one way to be contacted.",
    connect: "Connect me",
    declined: "Thanks — nothing was shared",
    declinedBody:
      "We let your agent know you'd rather not connect. Nothing about you was shared, and this changes nothing about your SuCasa account or your relationship with your agent.",
    accepted: "You're connected",
    acceptedBody:
      "We shared only your name and the ways you chose to be contacted. Your property, value, equity, mortgage, documents and maintenance history were not shared.",
    withdraw: "Withdraw this permission",
    withdrawn: "Permission withdrawn. We've asked them to stop contacting you about this.",
    footer:
      "Saying no, or doing nothing, changes nothing about your SuCasa account, your agent relationship, or any other service.",
    nothingShared: "Nothing about you has been shared yet.",
  },
  es: {
    loading: "Abriendo su solicitud…",
    badLink: "Este enlace ya no es válido",
    badLinkHint:
      "Puede haber expirado, ya haberse usado o haberse retirado. No se compartió nada y no necesitamos nada de usted.",
    optional: "Aceptar es opcional",
    yes: "Sí, conéctame",
    no: "No, gracias",
    how: "¿Cómo pueden comunicarse con usted?",
    channels: { call: "Llamarme", text: "Enviarme mensajes de texto", email: "Enviarme correo" },
    pick: "Elija al menos una forma de contacto.",
    connect: "Conéctame",
    declined: "Gracias: no se compartió nada",
    declinedBody:
      "Le informamos a su agente que prefiere no conectarse. No se compartió nada sobre usted y esto no cambia su cuenta de SuCasa ni su relación con su agente.",
    accepted: "Ya está conectado",
    acceptedBody:
      "Compartimos solo su nombre y las formas de contacto que eligió. No se compartió su propiedad, valor, plusvalía, hipoteca, documentos ni historial de mantenimiento.",
    withdraw: "Retirar este permiso",
    withdrawn: "Permiso retirado. Les pedimos que dejen de comunicarse con usted sobre esto.",
    footer:
      "Decir no, o no hacer nada, no cambia su cuenta de SuCasa, su relación con su agente ni ningún otro servicio.",
    nothingShared: "Todavía no se ha compartido nada sobre usted.",
  },
} as const;

function IntroductionPage() {
  const { t: token } = Route.useSearch();
  const { language, setLanguage } = useLanguage();
  const lang = language === "es" ? "es" : "en";
  const c = COPY[lang];

  const readFn = useServerFn(readIntroductionLink);
  const answerFn = useServerFn(answerIntroductionLink);
  const withdrawFn = useServerFn(withdrawIntroductionPermission);

  const [step, setStep] = useState<"ask" | "channels" | "declined" | "accepted" | "withdrawn">(
    "ask",
  );
  const [channels, setChannels] = useState<IntroductionChannel[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["introduction-link", token],
    queryFn: () => readFn({ data: { token: token! } }),
    enabled: !!token,
    retry: false,
  });

  const invite = data?.ok ? data : null;

  useEffect(() => {
    if (invite?.alreadyAnswered === "accepted") setStep("accepted");
    if (invite?.alreadyAnswered === "declined") setStep("declined");
  }, [invite?.alreadyAnswered]);

  const answer = useMutation({
    mutationFn: (v: { decision: "accepted" | "declined" }) =>
      answerFn({
        data: { token: token!, decision: v.decision, channels, language: lang },
      }),
    onSuccess: (r: any) => {
      if (!r.ok) {
        setError(r.reason === "no_channel" ? c.pick : c.badLinkHint);
        return;
      }
      setStep(r.decision === "accepted" ? "accepted" : "declined");
    },
    onError: (e: any) => setError(e.message),
  });

  const withdraw = useMutation({
    mutationFn: () =>
      withdrawFn({ data: { token: token!, channels: [], scope: "this_lender" } }),
    onSuccess: () => setStep("withdrawn"),
    onError: (e: any) => setError(e.message),
  });

  const available = useMemo<IntroductionChannel[]>(() => {
    if (!invite) return [];
    const out: IntroductionChannel[] = [];
    if (invite.phone) out.push("call", "text");
    if (invite.email) out.push("email");
    return out;
  }, [invite]);

  const disclosure = invite
    ? consentDisclosure({
        lenderOrgName: invite.lenderOrgName,
        lenderContactName: invite.lenderContactName,
        phone: invite.phone,
        email: invite.email,
        channels,
        language: lang,
      })
    : "";

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-semibold tracking-tight">SuCasa</span>
          <div className="flex gap-1 text-xs">
            {(["en", "es"] as const).map((l) => (
              <button
                key={l}
                onClick={() => void setLanguage(l)}
                className={`rounded-full border px-2 py-0.5 ${
                  lang === l ? "border-foreground font-semibold" : "border-border text-muted-foreground"
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
          {!token || isError || (data && !data.ok) ? (
            <>
              <h1 className="text-xl font-semibold tracking-tight">{c.badLink}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{c.badLinkHint}</p>
            </>
          ) : isLoading || !invite ? (
            <p className="text-sm text-muted-foreground">{c.loading}</p>
          ) : step === "accepted" ? (
            <>
              <CheckCircle2 className="h-6 w-6 text-status-positive" />
              <h1 className="mt-2 text-xl font-semibold tracking-tight">{c.accepted}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{c.acceptedBody}</p>
              <button
                onClick={() => withdraw.mutate()}
                disabled={withdraw.isPending}
                className="mt-4 rounded-full border border-border px-4 py-2 text-xs font-medium hover:bg-muted disabled:opacity-60"
              >
                {c.withdraw}
              </button>
            </>
          ) : step === "withdrawn" ? (
            <>
              <ShieldCheck className="h-6 w-6 text-status-positive" />
              <h1 className="mt-2 text-xl font-semibold tracking-tight">{c.withdrawn}</h1>
            </>
          ) : step === "declined" ? (
            <>
              <h1 className="text-xl font-semibold tracking-tight">{c.declined}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{c.declinedBody}</p>
            </>
          ) : step === "ask" ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {c.optional}
              </p>
              <h1 className="mt-2 text-xl font-semibold tracking-tight">
                {lang === "es"
                  ? `¿Le gustaría conectarse con ${invite.lenderOrgName}?`
                  : `Would you like to connect with ${invite.lenderOrgName}?`}
              </h1>
              <p className="mt-3 text-sm text-muted-foreground">
                {lang === "es"
                  ? `${invite.agentOrgName} quisiera presentarle a ${
                      invite.lenderContactName
                        ? `${invite.lenderContactName} de ${invite.lenderOrgName}`
                        : invite.lenderOrgName
                    } para una conversación sobre ${invite.categoryLabel.toLowerCase()} que podría ser relevante para su casa. No hay ninguna obligación de continuar.`
                  : `${invite.agentOrgName} would like to introduce you to ${
                      invite.lenderContactName
                        ? `${invite.lenderContactName} at ${invite.lenderOrgName}`
                        : invite.lenderOrgName
                    } for a conversation about ${invite.categoryLabel.toLowerCase()} that may be relevant to your home. There's no obligation to proceed.`}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">{c.nothingShared}</p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={() => setStep("channels")}
                  className="rounded-full gradient-brand px-5 py-2.5 text-sm font-semibold text-white"
                >
                  {c.yes}
                </button>
                <button
                  onClick={() => answer.mutate({ decision: "declined" })}
                  disabled={answer.isPending}
                  className="rounded-full border border-border px-5 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-60"
                >
                  {c.no}
                </button>
              </div>
              <p className="mt-4 text-[11px] text-muted-foreground">{c.footer}</p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold tracking-tight">{c.how}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {invite.lenderContactName
                  ? `${invite.lenderContactName} · ${invite.lenderOrgName}`
                  : invite.lenderOrgName}
              </p>
              <div className="mt-4 space-y-2">
                {available.map((ch) => {
                  const Icon = ch === "email" ? Mail : ch === "text" ? MessageSquare : Phone;
                  const value = ch === "email" ? invite.email : invite.phone;
                  return (
                    <label
                      key={ch}
                      className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border p-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={channels.includes(ch)}
                        onChange={(e) =>
                          setChannels((prev) =>
                            e.target.checked ? [...prev, ch] : prev.filter((x) => x !== ch),
                          )
                        }
                      />
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span>
                        <span className="font-medium">{c.channels[ch]}</span>
                        <span className="block text-xs text-muted-foreground">{value}</span>
                      </span>
                    </label>
                  );
                })}
              </div>

              {/* Clear and conspicuous, immediately next to the acceptance control. */}
              <p className="mt-4 rounded-2xl border border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
                {disclosure}
              </p>

              {error && <p className="mt-3 text-xs text-status-negative">{error}</p>}

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={() => answer.mutate({ decision: "accepted" })}
                  disabled={answer.isPending || channels.length === 0}
                  className="rounded-full gradient-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {c.connect}
                </button>
                <button
                  onClick={() => answer.mutate({ decision: "declined" })}
                  disabled={answer.isPending}
                  className="rounded-full border border-border px-5 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-60"
                >
                  {c.no}
                </button>
              </div>
              <p className="mt-4 text-[11px] text-muted-foreground">{c.footer}</p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
