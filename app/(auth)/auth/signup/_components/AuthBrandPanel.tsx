import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";

/**
 * The left-column trust panel.
 *
 * Deliberately thin: logo, one sentence, three checkmarks. The previous
 * signup screen used this space for the vision statement, three missions,
 * RIICE core values, a programs list and live engagement stats — all real
 * PTEC content, but stacked on a page whose one job is "fill in four fields".
 * That content belongs on /about; here it competed with the form for
 * attention on a task that should take under a minute.
 *
 * No props, no data fetching: everything is static copy, so the signup page
 * itself no longer needs to resolve site settings or run any query to render
 * this column (see the note in page.tsx about the stats queries this used to
 * carry over from the login page).
 */
export default function AuthBrandPanel() {
  const t = useTranslations("auth");
  const points = [t("trustPoint1"), t("trustPoint2"), t("trustPoint3")];

  return (
    <div className="relative hidden w-[42%] flex-col overflow-hidden lg:flex">
      <Image
        src="/hero/ptec-library-960.jpg"
        alt=""
        aria-hidden="true"
        fill
        className="object-cover object-center"
        priority
      />
      <div className="absolute inset-0 bg-gradient-to-b from-blue-950/90 via-blue-950/84 to-blue-950/95" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(30,58,138,0.4),transparent)]" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.8) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(70% 60% at 30% 40%, #000, transparent 80%)",
        }}
      />

      <div className="relative z-10 flex flex-1 flex-col justify-center px-11 py-10">
        <Link href="/" className="group mb-10 flex w-fit items-center gap-3.5">
          <div className="flex h-13 w-13 items-center justify-center rounded-xl border border-white/20 bg-white/10 p-2 backdrop-blur-md transition group-hover:bg-white/20">
            <Image src="/logo_footer.webp" alt="PTEC" width={36} height={36} className="object-contain" />
          </div>
          <div>
            <span className="block text-lg font-bold tracking-wide text-white drop-shadow">
              PTEC <span className="text-brand">e-Library</span>
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/50">
              {t("digitalLearningHub")}
            </span>
          </div>
        </Link>

        <p className="max-w-[320px] text-xl font-medium leading-relaxed text-white/90 drop-shadow">
          {t("brandTagline")}
        </p>

        <ul className="mt-8 space-y-3">
          {points.map((point) => (
            <li key={point} className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-300/15 text-amber-300">
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
              </span>
              <span className="text-[14px] text-white/85">{point}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="relative z-10 px-11 pb-8 text-[11px] text-white/35">
        {t("copyrightShort", { year: new Date().getFullYear() })}
      </p>
    </div>
  );
}
