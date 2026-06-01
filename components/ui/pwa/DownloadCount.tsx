// components/ui/DownloadCount.tsx
// Small server component — just renders the count badge.
// Pass the pre-fetched count from the page so no extra waterfall.

type Props = {
  count: number;
};

export default function DownloadCount({ count }: Props) {
  if (count <= 0) return null;

  const label =
    count >= 1_000_000
      ? `${(count / 1_000_000).toFixed(1)}M`
      : count >= 1_000
      ? `${(count / 1_000).toFixed(1)}K`
      : String(count);

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-paper px-3 py-1.5 text-[13px] font-semibold text-text-body">
      {/* download arrow icon */}
      <svg
        className="h-3.5 w-3.5 text-text-muted"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 3v13m0 0-4-4m4 4 4-4" />
        <path d="M4 20h16" />
      </svg>
      {label} download{count !== 1 ? "s" : ""}
    </span>
  );
}