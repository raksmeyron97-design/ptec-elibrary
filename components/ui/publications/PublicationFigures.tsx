"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import type { PublicationFigure } from "@/lib/publications";

/**
 * The article's figures, and the lightbox that enlarges them.
 *
 * ACCESSIBILITY IS THE HARD PART HERE, so it is worth stating what is
 * deliberate:
 *
 *  * Each figure's enlarge control is a real <button>, not a click handler on
 *    the image. An image with an onClick is invisible to the keyboard and
 *    announces nothing; the brief's "no inaccessible image-only interactions".
 *  * The lightbox is a <dialog> opened with showModal(), so the browser itself
 *    supplies the focus trap, the inert backdrop and Escape-to-close. Hand-
 *    rolled modals in this codebase would each have to re-implement all three,
 *    and would each get one of them wrong.
 *  * Focus returns to the button that opened it — <dialog> does this for us
 *    only if the opener is still in the DOM, which it is.
 *  * Left/Right arrows step between figures while the dialog is open, and the
 *    caption is the dialog's accessible name, so a screen reader announces
 *    which figure it moved to rather than just "dialog".
 *
 * ALT TEXT: `alt_text` when the cataloguer supplied one. When they did not,
 * the image is marked decorative (alt="") and the caption below it carries the
 * meaning — that is better than reading the caption twice, which is what
 * alt={caption} would produce for every screen-reader user.
 */
export default function PublicationFigures({
  figures,
  locale,
  labels,
}: {
  figures: PublicationFigure[];
  locale: string;
  labels: {
    /** "Figure {n}" */
    figureLabel: string;
    /** "Enlarge figure {n}" */
    enlarge: string;
    close: string;
    previous: string;
    next: string;
    /** "Figure {n} of {total}" */
    position: string;
    credit: string;
  };
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const titleId = useId();

  const fill = useCallback(
    (template: string, values: Record<string, string | number>) =>
      Object.entries(values).reduce(
        (out, [key, value]) => out.replaceAll(`{${key}}`, String(value)),
        template,
      ),
    [],
  );

  const step = useCallback(
    (delta: number) => {
      setOpenIndex((current) => {
        if (current === null) return current;
        // Wraps, so a keyboard user at the last figure is not stuck.
        return (current + delta + figures.length) % figures.length;
      });
    },
    [figures.length],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (openIndex !== null && !dialog.open) dialog.showModal();
    if (openIndex === null && dialog.open) dialog.close();
  }, [openIndex]);

  useEffect(() => {
    if (openIndex === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openIndex, step]);

  if (figures.length === 0) return null;

  const captionFor = (figure: PublicationFigure) =>
    (locale === "km" && figure.caption_km?.trim() ? figure.caption_km : figure.caption)?.trim() ||
    null;

  const active = openIndex === null ? null : figures[openIndex];
  const activeCaption = active ? captionFor(active) : null;

  return (
    <>
      <ol className="space-y-8">
        {figures.map((figure, index) => {
          const number = index + 1;
          const caption = captionFor(figure);
          return (
            <li key={figure.id}>
              <figure>
                <div className="group relative overflow-hidden rounded-xl border border-divider bg-paper">
                  {/* Intrinsic sizing with an unknown aspect ratio: width/height
                      are unknown for an uploaded figure, so the wrapper fixes a
                      max height and the image scales inside it. That reserves
                      the space up front and is what keeps the article from
                      reflowing as figures decode. */}
                  <div className="relative mx-auto flex max-h-[520px] w-full items-center justify-center">
                    <Image
                      src={figure.image_url}
                      alt={figure.alt_text?.trim() || ""}
                      width={1200}
                      height={800}
                      sizes="(max-width: 1024px) 100vw, 820px"
                      className="h-auto max-h-[520px] w-full object-contain"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setOpenIndex(index)}
                    aria-label={fill(labels.enlarge, { n: number })}
                    // Always visible on touch screens, where there is no hover to
                    // reveal it — a control that only appears on :hover is a
                    // control a phone user does not have.
                    className="focus-field absolute right-3 top-3 inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-lg border border-divider bg-bg-surface/90 text-text-body backdrop-blur-sm transition-opacity hover:text-brand focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <Maximize2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <figcaption className="mt-2.5 text-[13.5px] leading-6 text-text-body">
                  <span className="font-bold text-text-heading">
                    {fill(labels.figureLabel, { n: number })}.
                  </span>{" "}
                  {caption}
                  {figure.credit && (
                    <span className="mt-1 block text-[12px] text-text-muted">
                      {labels.credit}: {figure.credit}
                    </span>
                  )}
                </figcaption>
              </figure>
            </li>
          );
        })}
      </ol>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => setOpenIndex(null)}
        // Clicking the backdrop closes. The check is on the target being the
        // dialog element itself — the panel inside it stops the event from
        // ever reaching here, so a click on the image never closes the view.
        onClick={(event) => {
          if (event.target === dialogRef.current) setOpenIndex(null);
        }}
        className="max-h-[92vh] w-[min(1100px,94vw)] rounded-2xl border border-divider bg-bg-surface p-0 text-text-body backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        {active && (
          <div className="flex max-h-[92vh] flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-divider px-4 py-3">
              <p id={titleId} className="min-w-0 truncate text-[13.5px] font-bold text-text-heading">
                {fill(labels.figureLabel, { n: (openIndex ?? 0) + 1 })}
                {activeCaption ? ` — ${activeCaption}` : ""}
              </p>
              <button
                type="button"
                onClick={() => setOpenIndex(null)}
                aria-label={labels.close}
                className="focus-field inline-flex min-h-9 min-w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-muted transition-colors hover:text-text-heading"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center bg-paper p-3">
              <Image
                src={active.image_url}
                alt={active.alt_text?.trim() || ""}
                width={1600}
                height={1200}
                sizes="94vw"
                className="max-h-[70vh] w-auto object-contain"
              />
            </div>

            {figures.length > 1 && (
              <div className="flex items-center justify-between gap-3 border-t border-divider px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => step(-1)}
                  aria-label={labels.previous}
                  className="focus-field inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-text-muted transition-colors hover:text-brand"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  {labels.previous}
                </button>
                <p aria-live="polite" className="text-[12.5px] text-text-muted tabular-nums">
                  {fill(labels.position, { n: (openIndex ?? 0) + 1, total: figures.length })}
                </p>
                <button
                  type="button"
                  onClick={() => step(1)}
                  aria-label={labels.next}
                  className="focus-field inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-text-muted transition-colors hover:text-brand"
                >
                  {labels.next}
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
