export default function Loading() {
  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center gap-3 bg-bg-body"
      role="status"
      aria-live="polite"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-divider border-t-brand" aria-hidden />
      <span className="sr-only">Loading</span>
    </div>
  );
}
