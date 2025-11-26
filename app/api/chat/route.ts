import {
  streamText,
  UIMessage,
  convertToModelMessages,
  stepCountIs,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from 'ai';

import { MODEL } from '@/config';
import { SYSTEM_PROMPT } from '@/prompts';
import { isContentFlagged } from '@/lib/moderation';
import { webSearch } from './tools/web-search';
import { vectorDatabaseSearch } from './tools/search-vector-database';

export const maxDuration = 30;

/* ============== HELPERS ============== */

function getLatestUserText(messages: UIMessage[]): string | null {
  const latestUserMessage = messages
    .filter((msg) => msg.role === 'user')
    .pop();

  if (!latestUserMessage) return null;

  const textParts = latestUserMessage.parts
    .filter((part) => part.type === 'text')
    .map((part) => ('text' in part ? part.text : ''))
    .join('');

  return textParts || null;
}

function isVendorQuery(text: string | null): boolean {
  if (!text) return false;
  const t = text.toLowerCase();

  const vendorKeywords = [
    'vendor',
    'vendors',
    'caterer',
    'caterers',
    'venue',
    'venues',
    'wedding',
    'photographer',
    'photographers',
    'makeup',
    'decorator',
    'decor',
    'dj',
    'banquet',
  ];
  const cityKeywords = ['mumbai', 'bombay'];

  return (
    vendorKeywords.some((k) => t.includes(k)) ||
    cityKeywords.some((c) => t.includes(c))
  );
}

/* ============== MAIN HANDLER ============== */

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const latestUserText = getLatestUserText(messages) ?? '';

  // ---------- Moderation ----------
  if (latestUserText) {
    const moderationResult = await isContentFlagged(latestUserText);

    if (moderationResult.flagged) {
      const stream = createUIMessageStream({
        execute({ writer }) {
          const textId = 'moderation-denial-text';

          writer.write({ type: 'start' });

          writer.write({
            type: 'text-start',
            id: textId,
          });

          writer.write({
            type: 'text-delta',
            id: textId,
            delta:
              moderationResult.denialMessage ||
              "Your message violates our guidelines. I can't answer that.",
          });

          writer.write({
            type: 'text-end',
            id: textId,
          });

          writer.write({ type: 'finish' });
        },
      });

      return createUIMessageStreamResponse({ stream });
    }
  }

  const vendorMode = isVendorQuery(latestUserText);

  // ---------- VENDOR MODE: DIRECT PINECONE CALL ----------
  if (vendorMode) {
    const stream = createUIMessageStream({
      async execute({ writer }) {
        const textId = 'vendor-response';

        writer.write({ type: 'start' });
        writer.write({ type: 'text-start', id: textId });

        try {
          // call our Pinecone tool directly (bypass AI tool plumbing)
          const result = await (vectorDatabaseSearch as any).execute({
            query: latestUserText,
            topK: 5,
          });

          const vendors = (result?.vendors ?? []) as any[];

          if (!vendors.length) {
            writer.write({
              type: 'text-delta',
              id: textId,
              delta:
                "I couldn’t find any vendors in my database for that request. Try specifying the type of vendor (e.g., photographers, caterers) or a different area in Mumbai.",
            });
          } else {
            const lines = vendors.slice(0, 5).map((v, idx) => {
              const name = v.name || 'Unnamed vendor';
              const category = v.category || 'Vendor';
              const location = v.location || 'Mumbai';
              const price = v.price_range ? `, approx ${v.price_range}` : '';
              return `${idx + 1}. ${name} – ${category}, ${location}${price}`;
            });

            const header =
              'Here are some vendors in Mumbai based on your request:\n\n';
            writer.write({
              type: 'text-delta',
              id: textId,
              delta: header + lines.join('\n'),
            });
          }
        } catch (err) {
          console.error('Vendor mode error:', err);
          writer.write({
            type: 'text-delta',
            id: textId,
            delta:
              'Something went wrong while fetching vendors. Please try again in a moment.',
          });
        }

        writer.write({ type: 'text-end', id: textId });
        writer.write({ type: 'finish' });
      },
    });

    return createUIMessageStreamResponse({ stream });
  }

  // ---------- NORMAL MODE: REGULAR OPENAI CHAT ----------
  const result = streamText({
    model: MODEL,
    system: SYSTEM_PROMPT,
    messages: convertToModelMessages(messages),
    tools: { webSearch },
    stopWhen: stepCountIs(10),
    providerOptions: {
      openai: {
        reasoningSummary: 'auto',
        reasoningEffort: 'low',
        parallelToolCalls: false,
      },
    },
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
  });
}
