import { createServiceClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/gemini-embeddings";

export const runtime = "nodejs";

// Requires ADMIN_SECRET_KEY in env
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const adminKey = process.env.ADMIN_SECRET_KEY;
  
  if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
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

      // Rate limiting handled by Gemini API naturally, but might need delay if quota is strict
      const embedding = await generateEmbedding(textToEmbed);

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
