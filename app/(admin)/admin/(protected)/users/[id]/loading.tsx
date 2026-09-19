/** Profile skeleton, in the page's own two-column shape — a generic spinner
 *  here would relayout the moment the real aside arrives. */
export default function UserProfileLoading() {
  return (
    <div className="w-full animate-pulse pb-10">
      <div className="mb-6 space-y-2">
        <div className="h-3.5 w-40 rounded bg-paper" />
        <div className="h-7 w-64 rounded-lg bg-divider" />
        <div className="h-4 w-80 rounded bg-paper" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="h-64 rounded-2xl border border-divider bg-bg-surface" />
          <div className="h-28 rounded-2xl border border-divider bg-bg-surface" />
        </div>
        <div className="space-y-4">
          <div className="h-10 w-80 rounded-xl border border-divider bg-bg-surface" />
          <div className="h-44 rounded-2xl border border-divider bg-bg-surface" />
          <div className="h-56 rounded-2xl border border-divider bg-bg-surface" />
        </div>
      </div>
    </div>
  );
}
