// components/ui/dashboard/primitives.tsx
// The dashboard's shared surface vocabulary: one card, one heading scale,
// one "view all" link, one empty state. Every section used to carry its own
// copy of each — five empty-state variants, three heading sizes, cards with
// and without shadows — which is most of why the page read as a stack of
// unrelated widgets rather than one workspace.
//
// No hooks and no server-only imports, so both the server sections and the
// client tabs can render these.
import type { ComponentType, ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";

/** The homepage's request dialog — the same deep link the footer uses. */
export const REQUEST_A_BOOK_HREF = "/?action=request#contribute";

/** The one card surface: flat, hairline border, no drop shadow. */
export const CARD = "rounded-2xl border border-divider bg-bg-surface";

/** A page-level section heading (My Library, Recommended for you, …). */
export function SectionHeading({
  id, title, description, action,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 sm:mb-5">
      <div className="min-w-0">
        <h2 id={id} className="font-khmer-serif text-[19px] font-bold leading-snug text-text-heading sm:text-[21px]">
          {title}
        </h2>
        {description && <p className="mt-1 text-[13.5px] leading-relaxed text-text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** The header row inside a card. The title is the card's h2. */
export function CardHeader({
  id, title, icon: Icon, meta, action,
}: {
  id: string;
  title: string;
  icon?: ComponentType<{ className?: string }>;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-brand-soft text-brand" aria-hidden="true">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0">
          <h2 id={id} className="truncate text-[15px] font-bold leading-snug text-text-heading">{title}</h2>
          {meta && <p className="truncate text-[12px] text-text-muted">{meta}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/** "View all →" — text link with a nudging arrow. */
export function ArrowLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={`focus-field group inline-flex shrink-0 items-center gap-1 rounded-md text-[13px] font-semibold text-brand transition-colors hover:text-brand-hover ${className}`}
    >
      {children}
      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none rtl:rotate-180" aria-hidden="true" />
    </Link>
  );
}

/** Primary / secondary button-links, sized once. */
export const BUTTON_PRIMARY =
  "focus-field inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-[13.5px] font-semibold text-brand-contrast transition-colors hover:bg-brand-hover";
export const BUTTON_SECONDARY =
  "focus-field inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-divider bg-bg-surface px-4 text-[13.5px] font-semibold text-text-body transition-colors hover:border-brand/30 hover:text-brand";

/** Empty state. `compact` for inside a card, full for a whole panel. */
export function EmptyState({
  icon: Icon, title, description, action, compact = false,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: { href: string; label: string };
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center text-center ${
        compact ? "px-5 py-7" : "rounded-2xl border border-dashed border-divider bg-bg-surface px-6 py-12"
      }`}
    >
      <span
        className={`mb-3 flex items-center justify-center rounded-2xl bg-surface-brand-soft text-brand ${compact ? "h-10 w-10" : "h-12 w-12"}`}
        aria-hidden="true"
      >
        <Icon className={compact ? "h-[18px] w-[18px]" : "h-5 w-5"} />
      </span>
      <p className="text-[14px] font-semibold text-text-heading">{title}</p>
      {description && <p className="mt-1 max-w-xs text-[12.5px] leading-relaxed text-text-muted">{description}</p>}
      {action && (
        <Link href={action.href} className={`${BUTTON_PRIMARY} mt-4 h-9 px-4 text-[13px]`}>
          {action.label}
        </Link>
      )}
    </div>
  );
}
