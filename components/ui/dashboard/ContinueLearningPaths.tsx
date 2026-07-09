import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { GraduationCap, ChevronRight } from "lucide-react";
import type { InProgressPath } from "@/app/actions/learning-paths";

export default function ContinueLearningPaths({ paths }: { paths: InProgressPath[] }) {
  const t = useTranslations("dashboard");
  if (paths.length === 0) return null;

  return (
    <section aria-label={t("continuePath")} className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
      <p className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-text-muted">
        <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" /> {t("continuePath")}
      </p>
      <div className="flex flex-col gap-2.5">
        {paths.map((p) => {
          const pct = p.totalSteps > 0 ? Math.round((p.completedSteps / p.totalSteps) * 100) : 0;
          return (
            <Link
              key={p.id}
              href={`/paths/${p.slug}`}
              aria-label={t("pathProgress", { title: p.title, pct })}
              className="group flex items-center gap-3 rounded-xl border border-divider/60 bg-paper/40 p-2.5 transition hover:border-brand/30 hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {p.cover_url ? (
                <div className="relative h-12 w-9 shrink-0 overflow-hidden rounded-md border border-divider/60">
                  <Image src={p.cover_url} alt="" fill sizes="36px" className="object-cover" />
                </div>
              ) : (
                <div className="flex h-12 w-9 shrink-0 items-center justify-center rounded-md border border-divider/60 bg-brand/5" aria-hidden="true">
                  <GraduationCap className="h-4 w-4 text-brand/40" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-text-heading">{p.title}</p>
                <div className="mt-1 flex items-center gap-2">
                  <div
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-divider/60"
                  >
                    <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="shrink-0 text-[10.5px] font-semibold text-text-muted tabular-nums">{pct}%</span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-text-muted/50 transition-transform group-hover:translate-x-0.5 group-hover:text-brand rtl:rotate-180" aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
