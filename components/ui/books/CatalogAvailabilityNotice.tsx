import { CATALOG_AVAILABILITY_IS_LIVE } from "@/lib/catalog";

/**
 * "This availability is not live" — shown wherever the public catalogue states
 * how many copies can be borrowed, until CATALOG_AVAILABILITY_IS_LIVE is true.
 *
 * A figure like "2 of 3 available" reads as a fact about the shelf. While loans
 * are recorded in another system it is only a fact about this database, and a
 * reader who crosses town on the strength of it deserves to have been told.
 */
export default function CatalogAvailabilityNotice({ text, className = "" }: { text: string; className?: string }) {
  if (CATALOG_AVAILABILITY_IS_LIVE) return null;
  return (
    <p
      className={`flex items-start gap-2 rounded-xl border border-info-line bg-info-soft px-3 py-2 text-[12px] leading-relaxed text-info-text ${className}`}
    >
      <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
      </svg>
      <span>{text}</span>
    </p>
  );
}
