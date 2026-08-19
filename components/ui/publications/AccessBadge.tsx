import { ShieldCheck, Lock, FileQuestion } from "lucide-react";
import { accessStatus } from "@/lib/publications/integrity";

/**
 * The one place that renders a rights claim about a publication.
 *
 * "Open Access" is an assertion about redistribution rights, not decoration.
 * The masthead and the cover thumbnail each used to render it unconditionally,
 * so every record — including third-party articles whose licence reads
 * "© 2014 American Chemical Society, all rights reserved" — was badged open.
 *
 * Now the badge is derived from the record's own licence field:
 *   open       → the affirmative badge, naming the licence
 *   restricted → a neutral "licensed" chip; no open-access claim
 *   unknown    → nothing at all (the caller may show a muted marker instead)
 *
 * Nothing here decides *whether the library may host the file* — that is a
 * rights question for a human. See docs/PUBLICATION-RIGHTS.md.
 */
export default function AccessBadge({
  license,
  labels,
  variant = "inline",
}: {
  license: string | null;
  labels: { openAccess: string; licensed: string; rightsUnstated: string };
  variant?: "inline" | "overlay";
}) {
  const status = accessStatus(license);

  const base =
    variant === "overlay"
      ? "absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9.5px] font-bold uppercase tracking-wide shadow-sm backdrop-blur-sm"
      : "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide";

  if (status === "open") {
    return (
      <span
        className={`${base} border-emerald-200 bg-emerald-50/95 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-950/80 dark:text-emerald-400`}
      >
        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
        {labels.openAccess}
      </span>
    );
  }

  if (status === "restricted") {
    return (
      <span
        className={`${base} border-divider bg-paper/95 text-text-muted`}
        title={license ?? undefined}
      >
        <Lock className="h-3 w-3" aria-hidden="true" />
        {labels.licensed}
      </span>
    );
  }

  // Unknown: state the absence rather than implying either status.
  return (
    <span className={`${base} border-divider bg-paper/95 text-text-muted/80`}>
      <FileQuestion className="h-3 w-3" aria-hidden="true" />
      {labels.rightsUnstated}
    </span>
  );
}
