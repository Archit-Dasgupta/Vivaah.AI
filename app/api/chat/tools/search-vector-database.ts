// app/api/chat/tools/search-vector-database.ts
// @ts-nocheck
import OpenAI from "openai";
import * as PineconePkg from "@pinecone-database/pinecone";

/**
 * Adaptive Pinecone helper:
 * - Works with multiple Pinecone SDK shapes (PineconeClient, Pinecone)
 * - If constructor doesn't accept `environment`, will attempt `controllerHostUrl`
 * - Normalizes results to { matches, vendors }
 */

// config
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_ENV = process.env.PINECONE_ENV || process.env.PINECONE_ENVIRONMENT;
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || process.env.PINECONE_INDEX || "vendors";
const PINECONE_CONTROLLER_HOST = process.env.PINECONE_CONTROLLER_HOST; // optional explicit

if (!OPENAI_API_KEY) console.error("[search-tool] MISSING OPENAI_API_KEY");
if (!PINECONE_API_KEY) console.error("[search-tool] MISSING PINECONE_API_KEY");
if (!PINECONE_ENV && !PINECONE_CONTROLLER_HOST) console.error("[search-tool] MISSING PINECONE_ENV or PINECONE_CONTROLLER_HOST");
if (!PINECONE_INDEX_NAME) console.error("[search-tool] MISSING PINECONE_INDEX_NAME");

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// lazy client + index retrieval
let pineClient = null;
let indexHandle = null;

async function ensurePineconeInit() {
  if (pineClient && indexHandle) return { pineClient, indexHandle };

  // Try to detect available export shapes
  try {
    // 1) If package exports PineconeClient (modern)
    if (PineconePkg?.PineconeClient) {
      try {
        pineClient = new PineconePkg.PineconeClient();
        // init takes { apiKey, environment }
        await pineClient.init({ apiKey: PINECONE_API_KEY, environment: PINECONE_ENV });
        // index method is Index(name)
        indexHandle = pineClient.Index
          ? pineClient.Index(PINECONE_INDEX_NAME)
          : (pineClient.index ? pineClient.index(PINECONE_INDEX_NAME) : null);
        console.log("[search-tool] Using PineconeClient + init({environment}) path");
        return { pineClient, indexHandle };
      } catch (errInner) {
        console.warn("[search-tool] PineconeClient init with environment failed:", errInner);
        // fall through to try alternative initialization below
      }
    }

    // 2) If package exports Pinecone (older constructor)
    if (PineconePkg?.Pinecone) {
      try {
        // Some older constructors accept controllerHostUrl instead of environment
        const controllerHostUrl = PINECONE_CONTROLLER_HOST || `https://controller.${PINECONE_ENV}.pinecone.io`;
        pineClient = new PineconePkg.Pinecone({
          apiKey: PINECONE_API_KEY,
          controllerHostUrl,
        });
        // many older clients expose `.index(name)` (lowercase)
        indexHandle = pineClient.index ? pineClient.index(PINECONE_INDEX_NAME) : (pineClient.Index ? pineClient.Index(PINECONE_INDEX_NAME) : null);
        console.log("[search-tool] Using Pinecone constructor with controllerHostUrl:", controllerHostUrl);
        return { pineClient, indexHandle };
      } catch (err2) {
        console.warn("[search-tool] Pinecone constructor(controllerHostUrl) failed:", err2);
      }
    }

    // 3) If package default export is a function or object (try both shapes)
    const defaultExport = PineconePkg?.default ?? PineconePkg;
    if (typeof defaultExport === "function") {
      // try calling as constructor with controllerHostUrl
      try {
        const controllerHostUrl = PINECONE_CONTROLLER_HOST || `https://controller.${PINECONE_ENV}.pinecone.io`;
        pineClient = new defaultExport({ apiKey: PINECONE_API_KEY, controllerHostUrl });
        indexHandle = pineClient.index ? pineClient.index(PINECONE_INDEX_NAME) : (pineClient.Index ? pineClient.Index(PINECONE_INDEX_NAME) : null);
        console.log("[search-tool] Using default export constructor with controllerHostUrl");
        return { pineClient, indexHandle };
      } catch (err3) {
        console.warn("[search-tool] default export constructor failed:", err3);
      }
    }

    // 4) If we reach here, we couldn't instantiate; surface what we tried.
    throw new Error(
      "Unable to initialize Pinecone client. Detected package exports: " +
        Object.keys(PineconePkg).join(", ") +
        ". Provide PINECONE_CONTROLLER_HOST or check Pinecone SDK version."
    );
  } catch (finalErr) {
    console.error("[search-tool] Pinecone init final error:", finalErr);
    throw finalErr;
  }
}

async function embedText(text) {
  if (!text) return null;
  try {
    const res = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    });
    return res?.data?.[0]?.embedding ?? null;
  } catch (err) {
    console.error("[search-tool] embedding error:", err);
    throw err;
  }
}

function normalizeMatch(m) {
  return {
    id: m.id,
    _score: m.score ?? m.similarity ?? null,
    name: m.metadata?.name ?? m.metadata?.title ?? m.metadata?.vendor_name ?? "",
    location: m.metadata?.location ?? m.metadata?.city ?? "",
    category: m.metadata?.category ?? m.metadata?.vendor_type ?? "",
    price_range: m.metadata?.price_range ?? m.metadata?.price ?? "",
    description: m.metadata?.description ?? m.metadata?.desc ?? "",
    raw_metadata: m.metadata ?? {},
  };
}

export const vectorDatabaseSearch = {
  async execute({ query, topK = 8 } = {}) {
    console.log("[search-tool] execute called. query:", String(query).slice(0, 300), "topK:", topK);
    if (!query) return { matches: [], vendors: [] };

    // ensure pinecone client + index
    const { indexHandle: idx } = await ensurePineconeInit();

    if (!idx) {
      throw new Error("Pinecone index handle not available after init.");
    }

    // create embedding
    const embedding = await embedText(query);
    if (!embedding) {
      console.warn("[search-tool] no embedding vector returned");
      return { matches: [], vendors: [] };
    }

    console.log("[search-tool] embedding length:", embedding.length);

    // Query - tolerate different index API shapes:
    let pineRes;
    try {
      // modern client: index.query({...})
      if (typeof idx.query === "function") {
        pineRes = await idx.query({
          vector: embedding,
          topK,
          includeMetadata: true,
          includeValues: false,
        });
      } else if (typeof idx.fetch === "function") {
        // some older clients had fetch or similar; attempt query-like call
        pineRes = await idx.fetch({ topK }); // best-effort; may not exist
      } else if (typeof idx.upsert === "function" && typeof idx.query === "undefined") {
        // If this shape is weird, attempt to call index as function (rare)
        // This is a last-resort attempt; expect errors if unsupported.
        pineRes = await idx.query?.({ vector: embedding, topK, includeMetadata: true });
      } else {
        throw new Error("Index object does not expose a query method. Index keys: " + Object.keys(idx).join(", "));
      }
    } catch (qerr) {
      console.error("[search-tool] index.query failed:", qerr);
      throw qerr;
    }

    // log raw
    try {
      console.log("[search-tool] pinecone.raw:", JSON.stringify(pineRes, null, 2).slice(0, 20000));
    } catch (serr) {
      console.log("[search-tool] pinecone.raw (non-serializable)", pineRes);
    }

    // normalize matches
    const matches = (pineRes?.matches ?? pineRes?.results ?? pineRes?.items ?? []).map((m) => ({
      id: m.id,
      score: m.score ?? m.similarity ?? null,
      metadata: m.metadata ?? (m.document ?? m.payload ?? {}),
    }));

    const vendors = matches.map((m) => {
      const norm = normalizeMatch({ id: m.id, metadata: m.metadata, score: m.score });
      return {
        ...norm,
        _id: m.id,
        _score: m.score ?? null,
      };
    });

    return { matches, vendors };
  },
};

export default async function vectorDatabaseSearchFn(query, topK = 8) {
  return vectorDatabaseSearch.execute({ query, topK });
}
