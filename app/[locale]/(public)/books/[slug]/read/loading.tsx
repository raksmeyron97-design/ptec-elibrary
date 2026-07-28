// Streaming fallback for the PDF reader.
//
// Deliberately NOT the shared GenericPageSkeleton: this route opens onto a
// full-bleed dark reader, and a grid of light content cards flashing in front
// of it reads as the wrong page loading. Shape only — a toolbar bar and a page
// sheet — so the transition into the real reader is a fill, not a relayout.
export default function ReaderLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-[#1F2430]">
      {/* Toolbar */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-4">
        <div className="h-8 w-8 animate-pulse rounded-lg bg-white/10" />
        <div className="h-4 w-40 animate-pulse rounded bg-white/10" />
        <div className="ml-auto flex gap-2">
          <div className="h-8 w-8 animate-pulse rounded-lg bg-white/10" />
          <div className="h-8 w-8 animate-pulse rounded-lg bg-white/10" />
        </div>
      </div>

      {/* Page sheet — A4 aspect, the shape the first rendered page will take. */}
      <div className="flex flex-1 items-start justify-center p-4 sm:p-8">
        <div className="aspect-[1/1.414] w-full max-w-3xl animate-pulse rounded-sm bg-white/[0.07] shadow-2xl" />
      </div>
    </div>
  );
}
