import Link from "next/link";

type FilterSidebarProps = {
  departments: string[];        // fetched from DB by parent page
  selectedDept?: string;
  selectedFormat?: string;
  selectedLanguage?: string;
};

const formats = ["PDF", "Print", "Audio", "Video"];
const languages = ["English", "Khmer", "English / Khmer"];

export default function FilterSidebar({
  departments = [],
  selectedDept,
  selectedFormat,
  selectedLanguage,
}: FilterSidebarProps) {
  return (
    <div className="sticky top-[88px] rounded-[20px] border border-slate-200 bg-white p-[22px]">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-900">Filters</h2>
        <Link href="/books" className="text-[12.5px] font-semibold text-[#0C7C8A] hover:underline">
          Reset
        </Link>
      </div>

      {/* ── Department ── */}
      <FilterSection title="Department">
        {departments.map((dept) => {
          const active =
            !!selectedDept && dept.toLowerCase().includes(selectedDept.toLowerCase());
          return (
            <Link
              key={dept}
              href={active ? "/books" : `/books?dept=${encodeURIComponent(dept.toLowerCase())}`}
              className={`flex items-center justify-between rounded-[11px] px-3 py-[9px] text-sm transition-all duration-150 ${
                active
                  ? "bg-[#0C7C8A] font-semibold text-white"
                  : "font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <span>{dept}</span>
              {active && (
                <svg className="h-3.5 w-3.5 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </Link>
          );
        })}
      </FilterSection>

      {/* ── Format ── */}
      <FilterSection title="Format">
        <div className="grid grid-cols-2 gap-2">
          {formats.map((fmt) => {
            const active = selectedFormat === fmt.toLowerCase();
            return (
              <Link
                key={fmt}
                href={active ? "/books" : `/books?format=${fmt.toLowerCase()}`}
                className={`rounded-[11px] border px-3 py-2.5 text-center text-[13px] font-semibold transition-all duration-150 ${
                  active
                    ? "border-[#0C7C8A] bg-[#0C7C8A] text-white"
                    : "border-slate-200 text-slate-600 hover:border-[#0C7C8A]/50 hover:text-[#0C7C8A]"
                }`}
              >
                {fmt}
              </Link>
            );
          })}
        </div>
      </FilterSection>

      {/* ── Language ── */}
      <FilterSection title="Language" last>
        {languages.map((lang) => {
          const active =
            !!selectedLanguage && lang.toLowerCase().includes(selectedLanguage.toLowerCase());
          return (
            <Link
              key={lang}
              href={active ? "/books" : `/books?language=${encodeURIComponent(lang.toLowerCase())}`}
              className={`flex items-center justify-between rounded-[11px] px-3 py-[9px] text-sm transition-all duration-150 ${
                active
                  ? "bg-[#0C7C8A] font-semibold text-white"
                  : "font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <span>{lang}</span>
              {active && (
                <svg className="h-3.5 w-3.5 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </Link>
          );
        })}
      </FilterSection>
    </div>
  );
}

// ── Reusable section ──────────────────────────────────────────
function FilterSection({
  title,
  children,
  last = false,
}: {
  title: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={last ? "" : "mb-6"}>
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}