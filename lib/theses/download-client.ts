// lib/theses/download-client.ts
//
// The browser half of a gated thesis download: ask /api/theses/[id]/download
// for the bytes and hand them to the browser as a file, without a storage URL
// ever reaching the page. The route is the enforcement point; this only
// reports its answer.
//
// Shared by the record page's access panel and the listing cards, which used
// to carry two copies of the same fetch-and-save routine.

import type { ThesisDownloadReason } from "@/lib/theses/download-permission";

export type ThesisDownloadResult = { ok: true } | { ok: false; reason: ThesisDownloadReason | "NETWORK" };

export async function downloadThesisPdf(reportId: string): Promise<ThesisDownloadResult> {
  let res: Response;
  try {
    res = await fetch(`/api/theses/${reportId}/download`, { cache: "no-store" });
  } catch {
    return { ok: false, reason: "NETWORK" };
  }

  if (!res.ok) {
    let reason: ThesisDownloadReason = "FILE_UNAVAILABLE";
    try {
      const body = await res.json();
      reason = body?.reason ?? reason;
    } catch {
      /* non-JSON */
    }
    return { ok: false, reason };
  }

  try {
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const disposition = res.headers.get("content-disposition") || "";
    const match = /filename\*?=(?:UTF-8'')?"?([^;"]+)"?/i.exec(disposition);
    const a = document.createElement("a");
    a.href = url;
    a.download = match ? decodeURIComponent(match[1]) : "thesis.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { ok: true };
  } catch {
    return { ok: false, reason: "NETWORK" };
  }
}
