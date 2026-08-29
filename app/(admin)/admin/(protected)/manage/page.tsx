import { redirect } from "next/navigation";
import { EBOOKS_BASE_PATH } from "@/lib/admin/ebooks-url";
import { withForwardedQuery } from "@/lib/admin/legacy-redirect";

/**
 * Legacy route. Book management moved to /admin/books when Upload, Manage and
 * Duplicates were consolidated into one workspace; this keeps every bookmark,
 * emailed link and browser-history entry working. No business logic lives
 * here — the canonical page is app/(admin)/admin/(protected)/books/page.tsx.
 *
 * The query string is forwarded because these URLs carry state: the KPI tiles
 * and dashboard cards have been linking to /admin/manage?status=published and
 * ?quality=incomplete for as long as the page existed, and a redirect that
 * dropped the filter would land the librarian on an unfiltered collection with
 * no sign anything was lost.
 */
export default async function LegacyManagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(withForwardedQuery(EBOOKS_BASE_PATH, await searchParams));
}
