"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Compass, RotateCcw } from "lucide-react";
import type { LearningPathSummary, LearningPathDetail, PathProgressRecord } from "@/app/actions/learning-paths";
import { getMyPathProgress } from "@/app/actions/learning-paths";
import type { PathsFilterParams } from "@/lib/learning-paths/filter";
import PathsFilterBar from "./PathsFilterBar";
import PathCard from "./PathCard";
import ContinueRail from "./ContinueRail";
import FeaturedPath from "./FeaturedPath";

interface PathsCatalogueClientProps {
  paths: LearningPathSummary[];
  totalCount: number;
  filterParams: PathsFilterParams;
  featured?: LearningPathDetail | null;
}

export default function PathsCatalogueClient({
  paths,
  totalCount,
  filterParams,
  featured,
}: PathsCatalogueClientProps) {
  const t = useTranslations("paths");
  const [progressRecords, setProgressRecords] = useState<PathProgressRecord[]>([]);

  // Fetch signed-in learner's progress client-side so page shell remains shared-cache-safe
  useEffect(() => {
    let cancelled = false;
    getMyPathProgress()
      .then((records) => {
        if (!cancelled && records.length > 0) {
          setProgressRecords(records);
        }
      })
      .catch(() => {
        // Silently handle anonymous / offline
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const progressMap = new Map(progressRecords.map((r) => [r.pathId, r]));
  const inProgress = progressRecords.filter((r) => !r.completedAt && r.completedSteps > 0);
  const completed = progressRecords.filter((r) => !!r.completedAt);

  const hasActiveFilters =
    filterParams.level !== "all" || filterParams.q !== "" || filterParams.sort !== "popular";

  const showFeatured = !hasActiveFilters && !!featured;
  const gridPaths = showFeatured ? paths.filter((p) => p.id !== featured.id) : paths;

  return (
    <div>
      {/* Continue rail for enrolled learners */}
      {progressRecords.length > 0 && (
        <ContinueRail inProgress={inProgress} completed={completed} />
      )}

      {/* Featured path hero lead card */}
      {showFeatured && (
        <div className="mb-8">
          <FeaturedPath
            detail={featured}
            progress={progressMap.get(featured.id) ?? null}
          />
        </div>
      )}

      {/* Filter and search bar */}
      <PathsFilterBar
        currentLevel={filterParams.level}
        currentQuery={filterParams.q}
        currentSort={filterParams.sort}
        totalCount={totalCount}
        filteredCount={paths.length}
      />

      {/* Grid or SSR Empty State */}
      {gridPaths.length === 0 ? (
        <div className="rounded-2xl border border-divider bg-bg-surface px-4 py-14 text-center">
          <Compass className="mx-auto mb-3 h-10 w-10 text-text-muted/40" aria-hidden="true" />
          <h3 className="text-base font-bold text-text-heading">{t("noResultsTitle")}</h3>
          <p className="mt-1.5 text-xs text-text-muted">{t("noResultsHint")}</p>
          <div className="mt-4">
            <Link
              href="/paths"
              className="focus-field inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-xs font-semibold text-brand-contrast transition-colors hover:bg-brand/90"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {t("resetFilters")}
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {gridPaths.map((p, idx) => (
            <PathCard
              key={p.id}
              path={p}
              progress={progressMap.get(p.id) ?? null}
              index={idx}
            />
          ))}
        </div>
      )}
    </div>
  );
}
