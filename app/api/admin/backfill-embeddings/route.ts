import { createServiceClient } from "@/lib/supabase/server";
import { generateDocumentEmbedding } from "@/lib/gemini-embeddings";
import { verifyBearer } from "@/lib/security/bearer";

// This route writes books.embedding, which is READ by lib/ai/retrieval.ts and
// /api/search with gemini-embedding-001 / RETRIEVAL_QUERY vectors. It used to
// call generateEmbedding() (text-embedding-004, unnormalized), so every row it
// backfilled landed in a different vector space from the rows written by
// scripts/embed-library.ts — and cosine similarity across two models is noise.
// It must stay on generateDocumentEmbedding; see docs/AI_ASSISTANT_AUDIT.md 2.1.

export const runtime = "nodejs";

// Requires ADMIN_SECRET_KEY in env (a long random string, e.g.
// `openssl rand -hex 32`). Invoked out-of-band by a maintenance script, not via
// an admin session, so it uses a bearer token rather than requireAdmin().
export async function POST(req: Request) {
  const adminKey = process.env.ADMIN_SECRET_KEY;

  if (!verifyBearer(req.headers.get("authorization"), adminKey)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServiceClient();

  // Fetch books without embeddings
  const { data: books, error } = await db
    .from("books")
    .select("id, title, description, authors(name), categories(name)")
    .is("embedding", null)
    .limit(50); // Process 50 at a time to avoid timeouts/rate limits

  if (error || !books) {
    return Response.json({ error: error?.message || "Failed to fetch books" }, { status: 500 });
  }

  if (books.length === 0) {
    return Response.json({ message: "No books need backfilling." });
  }

  let successCount = 0;
  const errors = [];

  for (const book of books) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = book as any;
      const textToEmbed = `${b.title} ${b.description ?? ""} ${b.authors?.name ?? ""} ${b.categories?.name ?? ""}`.trim();
      
      if (!textToEmbed) continue;

      const embedding = await generateDocumentEmbedding(textToEmbed);

      const { error: updateError } = await db
        .from("books")
        .update({ embedding })
        .eq("id", b.id);

      if (updateError) throw updateError;
      successCount++;
    } catch (err: unknown) {
      errors.push({ id: book.id, error: (err as Error).message });
    }
  }

  return Response.json({
    message: `Processed ${books.length} books. Success: ${successCount}.`,
    errors
  });
}
