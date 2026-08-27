// components/ui/dashboard/LearningIntent.tsx
// TERTIARY section — a lightweight discovery shelf. Every tile maps to a
// real existing route; no new content type or page is introduced.
import { Link } from "@/i18n/navigation";
import { NotebookPen, GraduationCap, FlaskConical, Compass } from "lucide-react";
import { getTranslations } from "next-intl/server";
import HorizontalCarousel from "@/components/ui/core/HorizontalCarousel";

export default async function LearningIntent() {
  const t = await getTranslations("dashboard");

  const tiles = [
    { href: "/books",        icon: NotebookPen,   title: t("intentLessonTitle"),   desc: t("intentLessonDesc") },
    { href: "/theses",       icon: GraduationCap, title: t("intentThesisTitle"),   desc: t("intentThesisDesc") },
    { href: "/publications", icon: FlaskConical,  title: t("intentResearchTitle"), desc: t("intentResearchDesc") },
    { href: "/paths",        icon: Compass,       title: t("intentExploreTitle"),  desc: t("intentExploreDesc") },
  ];

  return (
    <section aria-label={t("intentHeading")}>
      <h2 className="mb-3 text-[15px] font-bold text-text-heading">{t("intentHeading")}</h2>
      <HorizontalCarousel>
        {tiles.map(({ href, icon: Icon, title, desc }) => (
          <Link
            key={href + title}
            href={href}
            className="focus-field group flex w-[220px] shrink-0 flex-col gap-2 rounded-2xl border border-divider bg-bg-surface p-4 transition hover:border-brand/30 hover:bg-brand/5 sm:w-[240px]"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10 text-brand" aria-hidden="true">
              <Icon className="h-4 w-4" />
            </div>
            <p className="text-[13.5px] font-semibold text-text-heading">{title}</p>
            <p className="text-[12px] leading-relaxed text-text-muted">{desc}</p>
          </Link>
        ))}
      </HorizontalCarousel>
    </section>
  );
}
