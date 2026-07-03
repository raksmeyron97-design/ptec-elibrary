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
