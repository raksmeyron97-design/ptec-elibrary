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
// Since the 2026-10 redesign it is the right-hand card of the News band, on
// the plate: two action rows that open the same dialogs as before, and one
// fact line. It still sits after the shelf, where a reader who looked and did
// not find something meets it.
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
import { FileUp, BookPlus, ChevronRight } from "lucide-react";
import { getContributionCountCached } from "@/lib/home-data";
import ContributeDialog from "./ContributeDialog";
import { COLLECTION_COUNT_MIN_DISPLAY } from "./CollectionGrid";

export default async function GrowTheCollection({
  headingLevel = "h3",
}: {
  /** h2 when the card stands alone in its band (no news to head it). */
  headingLevel?: "h2" | "h3";
} = {}) {
  const Heading = headingLevel;
  const [t, fulfilled] = await Promise.all([
    getTranslations("home"),
    getContributionCountCached(),
  ]);

  // One fact line: how many reader submissions the library has added, once
  // that figure is worth printing; until then, the promise that contributors
  // are credited. Same floor as the collection tiles — "1 submission added"
  // undersells the invitation it sits under.
  const fact =
    fulfilled >= COLLECTION_COUNT_MIN_DISPLAY
      ? t("growStatFulfilled", { count: fulfilled })
      : t("growStatCredit");

  // An action row on the plate. The whole row is the dialog's trigger button,
  // so title and line are its accessible name.
  const row =
    "group flex w-full items-center gap-3.5 rounded-xl border border-white/18 bg-white/8 p-3.5 text-left " +
    "transition-colors hover:bg-white/14 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400";

  const rowContent = (Icon: typeof FileUp, title: string, line: string) => (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-gold-400" aria-hidden>
        <Icon className="h-5 w-5" strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-white">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-blue-100">{line}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-blue-100 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </>
  );

  return (
    // id="contribute": the footer links to /#contribute.
    <aside
      id="contribute"
      aria-labelledby="grow-title"
      className="scroll-mt-20 rounded-2xl bg-plate p-6 text-white shadow-md sm:p-7"
    >
      <p className="text-[11.5px] font-bold text-gold-400">{t("growEyebrow")}</p>
      <Heading id="grow-title" className="mt-2 font-record text-[24px] font-bold leading-tight text-white [text-wrap:balance]">
        {t("growTitle")}
      </Heading>
      <p className="mt-2 text-[14px] leading-relaxed text-blue-100">{t("growBody")}</p>

      <div className="mt-5 space-y-2.5">
        <ContributeDialog
          kind="deposit"
          triggerClassName={row}
          triggerLabel={t("growDepositTitle")}
          triggerContent={rowContent(FileUp, t("growDepositTitle"), t("growDepositShort"))}
        />
        <ContributeDialog
          kind="acquisition"
          triggerClassName={row}
          triggerLabel={t("growRequestTitle")}
          triggerContent={rowContent(BookPlus, t("growRequestTitle"), t("growRequestShort"))}
        />
      </div>

      <p className="mt-5 border-t border-white/15 pt-4 text-[13px] text-blue-100">{fact}</p>
    </aside>
  );
}
