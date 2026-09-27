import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { myLibrary } from "@/lib/koha/patron-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/library-loans — the signed-in reader's own Koha loans and holds,
 * for the "Library loans" panel on /dashboard (docs/KOHA-PATRONS.md).
 *
 * Loaded client-side, like /api/me/continue-reading, so a slow or unreachable
 * Koha never holds up the dashboard. The reader comes from the verified
 * session and the patron from THEIR link — the request carries no id at all,
 * so nobody can ask for someone else's loans. `private, no-store`: personal
 * data, never in a shared cache.
 */
export async function GET() {
  const headers = { "Cache-Control": "private, no-store, max-age=0" };
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ state: "unlinked" }, { status: 401, headers });
  return NextResponse.json(await myLibrary(user.id), { headers });
}
