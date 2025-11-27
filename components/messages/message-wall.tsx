// components/messages/message-wall.tsx
"use client";
import React, { useEffect, useRef, useMemo } from "react";
import { useChat } from "@ai-sdk/react"; // correct hook source
import type { UIMessage } from "ai";
import { AssistantMessage } from "./assistant-message";
import { UserMessage } from "./user-message";

type MessageWallProps = {
  messages?: UIMessage[]; // optional — if provided, will be used
  status?: "error" | "streaming" | "submitted" | "ready";
  durations?: Record<string, number>;
  onDurationChange?: (key: string, duration: number) => void;
};

/**
 * MessageWall
 * - Accepts optional props (compatible with earlier page.tsx)
 * - Falls back to useChat() when props are not passed
 * - Does not print raw JSON sentinels into visible chat text
 */
export function MessageWall(props: MessageWallProps) {
  // Prefer props if caller passed messages/status (keeps backwards compatibility)
  const chat = useChat();
  const messages = props.messages ?? (chat?.messages ?? []);
  const status = props.status ?? (chat?.status ?? "ready");
  const onDurationChange = props.onDurationChange ?? chat?.onDurationChange;
  const durations = props.durations ?? chat?.durations ?? {};

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const renderedMessages = useMemo(() => (messages || []).slice(), [messages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // scroll after frame so layout is stable
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [renderedMessages.length]);

  return (
    <div className="message-wall h-full flex flex-col">
      <div
        ref={scrollRef}
        className="messages flex-1 overflow-auto px-4 py-3 space-y-4"
        data-testid="message-wall-scroll"
      >
        {renderedMessages.map((m: UIMessage, i: number) => {
          const role = m.role ?? "assistant";

          // assemble plaintext from text parts
          const textParts = (m.parts || [])
            .filter((p: any) => p.type === "text")
            .map((p: any) => p.text ?? "")
            .join("");

          // detect tool-result parts (some SDKs send them as parts; keep defensive)
          const toolPart = (m.parts || []).find((p: any) => p.type === "tool-result" || p.type === "json" || p.type === "tool");
          const toolResult = toolPart ? (toolPart.content ?? toolPart.value ?? toolPart) : null;

          if (role === "user") {
            return <UserMessage key={m.id ?? i} message={m} text={textParts} />;
          } else {
            // Assistant message gets text and toolResult payload (if any)
            return (
              <AssistantMessage
                key={m.id ?? i}
                message={m}
                text={textParts}
                toolResult={toolResult}
              />
            );
          }
        })}
      </div>

      <div className="chat-status px-4 py-2 border-t text-sm text-muted-foreground">
        <div className="flex items-center justify-between">
          <div>
            {status === "streaming" && <span>Assistant is typing…</span>}
            {status === "error" && <span className="text-red-500">Error</span>}
            {status === "ready" && <span>Connected</span>}
            {status === "submitted" && <span>Sending…</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => (chat?.clear ? chat.clear() : undefined)}
              className="text-xs underline"
              title="Clear chat"
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
