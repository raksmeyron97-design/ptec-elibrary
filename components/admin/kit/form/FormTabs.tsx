"use client";

import { useRef, useState } from "react";
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

  /*
    ── Manual activation, per the WAI-ARIA Tabs pattern ──

    Arrow keys move *focus* between tabs; Enter or Space activates the focused
    one. The alternative — automatic activation, where an arrow press selects
    immediately — is what this component did before, and it is the wrong half of
    the pattern for these forms. APG says so directly: prefer manual activation
    when displaying a panel is expensive. Here every arrow press would swap a
    panel holding dozens of uncontrolled inputs and replay a 200ms entrance
    animation, so arrowing from Basic info to Review rendered five panels nobody
    asked to see.

    It is also the only reading under which "arrows cycle" and "focus moves to
    the panel on switch" can both be true: if an arrow both selected a tab and
    sent focus into the panel, the second arrow press would never reach the tab
    list.

    `focusedKey` is separate from `active` because with manual activation the two
    genuinely differ — focus can sit on Files while Basic info is still selected.
    It resets when focus leaves the list, so tabbing back in lands on the
    selected tab rather than wherever the user last looked.
  */
  const [focusedKey, setFocusedKey] = useState<K | null>(null);
  const tabbableKey = focusedKey ?? active;

  const indexOf = (key: K) => tabs.findIndex((t) => t.key === key);

  function moveFocus(key: K) {
    setFocusedKey(key);
    document.getElementById(`${idPrefix}-tab-${key}`)?.focus();
  }

  /**
   * Select a tab, and — for keyboard activation only — send focus into the panel
   * that just appeared.
   *
   * Pointer activation deliberately leaves focus on the tab. A click already
   * put it there, the user can see what changed, and yanking focus somewhere
   * they did not ask for it to go is the kind of help nobody wants. For a
   * keyboard or screen-reader user pressing Enter, "where am I now" is the open
   * question, and the answer is the new panel.
   */
  function activate(key: K, opts?: { focusPanel?: boolean }) {
    onChange(key);
    setFocusedKey(key);
    if (!opts?.focusPanel) return;
    // The panel is swapped in this commit; query it once it exists.
    requestAnimationFrame(() => {
      document.getElementById(`${idPrefix}-panel-${key}`)?.focus();
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, key: K) {
    const index = indexOf(key);

    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        moveFocus(tabs[(index + 1) % tabs.length].key);
        return;
      case "ArrowLeft":
        e.preventDefault();
        moveFocus(tabs[(index - 1 + tabs.length) % tabs.length].key);
        return;
      case "Home":
        e.preventDefault();
        moveFocus(tabs[0].key);
        return;
      case "End":
        e.preventDefault();
        moveFocus(tabs[tabs.length - 1].key);
        return;
      case "Enter":
      case " ":
        // Space would scroll the card; Enter would submit the surrounding form.
        e.preventDefault();
        activate(key, { focusPanel: true });
        return;
      default:
        return;
    }
  }

  /** Forget the roving position once focus leaves the list entirely. */
  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusedKey(null);
  }

  return (
    <div className="relative mt-6 border-b border-divider">
      <div
        ref={listRef}
        role="tablist"
        aria-label={ariaLabel}
        aria-orientation="horizontal"
        onBlur={handleBlur}
        className="flex gap-6 overflow-x-auto whitespace-nowrap px-5 [scrollbar-width:none] sm:px-8 [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => {
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
              tabIndex={tabbableKey === tab.key ? 0 : -1}
              onClick={() => activate(tab.key)}
              onKeyDown={(e) => handleKeyDown(e, tab.key)}
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
