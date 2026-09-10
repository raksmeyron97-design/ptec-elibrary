// components/ui/home/HomeSection.tsx
// The one section shell and the one section header every homepage band uses.
//
// Before this file the bands carried three heading systems side by side — an
// underlined <SectionTitle> on three of them, an inline eyebrow-rule +
// clamp() heading on the rest — and three vertical padding scales (py-14,
// py-16, py-20). Scrolling the page, a reader met the "same" section header
// drawn three ways and could not tell whether the difference meant anything.
// It did not. Now a band cannot draw its own header: it takes this one.
//
// Backgrounds alternate paper / surface in PAGE order, and each band's cards
// wear the opposite surface so they stay lifted. The assignment lives with
// the band (its `surface` prop) rather than being computed, because optional
// bands (<TrendingResearch>, <NarrativeCards>) hide themselves inside
// Suspense and the page cannot know at render time which neighbours exist.
//
// Deliberately free of server-only imports: <LibraryNow> is a client
// component and imports these too.
import type { ReactNode } from "react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";

type Surface = "paper" | "surface";

const SURFACE_CLASS: Record<Surface, string> = {
  paper: "bg-paper",
  surface: "bg-bg-surface",
};

export function HomeSection({
  surface = "paper",
  labelledBy,
  className = "",
  children,
}: {
  surface?: Surface;
  /** id of the <SectionHeader> title, for aria-labelledby. */
  labelledBy?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`border-b border-divider/60 ${SURFACE_CLASS[surface]} ${className}`}
      aria-labelledby={labelledBy}
    >
      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-14 md:px-12 md:py-16">
        {children}
      </div>
    </section>
  );
}

export type SectionAction = {
  href: string;
  label: string;
  /** false for signpost links whose RSC payload is not worth speculating on. */
  prefetch?: boolean;
};

// No display utility here: the desktop link adds `hidden sm:inline-flex`, the
// mobile one `inline-flex`, and putting either in the shared string would
// leave two display utilities fighting on one element.
const ACTION_CLASS =
  "group min-h-[40px] shrink-0 items-center gap-1.5 rounded-sm text-[13.5px] font-semibold text-brand transition-colors hover:text-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50";

export function SectionHeader({
  id,
  eyebrow,
  title,
  lede,
  tone = "brand",
  action,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lede?: string;
  /** brand = navy eyebrow (discovery bands); accent = gold (orientation bands). */
  tone?: "brand" | "accent";
  /** Desktop "view all" link, right-aligned. Pair with <SectionMobileLink>. */
  action?: SectionAction;
}) {
  const locale = useLocale();
  // Letter-spaced capitals are a Latin convention; Khmer has no case, and its
  // stacked vowel signs collide when tracked.
  const latinEyebrow = locale === "en" ? "uppercase tracking-[0.2em]" : "tracking-normal";
  const rule = tone === "brand" ? "from-brand to-accent" : "from-accent to-brand";
  const eyebrowColor = tone === "brand" ? "text-brand" : "text-accent-text";

  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0 max-w-2xl">
        <div className="mb-2 flex items-center gap-3">
          <span className={`h-[3px] w-7 shrink-0 rounded-full bg-gradient-to-r ${rule}`} aria-hidden />
          <span className={`text-[11px] font-bold ${eyebrowColor} ${latinEyebrow}`}>{eyebrow}</span>
        </div>
        <h2
          id={id}
          className="font-khmer-serif font-bold leading-tight tracking-tight text-text-heading"
          style={{ fontSize: "clamp(22px, 2.4vw, 32px)" }}
        >
          {title}
        </h2>
        {lede && <p className="mt-2 text-[14.5px] leading-relaxed text-text-muted">{lede}</p>}
      </div>
      {action && (
        <Link
          href={action.href}
          prefetch={action.prefetch}
          className={`hidden sm:inline-flex ${ACTION_CLASS}`}
        >
          {action.label}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}

/** The phone counterpart of a header action: below the content, under the thumb. */
export function SectionMobileLink({ href, label, prefetch }: SectionAction) {
  return (
    <div className="mt-6 sm:hidden">
      <Link href={href} prefetch={prefetch} className={`inline-flex ${ACTION_CLASS}`}>
        {label}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
