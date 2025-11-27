// app/components/messages/message-wall.tsx
// @ts-nocheck
import React, { useEffect, useMemo, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { UIMessage } from "ai";

import { AssistantMessage } from "./assistant-message";
import { UserMessage } from "./user-message";
import { ReasoningPart } from "./reasoning-part";

/**
 * MessageWall
 *
 * - Renders messages from useChat()
 * - Exports a named MessageWall (and default) so imports like:
 *     import { MessageWall } from "@/components/messages/message-wall";
 *   will work without errors.
 *
 * This file intentionally keeps rendering logic simple so the UI can rely
 * on structured "tool-result" events to render cards (no raw JSON dumped into chat).
 */

export function MessageWall() {
  const { messages, status, durations = {}, onDurationsChange } = useChat() as {
    messages: UIMessage[];
    status?: string;
    durations?: Record<string, number>;
    onDurationsChange?: (k: string, v: number) => void;
  };

  const containerRef = useRef<HTMLDivElement | null>(null);

  // auto-scroll to bottom on new messages
  useEffect(() => {
    try {
      if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    } catch (e) {
      // fail silently
    }
  }, [messages?.length]);

  const rendered = useMemo(() => {
    if (!Array.isArray(messages)) return null;

    return messages.map((m: UIMessage, idx: number) => {
      const isLastMessage = idx === messages.length - 1;
      const role = m.role ?? "assistant";

      // find last part index for streaming detection
      const lastPartIndex = (m.parts?.length ?? 1) - 1;
      const durationKey = `${m.id}-${lastPartIndex}`;
      const duration = durations?.[durationKey];

      if (role === "user") {
        return (
          <div key={m.id} className="my-4">
            <UserMessage message={m} />
          </div>
        );
      }

      // assistant or system messages
      return (
        <div key={m.id} className="my-4">
          <AssistantMessage
            message={m}
            status={status}
            isLastMessage={isLastMessage}
            durations={durations}
            onDurationChange={
              onDurationsChange ? (key: string, d: number) => onDurationsChange(key, d) : undefined
            }
          />
          {/* Optional: show reasoning part if present as its own block */}
          {m.parts?.map((p: any, i: number) =>
            p?.type === "reasoning" ? (
              <div key={`${m.id}-r-${i}`} className="mt-2">
                <ReasoningPart
                  part={p}
                  isStreaming={status === "streaming" && isLastMessage && i === lastPartIndex}
                  duration={durations?.[`${m.id}-${i}`]}
                  onDurationChange={onDurationsChange ? (d) => onDurationsChange(`${m.id}-${i}`, d) : undefined}
                />
              </div>
            ) : null
          )}
        </div>
      );
    });
  }, [messages, status, durations, onDurationsChange]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-auto px-6 py-6"
      style={{ WebkitOverflowScrolling: "touch" }}
      data-testid="message-wall"
    >
      <div className="max-w-4xl mx-auto">
        {rendered ?? <div className="text-sm text-gray-500">No messages yet — start the chat.</div>}
      </div>
    </div>
  );
}

export default MessageWall;
