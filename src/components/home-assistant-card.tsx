import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { askAssistant } from "@/lib/assistant.functions";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Home } from "lucide-react";
import { useT, type TranslationKey } from "@/lib/i18n";

type Msg = { id: string; role: "user" | "assistant"; content: string };

const SUGGESTION_KEYS: TranslationKey[] = [
  "assistant.suggestion.hvac",
  "assistant.suggestion.findings",
  "assistant.suggestion.refi",
];

export function HomeAssistantCard() {
  const t = useT();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [status, setStatus] = useState<"ready" | "submitted" | "error">("ready");
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const askFn = useServerFn(askAssistant);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || status === "submitted") return;
    setError(null);
    setStatus("submitted");
    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", content: question };
    setMessages((prev) => [...prev, userMsg]);
    try {
      const { answer } = await askFn({ data: { question } });
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: answer },
      ]);
      setStatus("ready");
    } catch (e) {
      const msg = (e as Error).message || t("assistant.error");
      setError(msg);
      setStatus("error");
    } finally {
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  };

  const onSubmit = (m: PromptInputMessage) => {
    void send(m.text);
  };

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{t("assistant.title")}</h2>
        <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
          {t("assistant.beta")}
        </span>
      </div>

      {messages.length === 0 && status !== "submitted" ? (
        <>
          <div className="mt-4 rounded-2xl gradient-brand p-5 text-white">
            <div className="flex items-center gap-2 text-xs opacity-80">
              <Home className="h-3.5 w-3.5" /> {t("assistant.ask_anything")}
            </div>
            <p className="mt-2 text-sm">{t("assistant.example")}</p>
          </div>
          <div className="mt-3 space-y-2">
            {SUGGESTION_KEYS.map((key) => (
              <button
                key={key}
                onClick={() => send(t(key))}
                className="w-full rounded-2xl border border-border p-3 text-left text-sm hover:bg-secondary"
              >
                {t(key)}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-4 flex h-[320px] flex-col overflow-hidden rounded-2xl border border-border">
          <Conversation className="flex-1">
            <ConversationContent className="!p-3">
              {messages.map((m) => (
                <Message key={m.id} from={m.role}>
                  {m.role === "assistant" ? (
                    <MessageContent className="!bg-transparent !p-0">
                      <MessageResponse>{m.content}</MessageResponse>
                    </MessageContent>
                  ) : (
                    <MessageContent className="!bg-primary !text-primary-foreground">
                      {m.content}
                    </MessageContent>
                  )}
                </Message>
              ))}

              {status === "submitted" ? (
                <Message from="assistant">
                  <MessageContent className="!bg-transparent !p-0">
                    <Shimmer>{t("assistant.thinking")}</Shimmer>
                  </MessageContent>
                </Message>
              ) : null}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
        </div>
      )}

      {error ? (
        <p className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-3">
        <PromptInput onSubmit={onSubmit}>
          <PromptInputTextarea
            ref={textareaRef}
            placeholder={t("assistant.placeholder")}
            disabled={status === "submitted"}
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status === "submitted" ? "submitted" : undefined} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
