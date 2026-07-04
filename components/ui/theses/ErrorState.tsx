import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Distinct from EmptyState — this renders when the query itself failed
 * (e.g. the database is unreachable), not when it succeeded with zero rows.
 * Conflating the two would tell a user "no theses found" when the real
 * problem is a broken connection.
 */
export default function ErrorState({ message }: { message?: string }) {
  return (
    <div className="fade-rise-in flex min-h-[320px] sm:min-h-[400px] flex-col items-center justify-center rounded-2xl border border-divider bg-bg-surface p-6 sm:p-10 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
        <AlertTriangle className="h-8 w-8 text-red-500" strokeWidth={1.75} aria-hidden />
      </span>
      <h2 className="mt-4 text-lg sm:text-xl font-bold text-text-heading">
        Couldn&apos;t load theses
      </h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-text-muted">
        {message ?? "Something went wrong while fetching the repository. Please try again in a moment."}
      </p>
      <Link
        href="/theses"
        className="mt-5 inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full bg-brand px-6 text-sm font-semibold text-brand-contrast transition-colors duration-150 hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 focus-visible:ring-offset-2"
      >
        <RotateCcw className="h-4 w-4" />
        Try again
      </Link>
    </div>
  );
}
