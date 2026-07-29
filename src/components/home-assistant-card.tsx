import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { askAssistant } from "@/lib/assistant.functions";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
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

type Msg = { id: string; role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "When should I service my HVAC?",
  "What do my inspection findings mean?",
  "Am I a good refi candidate?",
];

export function HomeAssistantCard() {
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
      const msg = (e as Error).message || "Something went wrong.";
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
        <h2 className="text-base font-semibold">Home Assistant</h2>
        <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
          Beta
        </span>
      </div>

      <div className="mt-4 flex h-[320px] flex-col overflow-hidden rounded-2xl border border-border">
        <Conversation className="flex-1">
          <ConversationContent className="!p-3">
            {messages.length === 0 && status !== "submitted" ? (
              <ConversationEmptyState
                icon={<Home className="h-6 w-6 text-primary" />}
                title="Ask anything about your home"
                description="Maintenance, equity, inspection findings — grounded in your home's data."
              />
            ) : null}

            {messages.map((m) => (
              <Message key={m.id} from={m.role}>
                {m.role === "assistant" ? (
                  <MessageContent variant="flat" className="!bg-transparent !p-0">
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
                <MessageContent variant="flat" className="!bg-transparent !p-0">
                  <Shimmer>Thinking…</Shimmer>
                </MessageContent>
              </Message>
            ) : null}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      </div>

      {messages.length === 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              disabled={status === "submitted"}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-3">
        <PromptInput onSubmit={onSubmit}>
          <PromptInputTextarea
            ref={textareaRef}
            placeholder="Ask about your home…"
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
