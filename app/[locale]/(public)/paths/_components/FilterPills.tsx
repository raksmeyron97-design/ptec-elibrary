"use client";

import type { ReactNode } from "react";

export interface PillOption {
  value: string;
  label: string;
  icon?: ReactNode;
  count?: number;
}

/**
 * A toggle group rendered as pills, used for the audience, difficulty and
 * language facets.
 *
 * These are real <button>s in a labelled group, not links, because they mutate
 * client filter state rather than navigate — so `aria-pressed` is the correct
 * state attribute here. (The News & Events category chips next door are
 * anchors and use `aria-current` instead; the difference is deliberate.)
 *
 * Selecting the active pill again clears the facet, which is why every pill is
 * a toggle rather than a radio: "In-service Teacher" pressed twice means "no
 * audience filter", and that is reachable by keyboard without a separate
 * clear control.
 */
export default function FilterPills({
  label,
  value,
  options,
  onChange,
  size = "md",
  scrollOnMobile = false,
}: {
  /** Visible group label; also names the group for assistive tech. */
  label: string;
  value: string;
  options: PillOption[];
  onChange: (next: string) => void;
  size?: "sm" | "md";
  /** Wrap on desktop, scroll horizontally on narrow screens. */
  scrollOnMobile?: boolean;
}) {
  if (options.length === 0) return null;

  const pad = size === "sm" ? "px-3 py-1.5 text-[12px]" : "px-3.5 py-2 text-[12.5px]";

  return (
    <div
      role="group"
      aria-label={label}
      className={
        scrollOnMobile
          ? "-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
          : "flex flex-wrap gap-2"
      }
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? "" : o.value)}
            className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-body motion-safe:hover:-translate-y-px ${pad} ${
              active
                ? "border-brand bg-brand text-brand-contrast shadow-sm shadow-brand/20"
                : "border-divider bg-bg-surface text-text-body hover:border-brand/40 hover:text-brand hover:shadow-sm"
            }`}
          >
            {o.icon && (
              <span
                aria-hidden="true"
                className={`flex h-5 w-5 items-center justify-center rounded-full ${
                  active ? "bg-brand-contrast/20 text-brand-contrast" : "bg-brand/8 text-brand"
                }`}
              >
                {o.icon}
              </span>
            )}
            {o.label}
            {typeof o.count === "number" && (
              <span
                className={`rounded-full px-1.5 text-[10.5px] font-bold leading-[1.5] tabular-nums ${
                  active ? "bg-brand-contrast/20 text-brand-contrast" : "bg-paper text-text-muted"
                }`}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
