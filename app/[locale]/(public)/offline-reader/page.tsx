import { Suspense } from "react";
import OfflineReaderClient from "./OfflineReaderClient";

// ─────────────────────────────────────────────────────────────────────────────
// /offline-reader?id=<bookId>  (and /km/offline-reader?id=…)
//
// A STATIC SHELL, deliberately. The book id travels in the query string rather
// than a `[bookId]` path segment because the service worker has to be able to
// precache this route by URL, and one precache entry cannot cover a dynamic
// segment — a path-shaped route would need one entry per downloaded book, or a
// shell served under a URL whose route params disagree with the HTML it was
// rendered for. With a query string the SAME prerendered document answers every
// book, so `/offline-reader?id=anything` boots with no network at all (the
// matching rule is isOfflineShellNavigation() in lib/sw-policy.ts).
//
// Nothing here reads `searchParams` on the server — that would make the route
// dynamic and there would be nothing to precache. The client reads the id.
// ─────────────────────────────────────────────────────────────────────────────

export default function OfflineReaderPage() {
  return (
    <Suspense>
      <OfflineReaderClient />
    </Suspense>
  );
}
