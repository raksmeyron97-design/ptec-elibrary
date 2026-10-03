// components/ui/home/StartHere.tsx
// Homepage band 2, "Start here": what is in the library (left, 7/12) beside
// what a reader came to do (right, 5/12). It replaces three bands — Start with
// your goal, Browse by Collection and Browse by Subject — that each answered
// one half of "where do I begin?".
import { getTranslations } from "next-intl/server";
import type { LearningPathSummary } from "@/app/actions/learning-paths";
import CollectionGrid from "./CollectionGrid";
import StartWithGoal from "./StartWithGoal";
import { HomeSection, SectionHeader } from "./HomeSection";

export default async function StartHere({ paths }: { paths: LearningPathSummary[] }) {
  const t = await getTranslations("home");
  return (
    <HomeSection surface="paper" labelledBy="start-here-title">
      <SectionHeader
        id="start-here-title"
        eyebrow={t("collectionsGridEyebrow")}
        title={t("goalsTitle")}
        lede={t("goalsBody")}
      />
      <div className="grid gap-10 lg:grid-cols-[7fr_5fr] lg:gap-12">
        <CollectionGrid
          heading={
            <h3 className="mb-3 font-record text-[19px] font-bold leading-snug text-text-heading">
              {t("collectionsGridTitle")}
            </h3>
          }
        />
        <StartWithGoal paths={paths} />
      </div>
    </HomeSection>
  );
}
