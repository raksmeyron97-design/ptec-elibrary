import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * The outer chrome every admin create/edit page shares: a breadcrumb above a
 * centred white card, on the app's grey ground.
 *
 * Forms used to stretch to `max-w-7xl` (1280px), which put a two-column grid's
 * second column ~900px from its label and left a 250-character measure on any
 * full-width textarea. The card is capped at 900px — the width the redesign
 * specifies, and close to the `max-w-5xl` the form standard already asked for.
 *
 * The breadcrumb sits OUTSIDE the card on purpose: it is navigation away from
 * this page, not part of the thing being edited, and putting it inside made it
 * compete with the form's own header for the first line of the card.
 *
 * `aside` opts into the split layout (form left, sticky preview right) that
 * only the team form needs today. Without it the card is simply centred.
 */
export default function FormShell({
  backHref,
  backLabel,
  title,
  description,
  headerActions,
  aside,
  children,
}: {
  backHref: string;
  backLabel: string;
  title: React.ReactNode;
  description?: string;
  /** Right-aligned affordances on the card's header row. */
  headerActions?: React.ReactNode;
  /** Optional sticky right column on desktop; collapses below the form on mobile. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[900px] px-0 pb-8 sm:px-6 lg:max-w-[1280px]">
      {/* Breadcrumb — plain next/link, never i18n/navigation: /admin is
          outside the locale scheme and would pick up a /km prefix. */}
      <Link
        href={backHref}
        className="focus-field mb-4 ml-4 inline-flex items-center gap-2 rounded text-sm font-medium text-text-muted transition hover:text-text-heading sm:ml-0"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {backLabel}
      </Link>

      <div className={aside ? "flex flex-col gap-6 lg:flex-row lg:items-start" : ""}>
        <div
          className={`min-w-0 border-y border-divider bg-bg-surface shadow-sm sm:rounded-xl sm:border ${
            aside ? "flex-1 lg:max-w-[640px]" : "mx-auto w-full max-w-[900px]"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-6 sm:px-8">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-text-heading">{title}</h1>
              {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
            </div>
            {headerActions && <div className="flex shrink-0 items-center gap-2">{headerActions}</div>}
          </div>
          {children}
        </div>

        {aside && (
          <div className="w-full lg:sticky lg:top-6 lg:w-80 lg:shrink-0">{aside}</div>
        )}
      </div>
    </div>
  );
}
