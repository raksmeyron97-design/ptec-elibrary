import { redirect } from "next/navigation";
import { EBOOKS_UPLOAD_PATH } from "@/lib/admin/ebooks-url";
import { withForwardedQuery } from "@/lib/admin/legacy-redirect";

/**
 * Legacy route → /admin/books/upload, carrying the query string so the
 * dashboard's `?title=` prefill (add the book readers searched for and did not
 * find) still arrives at the form.
 */
export default async function LegacyUploadPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(withForwardedQuery(EBOOKS_UPLOAD_PATH, await searchParams));
}
