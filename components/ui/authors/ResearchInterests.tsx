import { Link } from "@/i18n/navigation";

/**
 * The author's stated research interests.
 *
 * Rendered as restrained scholarly tags, not as coloured hashtags: a hairline
 * border, body-text weight, no fill. Each one links into the library's own
 * search for that term, which is what makes them useful rather than decorative
 * — an interest that leads nowhere is a label, an interest that leads to the
 * collection is a finding aid.
 */
export default function ResearchInterests({
  heading,
  interests,
  searchLabel,
}: {
  heading: string;
  interests: string[];
  /**
   * Accessible name for each tag, e.g. topic => `Search the library for ${topic}`.
   * A function rather than a template string: this is a Server Component, so
   * the caller can hand it the real translator instead of a string with a
   * placeholder for this component to string-replace.
   */
  searchLabel: (topic: string) => string;
}) {
  const clean = interests.map((i) => i.trim()).filter(Boolean);
  if (clean.length === 0) return null;

  return (
    <section aria-labelledby="author-interests-heading">
      <h2
        id="author-interests-heading"
        className="text-[13px] font-bold uppercase tracking-[0.12em] text-text-muted"
      >
        {heading}
      </h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {clean.map((interest) => (
          <li key={interest}>
            <Link
              href={`/search?q=${encodeURIComponent(interest)}`}
              aria-label={searchLabel(interest)}
              className="focus-field inline-flex min-h-9 items-center rounded-lg border border-divider bg-bg-surface px-3 py-1.5 text-[13px] font-medium text-text-body transition-colors hover:border-brand/40 hover:text-brand"
            >
              {interest}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
