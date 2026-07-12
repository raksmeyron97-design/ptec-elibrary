"use client";

import {
  useEffect,
  useRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import ReaderToolbar from "@/components/ui/reader/ReaderToolbar";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";

type ReaderDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Short section label above the title, e.g. the localized "Abstract". */
  eyebrow: string;
  /** Full document title (publication or thesis), truncated in the header. */
  title: string;
  /** Page locale — drives Khmer typography on the eyebrow. */
  locale: string;
  textSize: number;
  canDecrease: boolean;
  canIncrease: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  onReset: () => void;
  /** Focus returns here after the dialog closes (the Expand trigger). */
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  /** Reading content, already composed by the caller (bilingual, plain, …). */
  children: ReactNode;
  /** Optional delegated click handler for in-content anchors (reference jumps). */
  onBodyClick?: (event: ReactMouseEvent<HTMLElement>) => void;
};

type ReaderScaleStyle = CSSProperties & { "--reader-scale": number };

/**
 * Distraction-free fullscreen abstract reader. A fixed full-viewport portal
 * dialog (not the native Fullscreen API) so behavior is identical across
 * browsers and when fullscreen is denied. Handles focus trapping/restoration,
 * background inerting, body scroll lock (with position restore), Escape, and
 * its own scroll position — the content itself is supplied by the caller.
 */
export default function ReaderDialog({
  open,
  onClose,
  eyebrow,
  title,
  locale,
  textSize,
  canDecrease,
  canIncrease,
  onDecrease,
  onIncrease,
  onReset,
  returnFocusRef,
  children,
  onBodyClick,
}: ReaderDialogProps) {
  const t = useTranslations("abstractReader");
  const dialogRef = useFocusTrap<HTMLDivElement>(open);
  const scrollRef = useRef<HTMLElement>(null);
  const savedReaderScrollTop = useRef(0);
  const wasOpen = useRef(false);
  const scaleStyle: ReaderScaleStyle = { "--reader-scale": textSize / 100 };

  // Restore focus to the trigger after the dialog closes.
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const frame = requestAnimationFrame(() => returnFocusRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, returnFocusRef]);

  // Lock the background page (fixed-position technique) and restore its exact
  // scroll offset on close so the reader never loses the visitor's place.
  useEffect(() => {
    if (!open) return;

    const body = document.body;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const previous = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      paddingRight: body.style.paddingRight,
    };
    const documentWidth = document.documentElement.clientWidth;
    const scrollbarWidth = documentWidth > 0 ? Math.max(0, window.innerWidth - documentWidth) : 0;

    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = `-${scrollX}px`;
    body.style.right = "0";
    body.style.width = "100%";
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    return () => {
      body.style.overflow = previous.overflow;
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.width = previous.width;
      body.style.paddingRight = previous.paddingRight;
      window.scrollTo({ left: scrollX, top: scrollY, behavior: "auto" });
    };
  }, [open]);

  // Inert + hide every sibling of the dialog so assistive tech and Tab stay
  // inside it, and redirect any focus that escapes back into the dialog.
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const background = [...document.body.children]
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== dialog)
      .map((element) => ({
        element,
        // Coerce so restore is always a real boolean (the reflected `inert`
        // property is not implemented everywhere, e.g. jsdom returns undefined).
        inert: Boolean(element.inert),
        ariaHidden: element.getAttribute("aria-hidden"),
      }));

    for (const { element } of background) {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    }

    const containFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) {
        event.stopPropagation();
        dialog.focus({ preventScroll: true });
      }
    };
    document.addEventListener("focusin", containFocus, true);

    return () => {
      document.removeEventListener("focusin", containFocus, true);
      for (const { element, inert, ariaHidden } of background) {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      }
    };
  }, [dialogRef, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  // Resume the reader's own scroll position when reopened.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = savedReaderScrollTop.current;
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="abstract-reader-dialog-title"
      aria-describedby="abstract-reader-dialog-description"
      tabIndex={-1}
      className="fixed inset-0 z-[1200] flex h-[100dvh] w-screen flex-col overflow-hidden bg-bg-surface text-text-body outline-none"
    >
      <header className="relative z-10 shrink-0 border-b border-divider border-t-[3px] border-t-accent bg-bg-surface pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-2.5 pt-[max(0.6rem,env(safe-area-inset-top))] shadow-sm sm:pl-[max(1.25rem,env(safe-area-inset-left))] sm:pr-[max(1.25rem,env(safe-area-inset-right))] sm:pb-3 sm:pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-2.5 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
          <div className="min-w-0">
            <p
              lang={locale === "km" ? "km" : undefined}
              className={`font-bold text-brand ${locale === "km" ? "font-khmer-serif text-[12px] leading-[1.6] tracking-normal" : "text-[10px] uppercase tracking-[0.16em] sm:text-[11px]"}`}
            >
              {eyebrow}
            </p>
            <p id="abstract-reader-dialog-description" className="sr-only">
              {t("mode")}
            </p>
            <h2
              id="abstract-reader-dialog-title"
              aria-label={`${eyebrow}: ${title}`}
              className="mt-0.5 min-w-0 leading-tight text-text-heading"
            >
              <span className="sr-only">{eyebrow}: </span>
              <span className="block truncate text-[14px] font-semibold sm:text-[15px]" title={title}>
                {title}
              </span>
            </h2>
          </div>

          <ReaderToolbar
            textSize={textSize}
            canDecrease={canDecrease}
            canIncrease={canIncrease}
            onDecrease={onDecrease}
            onIncrease={onIncrease}
            onReset={onReset}
            mode="dialog"
            onClose={onClose}
          />
        </div>
      </header>

      <main
        ref={scrollRef}
        onScroll={(event) => {
          savedReaderScrollTop.current = event.currentTarget.scrollTop;
        }}
        onClick={onBodyClick}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(3rem,env(safe-area-inset-bottom))] pt-8 sm:pl-[max(2rem,env(safe-area-inset-left))] sm:pr-[max(2rem,env(safe-area-inset-right))] sm:pt-12 lg:pt-16"
      >
        <article
          className="abstract-reader-copy abstract-reader-copy--fullscreen mx-auto w-full max-w-[72ch] pb-16"
          style={scaleStyle}
        >
          {children}
        </article>
      </main>
    </div>,
    document.body,
  );
}
