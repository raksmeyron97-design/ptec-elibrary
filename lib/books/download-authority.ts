// lib/books/download-authority.ts
//
// "May this caller retrieve a book whose downloads the library has switched
// off?" — asked from a PUBLIC route, about a caller who is usually an ordinary
// reader, so it must answer `false` instead of throwing.
//
// It delegates to requirePermission("books", "write") rather than comparing
// roles: that is the same check /admin/books/upload and the edit form pass,
// so the people who can SET this policy are exactly the people who can look
// past it, and the admin panel's MFA requirement rides along with it. A
// reader, an unauthenticated caller, and an admin who has not completed MFA
// all land in the catch and are refused — fail closed, in one place.
import "server-only";

import { requirePermission } from "@/lib/auth/requireAdmin";

export type BookDownloadOverride =
  | { allowed: false; role: null }
  | { allowed: true; role: string };

export async function canOverrideBookDownloadPolicy(): Promise<BookDownloadOverride> {
  try {
    const { role } = await requirePermission("books", "write");
    return { allowed: true, role };
  } catch {
    // AdminAuthError (401/403/500) and anything else alike: no override.
    // Deliberately not narrowed to isAdminAuthError — an unexpected failure
    // here must not become a grant.
    return { allowed: false, role: null };
  }
}
