import { Link } from "@/i18n/navigation";
import { Library } from "lucide-react";

/**
 * Subject headings as filter links into the listing.
 *
 * Subjects previously rendered as plain <span> chips beside keywords that were
 * already links — visually identical, but half of them dead. Both are
 * navigable now, and both resolve to a real filtered listing.
 */
export default function SubjectList({
  subjects,
  basePath,
  heading = "Subjects",
}: {
  subjects: string[];
  basePath: string;
  heading?: string;
}) {
  if (subjects.length === 0) return null;

  return (
    <div>
      <h3 className="mb-2.5 inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">
        <Library className="h-3.5 w-3.5" aria-hidden="true" />
        {heading}
      </h3>
      <div className="flex flex-wrap gap-2">
        {subjects.map((subject) => (
          <Link
            key={subject}
            href={`${basePath}?subject=${encodeURIComponent(subject)}`}
            className="inline-flex min-h-8 items-center rounded-full border border-brand/20 bg-brand/8 px-3 py-1 text-[12.5px] font-medium text-brand transition-all duration-150 hover:border-brand/50 hover:bg-brand/15 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
          >
            {subject}
          </Link>
        ))}
      </div>
    </div>
  );
}
