// components/messages/message-wall.tsx
"use client";

import React, { useEffect, useRef, useMemo } from "react";
import type { UIMessage } from "ai"; // keep only for types; remove if your project doesn't expose this
import { AssistantMessage } from "./assistant-message";
import { UserMessage } from "./user-message";
import { ReasoningPart } from "./reasoning-part";

type MessageWallProps = {
  messages?: UIMessage[]; // prefer messages passed from parent
  status?: "ready" | "streaming" | "submitted" | "error";
  durations?: Record<string, number>;
  onDurationChange?: (key: string, duration: number) => void;
  // optional: allow parent to control auto-scroll behaviour
  autoScroll?: boolean;
  className?: string;
};

function stripJsonSentinelsFromText(text: string): string {
  if (!text) return text;
  // Remove known sentinel blocks from visible text
  // Patterns used by the route: __VENDOR_HITS_JSON__, __VENDOR_DETAILS_JSON__, __VENDOR_REVIEWS_JSON__, ___GUIDE_JSON___ etc.
  return text
    .replace(/__VENDOR_HITS_JSON__[\s\S]*?__END_VENDOR_HITS_JSON__/g, "")
    .replace(/__VENDOR_DETAILS_JSON__[\s\S]*?__END_VENDOR_DETAILS_JSON__/g, "")
    .replace(/__VENDOR_REVIEWS_JSON__[\s\S]*?__END_VENDOR_REVIEWS_JSON__/g, "")
    .replace(/___GUIDE_JSON___[\s\S]*?___END_GUIDE_JSON___/g, "")
    .trim();
}

/** Try to parse any embedded sentinel JSON block from a message text.
 *  Returns parsed object or null.
 */
function extractToolResultFromText(text: string): any | null {
  if (!text) return null;

  // try common sentinel patterns in the route
  const patterns = [
    { start: "__VENDOR_HITS_JSON__", end: "__END_VENDOR_HITS_JSON__" },
    { start: "__VENDOR_DETAILS_JSON__", end: "__END_VENDOR_DETAILS_JSON__" },
    { start: "__VENDOR_REVIEWS_JSON__", end: "__END_VENDOR_REVIEWS_JSON__" },
    { start: "___GUIDE_JSON___", end: "___END_GUIDE_JSON___" },
  ];

  for (const p of patterns) {
    const si = text.indexOf(p.start);
    const ei = text.indexOf(p.end);
    if (si >= 0 && ei > si) {
      const jsonStr = text.slice(si + p.start.length, ei).trim();
      try {
        return JSON.parse(jsonStr);
      } catch (e) {
        // invalid JSON — attempt safe extraction by finding first { ... }
        const firstBrace = jsonStr.indexOf("{");
        const lastBrace = jsonStr.lastIndexOf("}");
        if (firstBrace >= 0 && lastBrace > firstBrace) {
          const maybe = jsonStr.slice(firstBrace, lastBrace + 1);
          try {
            return JSON.parse(maybe);
          } catch (err) {
            return null;
          }
        }
        return null;
      }
    }
  }

  return null;
}

/** Derive a displayable plain text from message.parts while filtering sentinel parts. */
function deriveVisibleTextFromParts(parts: any[] = []): string {
  const raw = (parts || [])
    .map((p: any) => (p.type === "text" ? (p.text ?? "") : ""))
    .join("");
  return stripJsonSentinelsFromText(raw);
}

/** Attempt to get toolResult from the message parts (either as a separate part or embedded text). */
function deriveToolResultFromParts(parts: any[] = []): any | null {
  if (!parts || !parts.length) return null;

  // Some producers might add a single text part containing the sentinel block.
  const text = parts.map((p: any) => (p.type === "text" ? (p.text ?? "") : "")).join("");
  const fromText = extractToolResultFromText(text);
  if (fromText) return fromText;

  // Some systems might add a structured 'tool' part; try to find it.
  for (const p of parts) {
    if (!p) continue;
    if (p.type === "tool-result" && p.result) return p.result;
    // if metadata-like objects exist, check common keys
    if (p.type === "json" && p.json) return p.json;
    if (p.type === "data" && p.data) return p.data;
  }

  return null;
}

export function MessageWall(props: MessageWallProps) {
  const {
    messages: propMessages,
    status = "ready",
    durations = {},
    onDurationChange = () => {},
    autoScroll = true,
    className = "",
  } = props;

  // Use the messages passed explicitly. This component purposefully does NOT call useChat()
  // to avoid coupling this file to a particular hook library/version.
  const messages = propMessages ?? [];

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Combine messages with derived visible text and toolResult
  const enriched = useMemo(() => {
    return (messages || []).map((m) => {
      const parts = (m.parts || []) as any[];
      const visibleText = deriveVisibleTextFromParts(parts);
      const toolResult = deriveToolResultFromParts(parts);
      return {
        message: m,
        text: visibleText,
        toolResult,
      };
    });
  }, [messages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (!autoScroll) return;
    try {
      const el = scrollRef.current;
      if (!el) return;
      // scroll smoothly a bit delayed to allow render
      const id = window.setTimeout(() => {
        el.scrollTop = el.scrollHeight;
      }, 30);
      return () => window.clearTimeout(id);
    } catch (e) {
      // ignore
    }
  }, [enriched.length, autoScroll]);

  return (
    <div
      ref={scrollRef}
      className={`message-wall w-full overflow-auto px-6 py-6 ${className}`}
      style={{ maxHeight: "70vh" }}
      data-status={status}
    >
      <div className="space-y-6">
        {enriched.map((en, idx) => {
          const m = en.message;
          const isAssistant = m.role === "assistant" || m.role === "tool";
          const isUser = m.role === "user";
          const isReasoning = (m.metadata && m.metadata.type === "reasoning") || m.role === "system";

          // Determine if this is the last message in the list
          const isLastMessage = idx === enriched.length - 1;

          if (isAssistant) {
            return (
              <AssistantMessage
                key={(m.id as string) ?? `assistant-${idx}`}
                message={m}
                text={en.text}
                toolResult={en.toolResult}
                status={status}
                isLastMessage={isLastMessage}
                durations={durations}
                onDurationChange={onDurationChange}
              />
            );
          }

          if (isUser) {
            return (
              <UserMessage
                key={(m.id as string) ?? `user-${idx}`}
                message={m}
                text={en.text}
                // user messages rarely have toolResult — still pass for completeness
                toolResult={en.toolResult}
                isLastMessage={isLastMessage}
              />
            );
          }

          if (isReasoning) {
            return (
              <ReasoningPart
                key={(m.id as string) ?? `reasoning-${idx}`}
                message={m}
                text={en.text}
                isLastMessage={isLastMessage}
              />
            );
          }

          // Generic fallback: render as assistant message
          return (
            <AssistantMessage
              key={(m.id as string) ?? `fallback-${idx}`}
              message={m}
              text={en.text}
              toolResult={en.toolResult}
              status={status}
              isLastMessage={isLastMessage}
              durations={durations}
              onDurationChange={onDurationChange}
            />
          );
        })}
      </div>
    </div>
  );
}

export default MessageWall;
