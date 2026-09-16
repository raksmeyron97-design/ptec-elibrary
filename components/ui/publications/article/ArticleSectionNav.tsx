"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUp } from "lucide-react";
import type { ArticleSectionLink } from "@/lib/publications/article-layout";
import { EYEBROW } from "@/components/ui/publications/article/styles";

/**
 * The section whose top most recently crossed the reading line (30% down the
 * viewport). Scroll + requestAnimationFrame rather than an observer band: with
 * ten sections of very different heights a band misses short ones entirely,
 * and at the end of the page the last section must win even though its top
 * never reaches the line.
 */
function useActiveSection(idList: string[]): string | null {
  // Keyed on the joined ids: the caller rebuilds the array every render, and
  // the listener should only be re-attached when the sections change.
  const key = idList.join(" ");
  const [active, setActive] = useState<string | null>(idList[0] ?? null);

  useEffect(() => {
    const ids = key ? key.split(" ") : [];
    if (ids.length === 0) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = window.innerHeight * 0.3;
      let current: string | null = ids[0] ?? null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      setActive(atEnd ? ids[ids.length - 1] : current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [key]);

  return active;
}

/**
 * "On this page" for a journal article.
 *
 * `rail` is the desktop side rail: sticky, a vertical list with the current
 * section marked by a bar AND weight AND colour (never colour alone), sitting
 * under the tool block the rail opens with. `inline` is the phone's "Jump to" row: not
 * sticky, wrapping rather than scrolling sideways, so no entry hides past the
 * edge of the screen.
 *
 * The links are plain in-page anchors: the browser jumps, moves the focus
 * start point and updates the URL itself, and there is no animation to opt out
 * of. (Page-level `scroll-behavior: smooth` was considered and rejected: since
 * Next 16 it would also animate every previous/next navigation to the top.)
 *
 * Both variants are built from the same list the page built its sections
 * from (articleSections), so every entry has a target.
 */
export default function ArticleSectionNav({
  sections,
  variant,
}: {
  sections: ArticleSectionLink[];
  variant: "rail" | "inline";
}) {
  const t = useTranslations("publicationDetail");
  const ids = sections.map((s) => s.id);
  const active = useActiveSection(variant === "rail" ? ids : []);

  if (sections.length === 0) return null;

  if (variant === "inline") {
    return (
      <nav aria-label={t("onThisPage")} className="mb-10 border-y border-divider py-3">
        <p className={`mb-1 text-text-muted ${EYEBROW}`}>{t("jumpTo")}</p>
        <ul className="-mx-2 flex flex-wrap">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="inline-flex min-h-10 items-center rounded-md px-2 text-[14.5px] font-semibold text-brand underline decoration-brand/25 underline-offset-4 transition-colors hover:decoration-brand"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  const quiet =
    "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md text-[13.5px] font-semibold text-text-muted transition-colors hover:text-brand";

  return (
    <nav aria-label={t("onThisPage")}>
      <p className={`mb-3 text-text-muted ${EYEBROW}`}>{t("onThisPage")}</p>
      <ol className="border-l border-divider">
        {sections.map((s) => {
          const current = s.id === active;
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                // "location": where you are in the document, not the current page.
                aria-current={current ? "location" : undefined}
                className={`-ml-px block border-l-2 py-1.5 pl-4 text-[14px] leading-snug transition-colors ${
                  current
                    ? "border-brand font-semibold text-brand"
                    : "border-transparent text-text-muted hover:border-border-strong hover:text-text-heading"
                }`}
              >
                {s.label}
              </a>
            </li>
          );
        })}
      </ol>

      {/* Cite and the PDF used to hang off the bottom of this list. They are
          now the tool block ABOVE it (ArticleToolRail) — where the rail meets
          the masthead, rather than below ten section links. What is left is
          the one control that belongs to navigation itself. */}
      <div className="mt-5 border-t border-divider pt-3.5">
        <a href="#publication-masthead" className={quiet}>
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
          {t("backToTop")}
        </a>
      </div>
    </nav>
  );
}
