import { NextResponse, type NextRequest } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy } from "@/lib/rate-limit-policy";
import { logSecurityEvent } from "@/lib/security-log";
import { zimaFetch } from "@/lib/zima";
import { clientIp } from "@/lib/client-ip";
import { isVerifiedGoogleCrawler } from "@/lib/security/crawler";
import { lockdownResponse } from "@/lib/security/lockdown";
import { evaluateThesisDownload, type ThesisPolicyRow } from "@/lib/theses/download-permission";

// Legacy R2 client — kept for backward compat with bare-key records in the DB.
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

function r2ObjectKey(fileUrl: string): string {
  if (!fileUrl.startsWith("https://")) return fileUrl;
  try {
    return new URL(fileUrl).pathname.replace(/^\//, "");
  } catch {
    return fileUrl;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const locked = lockdownResponse("downloads", "/api/theses/[id]/file");
  if (locked) return locked;

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const download = searchParams.get("download") === "1";

  // Any `?download=1` request is funnelled to the single authoritative gated
  // route, which enforces auth + complete Download Profile + Top-10/admin
  // policy and streams with `private, no-store`.
  if (download) {
    // Relative Location — see the books file route for the full reasoning.
    // `new URL(path, request.url)` sent `Location: https://0.0.0.0:3000/...`
    // behind the tunnel, so every thesis download link on a detail page
    // (ActionButtons points at `?download=1`) redirected somewhere no browser
    // can reach.
    return new NextResponse(null, {
      status: 307,
      headers: {
        Location: `/api/theses/${encodeURIComponent(id)}/download`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  // SECURITY: inline viewing is now gated too. It requires an authenticated
  // reader (so access is tied to a user), and enforces the SAME content
  // restriction as the download route — a Top-10 or admin-blocked thesis is not
  // viewable either, not merely non-downloadable. (Download-Profile completeness
  // remains a download-only gate; a signed-in reader may still open an
  // unrestricted thesis in the reader without completing it.)
  //
  // Exception: a DNS-verified Google crawler is allowed through so Google
  // Scholar can index the full text (citation_pdf_url). It still passes the
  // permission engine below, so a restricted (Top-10 / admin-blocked) thesis is
  // never served to it — only published, unrestricted ones. A spoofed
  // User-Agent cannot pass isVerifiedGoogleCrawler.
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  const ip = clientIp(request.headers);

  if (!user) {
    const verifiedCrawler = await isVerifiedGoogleCrawler(ip, request.headers.get("user-agent"));
    if (!verifiedCrawler) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  // A ranged request continues a document the caller already opened; an
  // unranged one opens it. pdf.js reads a thesis in chunks, so metering every
  // chunk as a fresh "file read" made one reader exceed their own limit while
  // opening one large document. See ratePolicy("fileRange").
  const rlId = user ? user.id : `crawler:${ip}`;
  const isRangeRequest = !!request.headers.get("range");
  const { limit, windowMs } = ratePolicy(isRangeRequest ? "fileRange" : "fileRead");
  const rl = await rateLimit(
    `${isRangeRequest ? "thesis-file-range" : "thesis-file"}:${rlId}`,
    limit,
    windowMs,
  );
  if (!rl.success) {
    logSecurityEvent({ type: "rate_limited", where: "/api/theses/[id]/file", userId: user?.id, ip });
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }

  const supabase = createServiceClient();
  const { data: report, error } = await supabase
    .from("research_reports")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !report?.file_url) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Re-evaluate the shared permission engine server-side. Block viewing when the
  // thesis is unpublished, or content-restricted (Top-10 / admin-block).
  const decision = await evaluateThesisDownload({
    service: supabase,
    report: report as ThesisPolicyRow,
    userId: user?.id ?? null,
  });
  if (decision.reason === "THESIS_UNPUBLISHED") {
    return new NextResponse("Not found", { status: 404 });
  }
  if (decision.effectivePolicy === "blocked") {
    logSecurityEvent({ type: "auth_forbidden", where: "/api/theses/[id]/file", userId: user?.id });
    return new NextResponse("This thesis is restricted", { status: 403 });
  }

  const fileUrl = report.file_url as string;
  const safeTitle = encodeURIComponent(`${report.title}.pdf`);
  const disposition = `inline; filename="${safeTitle}"; filename*=UTF-8''${safeTitle}`;
  const rangeHeader = request.headers.get("range");

  // ── Zima CDN or any full HTTP(S) URL — fetch & proxy server-side ─
  if (fileUrl.startsWith("https://") || fileUrl.startsWith("http://")) {
    const upstream = await zimaFetch(fileUrl, rangeHeader);
    if (!upstream.ok && upstream.status !== 206) {
      return new NextResponse("File not found in storage", { status: 404 });
    }
    const headers = new Headers();
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Disposition", disposition);
    headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
    headers.set("Accept-Ranges", "bytes");
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) headers.set("Content-Range", contentRange);
    return new NextResponse(upstream.body, { headers, status: upstream.status });
  }

  // ── Legacy: bare R2 object key ─────────────────────────────────
  const key = r2ObjectKey(fileUrl);
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
  });
  const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 60 });

  const fetchHeaders: HeadersInit = {};
  if (rangeHeader) fetchHeaders["Range"] = rangeHeader;

  const r2Res = await fetch(presignedUrl, { headers: fetchHeaders });
  if (!r2Res.ok && r2Res.status !== 206) {
    return new NextResponse("File not found in storage", { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", disposition);
  headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
  headers.set("Accept-Ranges", "bytes");
  const contentLength = r2Res.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);
  const contentRange = r2Res.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);

  return new NextResponse(r2Res.body, { headers, status: r2Res.status });
}
