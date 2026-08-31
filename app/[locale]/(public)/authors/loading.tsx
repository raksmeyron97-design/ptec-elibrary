// Streaming fallback for /authors.
//
// Mirrors the hub's real shape — breadcrumb, header block, then a 1/2/3-column
// tile grid — rather than re-exporting GenericPageSkeleton, so the layout does
// not reflow when the taxonomy arrives.
export default function AuthorsHubLoading() {
  return (
    <main className="min-h-screen bg-bg-body px-4 py-10 sm:px-6 md:px-12">
      <div className="mx-auto max-w-5xl">
        <div className="skeleton mb-5 h-4 w-40 rounded" />
        <div className="mb-8">
          <div className="skeleton h-3 w-24 rounded" />
          <div className="skeleton mt-3 h-9 w-[min(22rem,80%)] rounded-lg" />
          <div className="skeleton mt-4 h-4 w-[min(34rem,95%)] rounded" />
          <div className="skeleton mt-3 h-3 w-48 rounded" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-divider bg-bg-surface p-4">
              <div className="skeleton h-4 w-3/4 rounded" />
              <div className="skeleton mt-2.5 h-3 w-1/3 rounded" />
              <div className="skeleton mt-2 h-3 w-2/3 rounded" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
