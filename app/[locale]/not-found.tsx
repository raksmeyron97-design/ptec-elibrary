import NotFoundContent from "@/components/layout/NotFoundContent";

// notFound() from anywhere in the public tree renders here, inside the
// [locale] root layout — so the 404 keeps the navbar, footer and locale.
export default function NotFound() {
  return <NotFoundContent />;
}
