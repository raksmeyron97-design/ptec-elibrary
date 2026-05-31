// lib/department-theme.tsx
import type { ReactNode } from "react";

/**
 * Per-department visual identity (color + icon).
 * Colours stay within the PTEC palette family (blue / gold / teal / indigo /
 * emerald / rose) so the page reads as one brand, just more scannable.
 *
 * Usage:
 *   const t = getDepartmentTheme("Mathematics");
 *   <div className={`${t.iconBg} ${t.iconText}`}>{t.icon}</div>
 *   <div className={t.topBorder}> ...card... </div>
 */

export type DepartmentTheme = {
  iconBg: string;      // tinted square behind the icon
  iconText: string;    // icon stroke colour
  topBorder: string;   // top accent rule colour (border-t-[3px] + colour)
  glow: string;        // soft radial used on hover backgrounds
  icon: ReactNode;
};

/* ── Icons (1.8 stroke, matches existing CollectionIcon) ─────────────── */
const ic = "h-6 w-6";
const s = {
  className: ic,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const Icons = {
  book: (
    <svg {...s}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
  ),
  math: (
    <svg {...s}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M9 12h2m4 0h-2m-2 0v-1m0 5v-1m-2 1h.01M15 16h.01" /></svg>
  ),
  science: (
    <svg {...s}><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" /><path d="M7 15h10" /></svg>
  ),
  language: (
    <svg {...s}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>
  ),
  literature: (
    <svg {...s}><path d="M12 3v18M5 7l7-4 7 4M5 7v10l7 4 7-4V7" /></svg>
  ),
  pedagogy: (
    <svg {...s}><path d="M22 10 12 5 2 10l10 5 10-5z" /><path d="M6 12v5c0 1 2.7 3 6 3s6-2 6-3v-5" /></svg>
  ),
  arts: (
    <svg {...s}><circle cx="12" cy="12" r="9" /><circle cx="8.5" cy="9.5" r="1" /><circle cx="15.5" cy="9.5" r="1" /><circle cx="9.5" cy="15" r="1" /><path d="M12 21a3 3 0 0 0 0-6 2 2 0 0 1-2-2" /></svg>
  ),
  tech: (
    <svg {...s}><path d="m8 9-3 3 3 3M16 9l3 3-3 3M13 6l-2 12" /></svg>
  ),
  social: (
    <svg {...s}><path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="3.5" /><path d="M22 21v-2a4 4 0 0 0-3-3.85M16 3.5a4 4 0 0 1 0 7" /></svg>
  ),
} as const;

/* ── Palettes ─────────────────────────────────────────────────────────── */
const palettes: Record<string, Omit<DepartmentTheme, "icon">> = {
  blue:    { iconBg: "bg-brand/5",     iconText: "text-brand",        topBorder: "border-t-blue-700",    glow: "from-brand/8" },
  gold:    { iconBg: "bg-gold-50",     iconText: "text-gold-700",     topBorder: "border-t-gold-500",    glow: "from-gold-400/15" },
  teal:    { iconBg: "bg-teal-50",     iconText: "text-teal-600",     topBorder: "border-t-teal-500",    glow: "from-teal-400/12" },
  indigo:  { iconBg: "bg-indigo-50",   iconText: "text-indigo-600",   topBorder: "border-t-indigo-500",  glow: "from-indigo-400/12" },
  emerald: { iconBg: "bg-emerald-50",  iconText: "text-emerald-600",  topBorder: "border-t-emerald-500", glow: "from-emerald-400/12" },
  rose:    { iconBg: "bg-rose-50",     iconText: "text-rose-600",     topBorder: "border-t-rose-500",    glow: "from-rose-400/12" },
};
const paletteOrder = ["blue", "gold", "teal", "indigo", "emerald", "rose"] as const;

/* keyword → { icon, preferred palette } */
const keywordMap: { match: RegExp; icon: keyof typeof Icons; palette: keyof typeof palettes }[] = [
  { match: /math|គណិត|algebra|geometr/i,                 icon: "math",       palette: "indigo" },
  { match: /sci|physic|chem|bio|រូប|គីមី|ជីវ/i,           icon: "science",    palette: "teal" },
  { match: /eng|lang|french|ភាសា|អង់គ្លេស/i,              icon: "language",   palette: "blue" },
  { match: /lit|khmer|អក្សរ|literature|ផ្នែកខ្មែរ/i,        icon: "literature", palette: "gold" },
  { match: /peda|teach|edu|គរុ|អប់រំ|method/i,           icon: "pedagogy",   palette: "blue" },
  { match: /art|music|draw|សិល្បៈ|តន្ត្រី/i,               icon: "arts",       palette: "rose" },
  { match: /tech|comput|ict|ព័ត៌មាន|coding|program/i,    icon: "tech",       palette: "emerald" },
  { match: /social|histor|geo|civic|សង្គម|ប្រវត្តិ/i,      icon: "social",     palette: "gold" },
];

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h);
}

export function getDepartmentTheme(department: string): DepartmentTheme {
  const found = keywordMap.find((k) => k.match.test(department));
  if (found) {
    return { ...palettes[found.palette], icon: Icons[found.icon] };
  }
  // Fallback: deterministic palette by name, generic book icon
  const palette = paletteOrder[hashString(department) % paletteOrder.length];
  return { ...palettes[palette], icon: Icons.book };
}
