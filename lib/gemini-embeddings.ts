import { GoogleGenAI } from "@google/genai";

export async function generateEmbedding(text: string): Promise<number[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured on the server.");
  const ai = new GoogleGenAI({ apiKey: key });

  // text-embedding-004 produces 768-dimensional vectors
  const response = await ai.models.embedContent({
    model: "text-embedding-004",
    contents: text,
  });

  if (!response.embeddings || response.embeddings.length === 0) {
    throw new Error("Failed to generate embedding from Gemini.");
  }

  const values = response.embeddings[0].values;
  if (!values || values.length === 0) {
      throw new Error("Empty embedding returned from Gemini.");
  }
  return values;
}

const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIM = 768; // must match the vector(768) columns

function l2normalize(values: number[]): number[] {
  const mag = Math.sqrt(values.reduce((s, x) => s + x * x, 0)) || 1;
  return values.map((x) => x / mag);
}

/**
 * Document embedding for pgvector rows searched by match_library.
 * Must stay in the same vector space as the query side (/api/search) and the
 * backfill script (scripts/embed-library.ts): gemini-embedding-001 truncated
 * to 768 dims with RETRIEVAL_DOCUMENT, L2-normalized.
 */
export async function generateDocumentEmbedding(text: string): Promise<number[]> {
  const [embedding] = await generateDocumentEmbeddings([text]);
  return embedding;
}

/**
 * Batch variant of generateDocumentEmbedding — one API call for many texts.
 * Used for book_chunks rows (lib/chunk-embed.ts). Same vector space as above.
 */
export async function generateDocumentEmbeddings(texts: string[]): Promise<number[][]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured on the server.");
  const ai = new GoogleGenAI({ apiKey: key });

  const response = await ai.models.embedContent({
    model: EMBED_MODEL,
    contents: texts,
    config: { outputDimensionality: EMBED_DIM, taskType: "RETRIEVAL_DOCUMENT" },
  });

  const embeddings = response.embeddings ?? [];
  if (embeddings.length !== texts.length) {
    throw new Error(`Gemini returned ${embeddings.length} embeddings for ${texts.length} inputs.`);
  }
  return embeddings.map((e) => {
    if (!e.values || e.values.length === 0) throw new Error("Empty embedding returned from Gemini.");
    return l2normalize(e.values);
  });
}

/**
 * Query-side embedding for match_library / match_book_chunks. RETRIEVAL_QUERY
 * counterpart of the document embeddings above — same model/dims/normalization.
 */
export async function generateQueryEmbedding(text: string): Promise<number[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured on the server.");
  const ai = new GoogleGenAI({ apiKey: key });

  const response = await ai.models.embedContent({
    model: EMBED_MODEL,
    contents: text,
    config: { outputDimensionality: EMBED_DIM, taskType: "RETRIEVAL_QUERY" },
  });

  const values = response.embeddings?.[0]?.values;
  if (!values || values.length === 0) {
    throw new Error("Empty embedding returned from Gemini.");
  }
  return l2normalize(values);
}
