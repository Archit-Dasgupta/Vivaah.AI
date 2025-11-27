// components/messages/message-wall.tsx
"use client";
import React, { useEffect, useRef, useMemo } from "react";
import type { UIMessage } from "ai";
import { AssistantMessage } from "./assistant-message";
import { UserMessage } from "./user-message";
import { ReasoningPart } from "./reasoning-part";

type MessageWallProps = {
  messages?: UIMessage[]; // optional prop (falls back to empty)
  status?: "error" | "streaming" | "submitted" | "ready";
  durations?: Record<string, number>;
  onDurationChange?: (key: string, duration: number) => void;
  className?: string;
};

export function MessageWall(props: MessageWallProps) {
  const {
    messages: propMessages,
    status: propStatus,
    durations: propDurations,
    onDurationChange,
    className,
  } = props;

  // Use prop messages only - do not import/use `useChat` to avoid missing-export errors.
  const messages = propMessages ?? [];
  const status = propStatus ?? "ready";
  const durations = propDurations ?? {};

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // scroll to bottom whenever messages length changes
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // smooth on client navigations; immediate on initial mount
    try {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } catch (e) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  // memoized rendered items for performance
  const rendered = useMemo(() => {
    return messages.map((m: UIMessage, idx: number) => {
      const role = (m.role || "assistant").toString();
      // prefer any structured tool result attached either on parts or directly (this accommodates both shapes)
      const toolResult =
        // @ts-ignore - defensive checks in case shape varies
        (m as any).toolResult ?? (m.parts?.find?.((p: any) => p.type === "tool-result") as any)?.result ?? null;

      // Some assistant messages may include a 'reasoning' or 'chain-of-thought' part; render it optionally
      const reasoningPart =
        // naive detection: a part with type 'reasoning' or a named tool result
        (m.parts && m.parts.find && m.parts.find((p: any) => p.type === "reasoning")) ?? null;

      if (role === "user") {
        return <UserMessage key={m.id ?? idx} message={m} />;
      }

      // default: assistant message
      return (
        <AssistantMessage
          key={m.id ?? idx}
          message={m}
          // pass text (some components expect it)
          text={(m.parts || []).map((p: any) => (p.type === "text" ? p.text : "")).join("")}
          // pass through any detected toolResult so UI can render cards/panels
          toolResult={toolResult}
        />
      );
    });
  }, [messages]);

  return (
    <div
      ref={scrollRef}
      className={`message-wall max-h-[60vh] overflow-y-auto pr-4 ${className ?? ""}`}
      aria-live="polite"
    >
      <div className="space-y-4 p-4">
        {rendered.length > 0 ? (
          rendered
        ) : (
          <div className="text-muted-foreground text-sm px-2 py-6">
            No messages yet. Start the conversation.
          </div>
        )}

        {/* optional status indicator */}
        {status === "streaming" && (
          <div className="text-sm text-gray-500 px-2 py-2">Streaming…</div>
        )}
        {status === "error" && (
          <div className="text-sm text-red-600 px-2 py-2">There was an error.</div>
        )}
      </div>
    </div>
  );
}

export default MessageWall;
