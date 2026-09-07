import { useState } from "react";
import { Info, Mail, MessageSquare, Phone } from "lucide-react";
import {
  CHANNEL_LABEL,
  blockedChannels,
  permittedChannels,
  type ChannelOption,
  type ContactChannel,
} from "@/lib/contact-channels";

const ICON = { call: Phone, text: MessageSquare, email: Mail };

/**
 * Renders the server's channel decision. It never decides anything itself:
 * available channels come from trusted server logic, the recommended one is
 * simply styled as primary, and blocked channels explain themselves on tap.
 */
export function ChannelActions({
  options,
  phone,
  email,
  size = "md",
  onAct,
  emailHref,
  onEmail,
  children,
}: {
  options: ChannelOption[];
  phone: string | null;
  email: string | null;
  size?: "sm" | "md";
  /** Called when the professional taps a channel — used for outcome logging. */
  onAct: (channel: ContactChannel) => void;
  /** mailto link; when omitted, onEmail is used instead (compose dialog). */
  emailHref?: string;
  onEmail?: () => void;
  children?: React.ReactNode;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const allowed = permittedChannels(options);
  const blocked = blockedChannels(options);

  const pad = size === "sm" ? "px-4 py-2 text-sm" : "min-h-[44px] px-5 text-sm";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {allowed.map((opt) => {
          const Icon = ICON[opt.channel];
          const cls = `inline-flex items-center gap-1.5 rounded-full font-semibold transition active:scale-95 ${pad} ${
            opt.recommended
              ? "bg-primary text-primary-foreground shadow-soft"
              : "border border-border/70 text-foreground"
          }`;
          if (opt.channel === "email") {
            return onEmail && !emailHref ? (
              <button key="email" type="button" onClick={onEmail} className={cls}>
                <Icon className="h-4 w-4" /> Write email
              </button>
            ) : (
              <a
                key="email"
                href={emailHref ?? `mailto:${email ?? ""}`}
                onClick={() => onAct("email")}
                className={cls}
              >
                <Icon className="h-4 w-4" /> Email
              </a>
            );
          }
          return (
            <a
              key={opt.channel}
              href={`${opt.channel === "call" ? "tel" : "sms"}:${phone ?? ""}`}
              onClick={() => onAct(opt.channel)}
              className={cls}
            >
              <Icon className="h-4 w-4" /> {CHANNEL_LABEL[opt.channel]}
            </a>
          );
        })}
        {children}
      </div>

      {blocked.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowWhy((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
          >
            <Info className="h-3.5 w-3.5" />
            {allowed.length === 0
              ? "No way to reach this homeowner yet — why?"
              : `Why not ${blocked.map((b) => CHANNEL_LABEL[b.channel].toLowerCase()).join(" or ")}?`}
          </button>
          {showWhy && (
            <ul className="mt-1.5 space-y-1 rounded-2xl bg-secondary/50 p-3 text-xs text-muted-foreground">
              {blocked.map((b) => (
                <li key={b.channel}>
                  <span className="font-medium text-foreground">{CHANNEL_LABEL[b.channel]}:</span>{" "}
                  {b.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
