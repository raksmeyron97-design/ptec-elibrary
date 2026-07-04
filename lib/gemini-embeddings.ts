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

/**
 * Document embedding for pgvector rows searched by match_library.
 * Must stay in the same vector space as the query side (/api/search) and the
 * backfill script (scripts/embed-library.ts): gemini-embedding-001 truncated
 * to 768 dims with RETRIEVAL_DOCUMENT, L2-normalized.
 */
export async function generateDocumentEmbedding(text: string): Promise<number[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured on the server.");
  const ai = new GoogleGenAI({ apiKey: key });

  const response = await ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: text,
    config: { outputDimensionality: 768, taskType: "RETRIEVAL_DOCUMENT" },
  });

  const values = response.embeddings?.[0]?.values;
  if (!values || values.length === 0) {
    throw new Error("Empty embedding returned from Gemini.");
  }
  const mag = Math.sqrt(values.reduce((s, x) => s + x * x, 0)) || 1;
  return values.map((x) => x / mag);
}
