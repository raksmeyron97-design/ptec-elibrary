"use server";

// AI metadata extraction for the upload form (Area 4 of the roadmap: collection
// growth). Reads the PDF the librarian just picked — before it's uploaded to
// storage — and drafts title/author/year/language/summary for review. Never
// auto-publishes anything; the librarian sees the pre-filled form and can
// edit or reject every field before submitting, same as typing it by hand.

import { GoogleGenAI, Type } from "@google/genai";
import { requireLibrarian } from "@/lib/auth/requireAdmin";

const MODEL = "gemini-3.5-flash";
// Newest-generation models occasionally 503 under high demand — confirmed
// live against this exact request shape (inline PDF + responseSchema) before
// shipping. One fallback to the previous generation, not an open-ended retry
// loop: if both are overloaded, that's a real outage the librarian should see.
const FALLBACK_MODEL = "gemini-2.5-flash";
const MAX_PDF_BYTES = 20 * 1024 * 1024; // inline-data limit; larger PDFs skip extraction, not the upload
const DAILY_USER_LIMIT = 20;
const DAILY_GLOBAL_LIMIT = 200;
const GLOBAL_SENTINEL = "00000000-0000-0000-0000-000000000003";

export interface ExtractedBookMetadata {
  title: string | null;
  author: string | null;
  year: number | null;
  language: "Khmer" | "English" | null;
  summary: string | null;
}

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "The book's full title as printed on the cover/title page." },
    author: { type: Type.STRING, description: "Primary author name(s), or the institution if no individual author is credited." },
    year: { type: Type.INTEGER, description: "Publication or copyright year." },
    language: { type: Type.STRING, enum: ["Khmer", "English"], description: "The dominant language of the book's actual content." },
    summary: { type: Type.STRING, description: "A neutral 2-3 sentence description of what the book covers, in the same language as the book's content." },
  },
  required: ["title", "author", "year", "language", "summary"],
};

function getAI() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured on the server.");
  return new GoogleGenAI({ apiKey: key });
}

/**
 * Extracts a metadata draft from an in-memory PDF (not yet uploaded to
 * storage). Called from the upload form before the librarian submits.
 */
export async function extractBookMetadata(
  formData: FormData,
): Promise<{ data: ExtractedBookMetadata } | { error: string }> {
  const { supabase, user } = await requireLibrarian();

  const file = formData.get("pdf");
  if (!(file instanceof File) || file.size === 0) return { error: "No PDF provided." };
  if (file.type !== "application/pdf") return { error: "File is not a PDF." };
  if (file.size > MAX_PDF_BYTES) {
    return { error: `PDF is too large to auto-fill (max ${MAX_PDF_BYTES / (1024 * 1024)} MB) — enter details manually.` };
  }

  // Per-librarian daily quota, then a global circuit breaker — same
  // increment-before-call pattern as /api/ask (a failed Gemini call still
  // costs one use; simpler than trying to refund on failure, and prevents
  // abuse via forced errors).
  const { data: userQuota, error: userQuotaErr } = await supabase.rpc("increment_ai_usage", {
    p_user_id: user.id,
    p_limit: DAILY_USER_LIMIT,
  });
  if (userQuotaErr) return { error: "Quota check failed. Try again shortly." };
  if ((userQuota as number) === -1) return { error: "Daily AI auto-fill limit reached for your account. Enter details manually." };

  const { data: globalQuota, error: globalQuotaErr } = await supabase.rpc("increment_ai_usage", {
    p_user_id: GLOBAL_SENTINEL,
    p_limit: DAILY_GLOBAL_LIMIT,
  });
  if (globalQuotaErr) return { error: "Quota check failed. Try again shortly." };
  if ((globalQuota as number) === -1) return { error: "Site-wide AI auto-fill limit reached for today. Enter details manually." };

  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");
  const ai = getAI();

  const contents = [
    {
      role: "user" as const,
      parts: [
        { inlineData: { mimeType: "application/pdf", data: base64 } },
        {
          text: "You are a librarian cataloging this book for a teacher-training college library. Read the cover, title page, and copyright page (ignore any watermarks or scan artifacts) and extract its bibliographic metadata. If a field genuinely cannot be determined, use null rather than guessing.",
        },
      ],
    },
  ];
  const config = {
    responseMimeType: "application/json",
    responseSchema: RESPONSE_SCHEMA,
    maxOutputTokens: 500,
    thinkingConfig: { thinkingBudget: 0 },
  };

  for (const model of [MODEL, FALLBACK_MODEL]) {
    try {
      const res = await ai.models.generateContent({ model, contents, config });
      const parsed = JSON.parse(res.text ?? "{}") as Partial<ExtractedBookMetadata>;
      return {
        data: {
          title: parsed.title ?? null,
          author: parsed.author ?? null,
          year: parsed.year ?? null,
          language: parsed.language ?? null,
          summary: parsed.summary ?? null,
        },
      };
    } catch (err) {
      console.error(`[extractBookMetadata] ${model} failed:`, err);
    }
  }
  return { error: "AI extraction is temporarily unavailable — enter details manually." };
}
