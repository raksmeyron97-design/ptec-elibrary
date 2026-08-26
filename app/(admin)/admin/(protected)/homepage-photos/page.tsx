import { getTranslations } from "next-intl/server";
import { ExternalLink, Eye, EyeOff, Images, LayoutTemplate } from "lucide-react";
import { PageHeader } from "@/components/admin/kit";
import { getAllPhotos } from "@/app/actions/homepage-photos";
import HomepagePhotosClient from "./_components/HomepagePhotosClient";

export const metadata = { title: "Homepage Photos - PTEC Library" };

/**
 * /admin/homepage-photos — the editorial surface for the homepage gallery.
 *
 * getAllPhotos() holds the permission check (requirePermission), so the page
 * needs no separate guard: an under-privileged user gets the guard's 403
 * rather than a rendered-but-empty page.
 */
export default async function HomepagePhotosPage() {
  const [t, photos] = await Promise.all([
    getTranslations("adminHomepagePhotos"),
    getAllPhotos(),
  ]);

  const active = photos.filter((p) => p.is_active).length;

  const stats = [
    { label: t("statTotal"),    value: photos.length,          icon: Images,         tone: "text-blue-600 bg-blue-50" },
    { label: t("statActive"),   value: active,                 icon: Eye,            tone: "text-emerald-600 bg-emerald-50" },
    { label: t("statHidden"),   value: photos.length - active, icon: EyeOff,         tone: "text-amber-600 bg-amber-50" },
    { label: t("statInHero"),   value: Math.min(active, 3),    icon: LayoutTemplate, tone: "text-violet-600 bg-violet-50" },
  ];

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="focus-field inline-flex cursor-pointer items-center gap-2 rounded-lg border border-divider bg-bg-surface px-3.5 py-2 text-sm font-semibold text-text-body transition hover:bg-paper"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            {t("viewHomepage")}
          </a>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="flex items-center gap-3 rounded-xl border border-divider bg-bg-surface p-4 shadow-sm">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`} aria-hidden>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight text-text-heading">{value}</p>
              <p className="truncate text-xs text-text-muted">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <HomepagePhotosClient photos={photos} />
    </div>
  );
}
