// components/ui/FeaturedCollections.tsx
import Link from "next/link";
import { getDepartmentTheme } from "./department-theme";

type Props = {
  /** Department names (e.g. from getDepartmentPills). Renders up to `limit`. */
  departments: string[];
  limit?: number;
};

export default function FeaturedCollections({ departments, limit = 4 }: Props) {
  const items = departments.slice(0, limit);
  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
      {items.map((dept) => {
        const t = getDepartmentTheme(dept);
        return (
          <Link
            key={dept}
            href={`/books?dept=${encodeURIComponent(dept)}`}
            className={`group relative overflow-hidden rounded-lg border border-divider border-t-[3px] ${t.topBorder} bg-bg-surface p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md`}
          >
            {/* soft themed glow on hover */}
            <div
              aria-hidden
              className={`pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-gradient-to-br ${t.glow} to-transparent opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100`}
            />
            <div className={`relative mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${t.iconBg} ${t.iconText}`}>
              {t.icon}
            </div>
            <h3 className="relative font-khmer-serif text-lg font-bold text-text-heading">{dept}</h3>
            <div className={`relative mt-4 inline-flex items-center gap-1 text-[12.5px] font-semibold ${t.iconText}`}>
              View resources
              <svg className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
