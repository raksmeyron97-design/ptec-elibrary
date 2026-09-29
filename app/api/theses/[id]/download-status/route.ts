// Private authorization endpoint. The public thesis page is (statically /
// publicly) cached and MUST NOT embed a per-user download decision in its HTML;
// the client fetches this route to hydrate the correct download-button state.
// Always `private, no-store` and never cached by the service worker.
import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { evaluateThesisDownload, type ThesisPolicyRow } from "@/lib/theses/download-permission";
import { resolveThesisAccess } from "@/lib/theses/access";

const NO_STORE = "private, no-cache, no-store, max-age=0, must-revalidate";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();

  const service = createServiceClient();
  // select("*") keeps this working pre-migration-0093 (download_override absent
  // → treated as 'inherit'); getThesisRank already tolerates a missing view.
  const { data: report } = await service
    .from("research_reports")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!report) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": NO_STORE } });
  }

  const decision = await evaluateThesisDownload({
    service,
    report: report as ThesisPolicyRow,
    userId: user?.id ?? null,
  });

  // What the reader may do, from the same projection the file route refuses
  // by — so a client that opens the reader on `canRead` is never answered 403.
  const access = resolveThesisAccess({
    decision,
    hasFile: !!report.file_url,
    authenticated: !!user,
  });

  // Never expose internal admin notes or the storage URL — only the fields the
  // UI needs to render a state and the correct next action.
  return NextResponse.json(
    {
      state: access.state,
      canRead: access.canRead,
      canDownload: access.canDownload,
      blockedBy: access.blockedBy,
      allowed: decision.allowed,
      reason: decision.reason,
      rank: decision.rank,
      isTopTen: decision.isTopTen,
      effectivePolicy: decision.effectivePolicy,
      policySource: decision.policySource,
      authenticated: !!user,
      missingProfileFields: decision.missingProfileFields ?? [],
    },
    { headers: { "Cache-Control": NO_STORE } },
  );
}
