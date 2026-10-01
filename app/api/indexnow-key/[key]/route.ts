// The IndexNow key file (SEO Phase 7.2). Engines verify a submission by
// fetching https://library.ptec.edu.kh/{key}.txt; next.config.ts rewrites that
// path here. It answers the configured key and nothing else — any other
// /{hex}.txt is a 404, and with INDEXNOW_KEY unset every one is.

import { indexNowKey } from "@/lib/seo/indexnow";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }): Promise<Response> {
  const { key } = await params;
  const configured = indexNowKey(process.env.INDEXNOW_KEY);
  if (!configured || key !== configured) return new Response("Not found", { status: 404 });
  return new Response(configured, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Robots-Tag": "noindex",
    },
  });
}
