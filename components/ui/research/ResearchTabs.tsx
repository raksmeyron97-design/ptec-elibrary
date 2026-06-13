"use client";

import { useState, type ReactNode } from "react";

export interface ResearchTab {
  id: string;
  label: string;
  /** Optional count shown as a pill, e.g. references = 24 */
  badge?: number | string;
  content: ReactNode;
  /** Defer mounting until the tab is first opened (use for the heavy PDF reader). */
  lazy?: boolean;
}

export default function ResearchTabs({
  tabs,
  defaultTab,
}: {
  tabs: ResearchTab[];
  defaultTab?: string;
}) {
  const initial = defaultTab ?? tabs[0]?.id;
  const [active, setActive] = useState(initial);
  const [mounted, setMounted] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(tabs.map((t) => [t.id, !t.lazy || t.id === initial])),
  );

  const activate = (id: string) => {
    setActive(id);
    setMounted((m) => (m[id] ? m : { ...m, [id]: true }));
  };

  return (
    <div className="rounded-2xl border border-divider bg-bg-surface shadow-sm">
      {/* Tab bar */}
      <div role="tablist" aria-label="Report sections" className="flex gap-1 overflow-x-auto border-b border-divider px-2 sm:px-4">
        {tabs.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => activate(t.id)}
              className={`relative shrink-0 px-3 py-3.5 text-[13.5px] font-semibold transition-colors sm:px-4 sm:text-[14px] ${
                isActive ? "text-brand" : "text-text-muted hover:text-text-body"
              }`}
            >
              <span className="inline-flex items-center gap-2">
                {t.label}
                {t.badge !== undefined && t.badge !== "" && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      isActive ? "bg-brand/10 text-brand" : "bg-bg-app text-text-muted"
                    }`}
                  >
                    {t.badge}
                  </span>
                )}
              </span>
              <span
                aria-hidden
                className={`absolute inset-x-2 -bottom-px h-[2.5px] rounded-full bg-brand transition-opacity ${
                  isActive ? "opacity-100" : "opacity-0"
                }`}
              />
            </button>
          );
        })}
      </div>

      {/* Panels */}
      <div className="p-5 sm:p-6 md:p-7">
        {tabs.map(
          (t) =>
            mounted[t.id] && (
              <div key={t.id} role="tabpanel" hidden={active !== t.id}>
                {t.content}
              </div>
            ),
        )}
      </div>
    </div>
  );
}
