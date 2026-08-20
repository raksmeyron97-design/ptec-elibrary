// Every public route owns its loading.tsx (there is deliberately no
// (public)/loading.tsx catch-all) — without this file the profile page gets
// no streaming fallback at all.
export { default } from "@/components/ui/skeletons/GenericPageSkeleton";
