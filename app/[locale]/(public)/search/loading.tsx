// Streaming fallback for this route.
//
// Every public route carries its own, because the (public)/loading.tsx
// catch-all that used to cover them sat ABOVE each route's boundary: a route
// with its own skeleton rendered the generic one first and then swapped, which
// is what made the homepage paint a six-card grid before its hero.
//
// /search's is shaped like the page (Phase 9.3): the page is dynamic now, so
// this paints on every document load, not only on a client-side navigation.
export { default } from "@/components/ui/skeletons/SearchPageSkeleton";
