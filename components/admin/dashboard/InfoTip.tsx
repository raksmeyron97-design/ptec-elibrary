import { Info } from "lucide-react";

/**
 * Keyboard-accessible definition popover for dense labels (table headers,
 * metric names). Native <details> — same pattern as the KpiCard ⓘ — so it
 * opens with Enter/Space, needs no JS, and works for mouse users on click.
 * Never rely on a hover-only `title` attribute for information that matters.
 */
export default function InfoTip({ label, text }: { label: string; text: string }) {
  return (
    <details className="relative inline-block align-middle">
      <summary
        aria-label={label}
        className="flex h-5 w-5 cursor-pointer list-none items-center justify-center rounded-full text-text-muted/70 transition-colors hover:bg-paper hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand [&::-webkit-details-marker]:hidden"
      >
        <Info className="h-3 w-3" aria-hidden="true" />
      </summary>
      <p
        role="note"
        className="absolute end-0 top-6 z-30 w-60 whitespace-normal rounded-xl border border-divider bg-bg-surface p-2.5 text-start text-[11.5px] font-normal normal-case leading-4 text-text-body shadow-lg"
      >
        {text}
      </p>
    </details>
  );
}
