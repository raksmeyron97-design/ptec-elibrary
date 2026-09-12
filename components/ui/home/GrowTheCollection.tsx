// components/ui/home/GrowTheCollection.tsx
// Replaces <ThisWeekAtPtec> ("New and noteworthy"), which showed a fifth view of
// the same handful of books the four shelves above it were already showing.
//
// This slot asks for something instead of displaying something. The reason
// is the shape of the collection: hundreds of books but a single thesis and
// no publications. No amount of ranking or layout work fixes that — a teacher
// education college's library grows when its own students and lecturers put
// their work into it, and until now the site offered them no way to.
//
// It sits AFTER every discovery band (popular, new, by subject) on purpose:
// the reader most likely to request a book is the one who has just looked
// and not found it, and a deposit ask lands better once the collection's
// thinness in research is visible than before a reader has seen anything.
//
// Two doors, both landing in the SAME librarian queue (/admin/book-requests)
// via migration 0119's `kind` column:
//
//   deposit     — an author offers their own thesis
//   acquisition — a reader asks the library to source a book
//
// The right-hand door is not new: submitBookRequest() has existed since 0042,
// but its only entry point was a button at the bottom of /books, below the
// pagination. Surfacing it here is most of its value.
//
// Server component: the counts are prerendered for everyone. Only the two
// dialogs are client islands, and they read auth from <SessionProvider> rather
// than the server — a cookies() read anywhere in this tree would stop the
// homepage prerendering (see the page.tsx header).
import { getTranslations } from "next-intl/server";
import { FileUp, BookPlus, Sparkles } from "lucide-react";
import { getCollectionStats } from "@/lib/collection-stats";
import { getContributionCountCached } from "@/lib/home-data";
import ContributeDialog from "./ContributeDialog";
import { HomeSection, SectionHeader } from "./HomeSection";

export default async function GrowTheCollection() {
  const [t, stats, fulfilled] = await Promise.all([
    getTranslations("home"),
    getCollectionStats(),
    getContributionCountCached(),
  ]);

  // Research held today — the figure the deposit door is asking to move.
  //
  // getCollectionStats() returns null when the stats view is unreachable.
  // Unlike <TrustBar>, which is nothing BUT figures and hides itself, this
  // section's substance is the two doors: a missing count drops the one line
  // that carries it, never the invitation.
  const research = stats ? stats.theses + stats.publications : null;

  const doorCard =
    "group flex h-full flex-col rounded-2xl border border-divider bg-bg-surface p-5 " +
    "transition-all hover:border-brand/40 hover:shadow-[0_10px_32px_-12px_rgba(11,21,53,0.24)] sm:p-7";

  // Both buttons span their card: they are each card's single primary action,
  // and matching the card width reads as deliberate rather than as a control
  // that failed to size itself. (A `sm:w-auto` here would be inert anyway —
  // the card is a flex column, so align-items:stretch wins at every width.)
  const doorButton =
    "focus-field mt-5 inline-flex items-center justify-center gap-2 rounded-[12px] " +
    "bg-brand px-5 py-3 text-[14px] font-bold text-brand-contrast outline-none " +
    "transition hover:bg-brand-hover";

  const doorButtonQuiet =
    "focus-field mt-5 inline-flex items-center justify-center gap-2 rounded-[12px] " +
    "border border-divider bg-paper px-5 py-3 text-[14px] font-bold text-text-body outline-none " +
    "transition hover:border-brand/50 hover:text-brand";

  return (
    <HomeSection id="contribute" surface="paper" labelledBy="grow-title">
      <SectionHeader
        id="grow-title"
        eyebrow={t("growEyebrow")}
        title={t("growTitle")}
        lede={t("growBody")}
      />

      {/* ── The two doors ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Deposit — the primary ask, and the one the collection needs most. */}
        <div className={doorCard}>
          <span
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand/[0.08] text-brand transition-colors group-hover:bg-brand group-hover:text-brand-contrast"
            aria-hidden
          >
            <FileUp className="h-[23px] w-[23px]" strokeWidth={1.9} />
          </span>
          <h3 className="mt-4 font-khmer-serif text-[19px] font-bold leading-snug text-text-heading">
            {t("growDepositTitle")}
          </h3>
          <p className="mt-2 flex-1 text-[14px] leading-relaxed text-text-muted">
            {t("growDepositBody")}
          </p>
          <ContributeDialog
            kind="deposit"
            triggerClassName={doorButton}
            triggerLabel={t("growDepositCta")}
          />
        </div>

        {/* Acquisition — the existing request flow, finally given a front door. */}
        <div className={doorCard}>
          <span
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/[0.12] text-accent-text transition-colors group-hover:bg-accent group-hover:text-brand"
            aria-hidden
          >
            <BookPlus className="h-[23px] w-[23px]" strokeWidth={1.9} />
          </span>
          <h3 className="mt-4 font-khmer-serif text-[19px] font-bold leading-snug text-text-heading">
            {t("growRequestTitle")}
          </h3>
          <p className="mt-2 flex-1 text-[14px] leading-relaxed text-text-muted">
            {t("growRequestBody")}
          </p>
          <ContributeDialog
            kind="acquisition"
            triggerClassName={doorButtonQuiet}
            triggerLabel={t("growRequestCta")}
          />
        </div>
      </div>

      {/* ── Where the collection stands ──
          Counts come from getCollectionStats(); nothing here is estimated,
          and no count query is run in this component (see
          lib/resource-stats-consistency.test.ts). */}
      <p className="mt-6 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-text-muted">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent-text" aria-hidden />
        {research !== null && (
          <>
            <span>{t("growStatResearch", { count: research })}</span>
            <span aria-hidden>·</span>
          </>
        )}
        {fulfilled > 0 && (
          <>
            <span>{t("growStatFulfilled", { count: fulfilled })}</span>
            <span aria-hidden>·</span>
          </>
        )}
        {/* A statement, not a link: brand colour plus an arrow here would read
            as a destination and there isn't one. */}
        <span>{t("growStatCredit")}</span>
      </p>
    </HomeSection>
  );
}
