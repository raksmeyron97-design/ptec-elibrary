/**
 * Which permission resource governs an upload destination.
 *
 * `/admin/books/upload`, the thesis form, the publication form and the learning
 * path builder all post to the same two upload routes, and those routes used to
 * gate on a fixed ROLE list — `requireLibrarian()` on `/api/admin/upload`,
 * `requireAdmin()` on `/api/admin/bulk-upload`. That is the defect
 * `docs/ADMIN-AUTHORIZATION.md` describes in both directions at once:
 *
 *   - A `staff` account granted `books: write` on /admin/roles opened
 *     `/admin/books/upload` (the route policy is permission-based), filled the
 *     form, and got a bare "Forbidden" from the upload POST. The delegation the
 *     matrix promised could not be exercised.
 *   - `requireAdmin()` on the bulk route refused `librarian` outright, even
 *     though `books.bulk` is `perm("books", "write")` in the registry and
 *     librarian holds it by default.
 *
 * So the destination folder — not the caller's job title — decides which row of
 * the matrix is consulted. This module is pure and has no `server-only` import
 * so the routes, the Server Action and the tests all read one table.
 *
 * `team`/`avatars` keep the historical `books` check: they have no dedicated
 * row in the matrix, and inventing one here would change behaviour that nothing
 * asked to change.
 */

/** Storage top-level folder → `role_permissions` resource key. */
const RESOURCE_BY_FOLDER: Readonly<Record<string, string>> = {
  books: "books",
  posts: "posts",
  research: "research",
  reports: "research",
  publications: "publications",
  announcements: "announcements",
  paths: "learning_paths",
};

/**
 * The resource governing `pathOrKey`, which may be a bare folder (`books`), a
 * folder path (`books/algebra-1a2b`) or a full object key
 * (`books/algebra-1a2b/algebra.pdf`). Only the first segment is consulted.
 */
export function uploadPermissionResource(pathOrKey: string): string {
  const top = pathOrKey.split("/")[0];
  return RESOURCE_BY_FOLDER[top] ?? "books";
}
