import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { kohaHoldsForReaders, titleHoldStatus } from "@/lib/koha/patron-server";
import type { TitleHoldStatus } from "@/lib/dashboard/library-loans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/library-hold?slug=… — what the Physical Library page shows the
 * signed-in reader about one title (Koha Phase 10.2,
 * docs/KOHA-READER-SERVICES.md): holds off, signed out, no linked card, or
 * whether they already hold it or have it on loan.
 *
 * Asked client-side because the page is prerendered for everyone and this is
 * one reader's answer. The reader comes from the verified session and the
 * patron from THEIR link; the slug only names the title. `private, no-store`.
 */
export async function GET(req: NextRequest) {
  const headers = { "Cache-Control": "private, no-store, max-age=0" };
  const json = (body: TitleHoldStatus) => NextResponse.json(body, { headers });
  // Off answers before the session is read: with holds off this route costs nothing.
  if (!kohaHoldsForReaders()) return json({ state: "off" });
  const slug = req.nextUrl.searchParams.get("slug")?.trim() ?? "";
  if (!slug || slug.length > 300) return json({ state: "off" });
  const user = await getSessionUser();
  if (!user) return json({ state: "signed_out" });
  return json(await titleHoldStatus(user.id, slug));
}
