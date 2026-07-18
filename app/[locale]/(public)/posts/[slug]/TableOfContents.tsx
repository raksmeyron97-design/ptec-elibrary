"use client";

import { useState, useEffect } from "react";

interface TocItem {
  id: string;
  text: string;
}

interface Props {
  toc: TocItem[];
}

export default function TableOfContents({ toc }: Props) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    if (toc.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find topmost intersecting heading
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          const topmost = visible.reduce((a, b) =>
            a.boundingClientRect.top < b.boundingClientRect.top ? a : b
          );
          setActiveId(topmost.target.id);
        }
      },
      {
        // Fire when the heading enters the top 20% of the viewport
        rootMargin: "-80px 0px -75% 0px",
        threshold: 0,
      }
    );

    const elements = toc
      .map((item) => document.getElementById(item.id))
      .filter(Boolean) as HTMLElement[];

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [toc]);

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    // 90px offset for the sticky header
    const top = el.getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo({ top, behavior: "smooth" });
    setActiveId(id);
  }

  if (toc.length === 0) return null;

  const activeIdx = toc.findIndex((t) => t.id === activeId);

  return (
    <div className="bg-bg-surface border border-divider rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-3">
        <span className="w-1 h-5 bg-accent rounded-full" />
        <h3 className="font-khmer-serif font-bold text-text-heading text-base m-0">មាតិកា</h3>
      </div>

      {/* Progress bar */}
      <div className="px-5 mb-3">
        <div className="h-0.5 w-full rounded-full bg-divider overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand to-accent transition-all duration-500"
            style={{
              width: activeIdx >= 0 ? `${((activeIdx + 1) / toc.length) * 100}%` : "0%",
            }}
          />
        </div>
      </div>

      {/* Items */}
      <nav aria-label="Table of contents" className="px-3 pb-4">
        <ul className="flex flex-col gap-0.5 list-none m-0 p-0">
          {toc.map((item, idx) => {
            const isActive = activeId === item.id;
            return (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  onClick={(e) => handleClick(e, item.id)}
                  className={[
                    "flex items-center gap-2.5 rounded-lg py-2 px-3 text-sm leading-snug font-sans transition-all duration-150",
                    isActive
                      ? "bg-brand/5 text-brand font-semibold border-l-2 border-accent pl-3"
                      : "text-text-body hover:text-brand hover:bg-paper border-l-2 border-transparent",
                  ].join(" ")}
                >
                  {/* Section number */}
                  <span
                    className={[
                      "flex-none w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors",
                      isActive
                        ? "bg-brand text-brand-contrast"
                        : "bg-paper border border-divider text-text-muted",
                    ].join(" ")}
                  >
                    {idx + 1}
                  </span>
                  <span className="flex-1 min-w-0 truncate">{item.text}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer count */}
      <div className="border-t border-divider px-5 py-2.5 flex items-center justify-between">
        <span className="text-[11px] text-text-muted font-sans">
          {activeIdx >= 0 ? activeIdx + 1 : 0} / {toc.length} ផ្នែក
        </span>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: "smooth" });
            setActiveId("");
          }}
          className="text-[11px] text-text-muted hover:text-brand transition-colors font-sans flex items-center gap-1"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>
          </svg>
          ត្រឡប់ខាងលើ
        </a>
      </div>
    </div>
  );
}
