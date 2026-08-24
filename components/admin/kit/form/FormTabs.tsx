"use client";

import { useRef } from "react";
import type { LucideIcon } from "lucide-react";

export type FormTabState = "complete" | "error" | "warning" | "todo" | "optional";

export type FormTab<K extends string> = {
  key: K;
  label: string;
  icon?: LucideIcon;
  /** Drives the trailing indicator. Omit for a tab with nothing to report. */
  state?: FormTabState;
  /**
   * Screen-reader wording for `state`, e.g. "has blocking problems".
   *
   * The dot itself is aria-hidden — colour is never the only signal, so the
   * state has to reach a screen reader as words. This is a prop rather than a
   * lookup inside the component because the wording is the caller's to
   * translate, and each form phrases its states differently.
   */
  stateLabel?: string;
};

/**
 * Horizontal tab navigation for an admin form card.
 *
 * Replaces the left vertical section rail the thesis and publication forms
 * used. That rail cost 224px of a 900px card — a quarter of the measure — to
 * carry seven words, and it stacked *above* the fields on mobile, so the first
 * thing a phone showed was a list of section names and the second was a
 * scroll. Tabs cost one line at every width.
 *
 * Overflows horizontally rather than wrapping: a wrapped tab row changes
 * height as you move through the form, which shifts the fields under the
 * cursor. The right-edge mask is the affordance that there is more.
 */
export default function FormTabs<K extends string>({
  tabs,
  active,
  onChange,
  idPrefix,
  ariaLabel,
}: {
  tabs: FormTab<K>[];
  active: K;
  onChange: (key: K) => void;
  /** Namespaces tab/panel ids so two tab sets on one page cannot collide. */
  idPrefix: string;
  ariaLabel: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const map: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
    if (e.key === "Home") {
      e.preventDefault();
      focusTab(tabs[0].key);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      focusTab(tabs[tabs.length - 1].key);
      return;
    }
    const dir = map[e.key];
    if (!dir) return;
    e.preventDefault();
    focusTab(tabs[(index + dir + tabs.length) % tabs.length].key);
  }

  function focusTab(key: K) {
    onChange(key);
    // The panel swap happens in the same commit, so query after it paints.
    requestAnimationFrame(() => document.getElementById(`${idPrefix}-tab-${key}`)?.focus());
  }

  return (
    <div className="relative mt-6 border-b border-divider">
      <div
        ref={listRef}
        role="tablist"
        aria-label={ariaLabel}
        className="flex gap-6 overflow-x-auto whitespace-nowrap px-5 [scrollbar-width:none] sm:px-8 [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab, i) => {
          const isActive = active === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${tab.key}`}
              aria-selected={isActive}
              aria-controls={`${idPrefix}-panel-${tab.key}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(tab.key)}
              onKeyDown={(e) => handleKeyDown(e, i)}
              className={`focus-field -mb-px inline-flex shrink-0 items-center gap-2 border-b-2 pb-3 pt-1 text-sm transition-all duration-200 ${
                isActive
                  ? "border-admin-accent font-semibold text-admin-accent-text"
                  : "border-transparent font-medium text-text-muted hover:text-text-body"
              }`}
            >
              {Icon && (
                <Icon
                  className={`h-5 w-5 transition-colors ${isActive ? "text-admin-accent" : "text-text-muted/70"}`}
                  aria-hidden="true"
                />
              )}
              {tab.label}
              <TabIndicator state={tab.state} />
              {tab.stateLabel && <span className="sr-only"> — {tab.stateLabel}</span>}
            </button>
          );
        })}
      </div>

      {/* Fade over the right edge when the row scrolls. Pointer-events-none so
          it never eats a click on the tab underneath it. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-bg-surface to-transparent sm:hidden"
      />
    </div>
  );
}

/**
 * Trailing indicator.
 *
 *   error     red dot      blocking; this section stops a publish
 *   warning   amber dot    non-blocking; worth a look before going live
 *   complete  green dot    done
 *   todo      hollow ring  required and still empty, nothing blocked yet
 *   optional  nothing      quiet on purpose
 *
 * Deliberately a dot and not a count: the number told the author something they
 * could not act on — nobody needs to know a tab has three problems rather than
 * two before opening it — and a fresh form lit up with red numerals.
 *
 * `error` and `warning` are separate because the publication form has always
 * distinguished them and collapsing both to red would make "you cannot publish"
 * and "you might want to check this" the same signal.
 */
const INDICATOR: Record<Exclude<FormTabState, "optional">, string> = {
  error: "h-2 w-2 rounded-full bg-danger",
  warning: "h-2 w-2 rounded-full bg-warning",
  complete: "h-2 w-2 rounded-full bg-success",
  todo: "h-2 w-2 rounded-full border-[1.5px] border-text-muted/40",
};

function TabIndicator({ state }: { state?: FormTabState }) {
  if (!state || state === "optional") return null;
  return <span className={`shrink-0 ${INDICATOR[state]}`} aria-hidden="true" />;
}
