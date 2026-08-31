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
        className="flex h-5 w-5 cursor-pointer list-none items-center justify-center rounded-full text-text-muted/70 transition-colors hover:bg-paper hover:text-brand [--focus-ring-offset:1px] [&::-webkit-details-marker]:hidden"
      >
        <Info className="h-3 w-3" aria-hidden="true" />
      </summary>
      <p
        role="note"
        className="dash-popover absolute end-0 top-6 w-60 whitespace-normal p-3 text-start text-xs font-normal normal-case leading-5 text-text-body"
      >
        {text}
      </p>
    </details>
  );
}
