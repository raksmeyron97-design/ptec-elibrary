import { getKohaCoverConfig } from "@/lib/koha";
import { decideCoverAnswer, kohaCoverImageUrl, parseCoverImageId, COVER_CACHE_ERROR, COVER_CACHE_IMAGE, COVER_CACHE_MISSING, KOHA_COVER_MAX_BYTES } from "@/lib/koha/covers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/catalog-covers/{imageId}
 *
 * A cover a librarian uploaded in Koha, served from the e-Library's own origin
 * (lib/koha/covers.ts, docs/KOHA-SYNC.md → Covers from Koha). The Koha sync
 * points `catalog_books.cover_url` here; <Image> then optimises it like any
 * other cover. Koha's OPAC serves the image anonymously but with
 * `Expires: now`; an image number's bytes never change, so this answer is
 * cached for a week (immutable).
 *
 * Off (KOHA_COVERS unset): 404 for everything — deploying changes nothing.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ imageId: string }> }): Promise<Response> {
  const cfg = getKohaCoverConfig();
  const imageId = parseCoverImageId((await params).imageId);
  if (!cfg.enabled || imageId === null) return notFound();

  let upstream: Response;
  try {
    upstream = await fetch(kohaCoverImageUrl(cfg.opacUrl, imageId), { redirect: "manual", signal: AbortSignal.timeout(8_000), cache: "no-store" });
  } catch {
    return new Response("Koha did not answer", { status: 502, headers: { "Cache-Control": COVER_CACHE_ERROR } });
  }
  const declared = Number(upstream.headers.get("content-length") ?? "0");
  if (declared > KOHA_COVER_MAX_BYTES) {
    await upstream.body?.cancel();
    return new Response("Bad answer from Koha", { status: 502, headers: { "Cache-Control": COVER_CACHE_ERROR } });
  }
  const body = upstream.status === 200 ? new Uint8Array(await upstream.arrayBuffer()) : new Uint8Array(0);
  if (upstream.status !== 200) await upstream.body?.cancel();
  const answer = decideCoverAnswer({ status: upstream.status, contentType: upstream.headers.get("content-type"), bytes: body.byteLength });

  if (answer.kind === "missing") return notFound();
  if (answer.kind === "upstream_error") return new Response("Bad answer from Koha", { status: 502, headers: { "Cache-Control": COVER_CACHE_ERROR } });
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": answer.contentType,
      "Content-Length": String(body.byteLength),
      "Cache-Control": COVER_CACHE_IMAGE,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function notFound(): Response {
  return new Response("No such cover", { status: 404, headers: { "Cache-Control": COVER_CACHE_MISSING } });
}
