// @ts-nocheck
import { tool } from "ai";
import { z } from "zod";
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY as string,
});

// New Pinecone v3 (no controller host required)
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY as string,
});

const index = pinecone.index(
  process.env.PINECONE_INDEX_NAME as string
);

export const vectorDatabaseSearch = tool({
  description: "Search Pinecone vendor database",
  parameters: z.object({
    query: z.string(),
    topK: z.number().default(5),
  }),

  async execute({ query, topK }) {
    console.log("[vector-search] query:", query);

    try {
      const embedding = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: query,
      });

      const vector = embedding.data[0].embedding;

      const result = await index.query({
        vector,
        topK,
        includeMetadata: true,
      });

      const vendors = result.matches.map((m) => ({
        id: m.id,
        score: m.score,
        name: m.metadata?.name,
        location: m.metadata?.location,
        category: m.metadata?.category,
        price_range: m.metadata?.price_range,
      }));

      return { vendors };
    } catch (err) {
      console.error("[vector-search] ERROR:", err);
      return { vendors: [] };
    }
  },
});
