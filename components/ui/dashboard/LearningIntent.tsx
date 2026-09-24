// components/ui/dashboard/LearningIntent.tsx
// A lightweight discovery shelf. Every tile maps to a real existing route;
// no new content type or page is introduced. A grid rather than a carousel:
// four tiles fit every width at two or four across, and the carousel hid the
// fourth behind an arrow on a desktop with room to spare.
import { Link } from "@/i18n/navigation";
import { NotebookPen, GraduationCap, FlaskConical, Compass, ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { JOURNALS_PATH } from "@/lib/journals/urls";
import { CARD, SectionHeading } from "@/components/ui/dashboard/primitives";

export default async function LearningIntent() {
  const t = await getTranslations("dashboard");

  const tiles = [
    { href: "/books",       icon: NotebookPen,   title: t("intentLessonTitle"),   desc: t("intentLessonDesc") },
    { href: "/theses",      icon: GraduationCap, title: t("intentThesisTitle"),   desc: t("intentThesisDesc") },
    { href: JOURNALS_PATH,  icon: FlaskConical,  title: t("intentResearchTitle"), desc: t("intentResearchDesc") },
    { href: "/paths",       icon: Compass,       title: t("intentExploreTitle"),  desc: t("intentExploreDesc") },
  ];

  return (
    <section aria-labelledby="intent-heading">
      <SectionHeading id="intent-heading" title={t("intentHeading")} />
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {tiles.map(({ href, icon: Icon, title, desc }) => (
          <li key={href + title}>
            <Link
              href={href}
              className={`${CARD} focus-field group flex h-full flex-col p-4 transition-colors hover:border-brand/30 sm:p-5`}
            >
              <span className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-brand-soft text-brand" aria-hidden="true">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <ArrowRight className="h-4 w-4 text-text-muted opacity-0 transition group-hover:translate-x-0.5 group-hover:text-brand group-hover:opacity-100 motion-reduce:transition-none rtl:rotate-180" aria-hidden="true" />
              </span>
              <span className="mt-3 text-[14px] font-semibold leading-snug text-text-heading group-hover:text-brand">{title}</span>
              <span className="mt-1 text-[12.5px] leading-relaxed text-text-muted max-sm:line-clamp-3">{desc}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
