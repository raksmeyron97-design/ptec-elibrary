// The offline reader's loading state has the reader's own shape — its toolbar
// and a page — rather than a spinner: the page is about to appear exactly
// there, so the eye is already in the right place when it does.
export default function Loading() {
  return (
    <div
      className="flex min-h-[60vh] flex-col items-center gap-4 bg-bg-body px-4 py-6"
      role="status"
      aria-live="polite"
    >
      <div className="skeleton h-11 w-full max-w-3xl rounded-xl" aria-hidden />
      <div className="skeleton aspect-[3/4] w-full max-w-md rounded-lg" aria-hidden />
      <span className="sr-only">Loading</span>
    </div>
  );
}
