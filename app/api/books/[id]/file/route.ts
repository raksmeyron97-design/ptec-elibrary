import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { get } from "@vercel/blob";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const download = searchParams.get("download") === "1";

  // Verify auth directly in route handler (per Vercel recommendation)
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Find file_url at the server
  const { data: book, error } = await supabase
    .from("books")
    .select(`
      title,
      book_files ( file_url, format )
    `)
    .eq("id", id)
    .single();

  if (error || !book) {
    return new NextResponse("Book not found", { status: 404 });
  }

  const files = Array.isArray(book.book_files) ? book.book_files : [book.book_files];
  const pdfFile = files.find((f: any) => f.format === "pdf") ?? files[0];

  if (!pdfFile || !pdfFile.file_url) {
    return new NextResponse("File not found", { status: 404 });
  }

  const fileUrl = pdfFile.file_url;
  const isPrivateBlob = fileUrl.includes(".private.blob.vercel-storage.com");
  const isPublicBlob = fileUrl.includes(".public.blob.vercel-storage.com");
  
  // Format filename with proper encoding for Khmer characters (RFC 5987)
  const safeTitle = encodeURIComponent(`${book.title}.pdf`);
  const contentDisposition = download
    ? `attachment; filename="${safeTitle}"; filename*=UTF-8''${safeTitle}`
    : `inline; filename="${safeTitle}"; filename*=UTF-8''${safeTitle}`;

  try {
    if (isPrivateBlob || isPublicBlob) {
      // Use @vercel/blob get() to stream securely
      const access = isPrivateBlob ? "private" : "public";
      const blobResult = await get(fileUrl, { access });
      
      if (!blobResult || !blobResult.stream) {
        return new NextResponse("File not found in Blob storage", { status: 404 });
      }
      
      const headers = new Headers(blobResult.headers as any);
      headers.set("Content-Type", "application/pdf");
      headers.set("Content-Disposition", contentDisposition);
      
      if (isPrivateBlob) {
        // Vercel recommends Cache-Control: private, no-cache for private blobs
        headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
      }
      
      // Pass the ETag from the blobResult headers (automatically handled by Headers initialization)
      return new NextResponse(blobResult.stream as any, { headers, status: blobResult.statusCode });
      
    } else {
      // Fallback for non-Vercel Blob URLs (e.g., Supabase storage)
      const res = await fetch(fileUrl);
      if (!res.ok) throw new Error("Failed to fetch public file");

      const headers = new Headers();
      headers.set("Content-Type", "application/pdf");
      headers.set("Content-Disposition", contentDisposition);
      headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
      
      const etag = res.headers.get("etag");
      if (etag) headers.set("ETag", etag);

      return new NextResponse(res.body, { headers });
    }
  } catch (err) {
    console.error("[file proxy error]", err);
    return new NextResponse("Internal Error fetching file", { status: 500 });
  }
}