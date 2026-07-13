"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";

/**
 * "More views" select for the secondary content presets — one compact
 * control instead of a row of eight equal chips. Navigation via URL so the
 * choice stays bookmarkable.
 */
export default function ContentPresetMenu({
  current,
  options,
  label,
}: {
  current: string;
  options: { value: string; label: string; href: string }[];
  label: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const active = options.find((o) => o.value === current);

  return (
    <span className="flex items-center gap-1">
      <select
        aria-label={label}
        value={active ? current : ""}
        disabled={isPending}
        onChange={(e) => {
          const next = options.find((o) => o.value === e.target.value);
          if (next) startTransition(() => router.push(next.href, { scroll: false }));
        }}
        className={`h-8 cursor-pointer rounded-lg border px-2 text-[12px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand ${
          active
            ? "border-brand/40 bg-brand/5 text-brand"
            : "border-divider bg-bg-surface text-text-muted"
        }`}
      >
        <option value="" disabled>
          {label}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" aria-hidden="true" />}
    </span>
  );
}
