import NotFoundContent from "@/components/layout/NotFoundContent";

// notFound() from any public page (an unknown publication, thesis, post…)
// renders here, inside the (public) layout — so the 404 keeps the navbar,
// footer and locale.
//
// This must live in the (public) group, not just at app/[locale]/. A not-found
// boundary one level up renders outside the layout that owns <main>, and Next
// left <main> empty instead of showing the 404 body at all — the page came back
// as a chrome-only shell with no message. Verified against
// /publications/<unknown-slug>.
export default function PublicNotFound() {
  return <NotFoundContent />;
}
