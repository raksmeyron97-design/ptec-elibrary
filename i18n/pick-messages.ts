import type { AbstractIntlMessages } from "next-intl";

// ──────────────────────────────────────────────────────────────────
// Per-route-group message namespaces.
//
// The full catalogue (messages/{en,km}.json) used to be serialized into
// every RSC response via the root layout's IntlProvider — ~64 KB (en) /
// ~124 KB (km) of JSON on every page, including the admin login page
// (which shipped the whole `adminDashboard` catalogue to anonymous
// visitors). Each route-group layout now provides ONLY the namespaces its
// client components actually consume (server components use
// getTranslations() and need nothing in the client provider).
//
// Nested NextIntlClientProviders REPLACE messages (no merge), so each
// list below must be the complete set for its subtree. If you add a
// `useTranslations("x")` call to a client component, add "x" to the list
// for every route group that renders it — a missing namespace renders
// raw message keys in production and throws in development.
// lib/i18n-namespaces.test.ts statically checks the lists against the
// components each tree imports.
// ──────────────────────────────────────────────────────────────────

/** components/layout/RootShell.tsx — the client components every root layout
 *  mounts OUTSIDE its group's own provider: PushNotificationOnboarding
 *  ("pushNotifications") and SearchModal, whose SearchSuggestions reads
 *  ("home"). NavigationProgress uses no messages.
 *
 *  These are the only namespaces guaranteed present on /admin and /auth, so
 *  anything RootShell renders must be listed here — lib/i18n-namespaces.test.ts
 *  pins that. */
export const ROOT_NAMESPACES = ["pushNotifications", "home"] as const;

/** app/[locale]/(public): every namespace used by a client component
 *  reachable from public pages (incl. shared components/ui/*). */
export const PUBLIC_NAMESPACES = [
  "abstractReader",
  "announcementBanner",
  "ask",
  "bookCard",
  "bookDetail",
  "books",
  "catalogs",
  "cite",
  "dashboard",
  "downloadProfile",
  "footer",
  "home",
  "metrics",
  "nav",
  "notifications",
  "pagination",
  "posts",
  "publicationDetail",
  "pushNotifications",
  "reader",
  "search",
  "share",
  "thesisDownload",
  "thesisSummary",
] as const;

/** app/(auth): the auth flows only. */
export const AUTH_NAMESPACES = ["auth"] as const;

/** app/(admin)/admin/(protected): dashboard client components plus the
 *  shared Pagination used by the CRUD tables. Admin login/MFA pages use
 *  no client translations at all. */
export const ADMIN_NAMESPACES = ["adminAnnouncements", "adminBookRequests", "adminCatalog", "adminCatalogCover", "adminDashboard", "adminDataQuality", "adminDuplicates", "adminEbooks", "adminExport", "adminLogs", "adminPaths", "adminPostForm", "adminPosts", "adminReview", "adminRoles", "adminSearchInsights", "adminShell", "adminStorage", "adminTheses", "adminThesisForm", "adminUpload", "adminUsers", "pagination"] as const;

/** Narrow a full message catalogue to the given namespaces. */
export function pickMessages(
  messages: AbstractIntlMessages,
  namespaces: readonly string[],
): AbstractIntlMessages {
  const picked: AbstractIntlMessages = {};
  for (const ns of namespaces) {
    const value = messages[ns];
    if (value !== undefined) picked[ns] = value;
  }
  return picked;
}
