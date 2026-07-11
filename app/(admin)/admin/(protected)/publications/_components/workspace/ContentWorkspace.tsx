"use client";

// The connected Content workspace: one abstract language at a time, three
// editor modes, and the citation manager within reach — beside the manuscript
// on wide screens, in a focus-managed drawer below lg.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookMarked,
  Columns2,
  Eye,
  Maximize2,
  Minimize2,
  PenLine,
  X,
} from "lucide-react";
import AcademicText from "@/components/ui/publications/AcademicText";
import type { PublicationReference } from "@/lib/publications";
import {
  countCitationsByReferenceAndSource,
  removeCitationTokensForReference,
} from "@/lib/publications/citations";
import {
  countWords,
  detectKhmerFieldLanguageMismatch,
} from "@/lib/publications/reference-metadata";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { useMountTransition } from "@/lib/hooks/useMountTransition";
import ManuscriptEditor, { type ManuscriptEditorHandle } from "./ManuscriptEditor";
import CitationPanel from "./CitationPanel";
import PasteReferencesDialog from "./PasteReferencesDialog";
import DeleteReferenceDialog from "./DeleteReferenceDialog";
import {
  EDITOR_MODE_STORAGE_KEY,
  LOCALE_LABEL,
  SOURCE_ID,
  type EditorLocale,
  type EditorMode,
} from "./shared";

const MODES: { key: EditorMode; label: string; icon: typeof PenLine }[] = [
  { key: "write", label: "Write", icon: PenLine },
  { key: "split", label: "Split", icon: Columns2 },
  { key: "preview", label: "Preview", icon: Eye },
];

export interface ContentWorkspaceProps {
  abstract: string;
  abstractKm: string;
  onChangeAbstract: (value: string) => void;
  onChangeAbstractKm: (value: string) => void;
  references: PublicationReference[];
  onChangeReferences: (references: PublicationReference[]) => void;
  disabled?: boolean;
  idPrefix: string;
  /** Public detail page, only when it exists (published). */
  publicHref?: string | null;
  /** Review-summary deep link: focus a specific part of the workspace. */
  externalFocus?: { target: string; nonce: number } | null;
  /** Incremented by the save bar's Preview action. */
  previewNonce?: number;
}

function renumber(references: PublicationReference[]): PublicationReference[] {
  return references.map((reference, index) => ({ ...reference, index: index + 1 }));
}

export default function ContentWorkspace({
  abstract,
  abstractKm,
  onChangeAbstract,
  onChangeAbstractKm,
  references,
  onChangeReferences,
  disabled = false,
  idPrefix,
  publicHref,
  externalFocus,
  previewNonce = 0,
}: ContentWorkspaceProps) {
  const [activeLocale, setActiveLocale] = useState<EditorLocale>("en");
  const [mode, setMode] = useState<EditorMode>("write");
  const [fullscreen, setFullscreen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [caretReady, setCaretReady] = useState<Record<EditorLocale, boolean>>({
    en: false,
    km: false,
  });

  const editorRefs = useRef<Record<EditorLocale, ManuscriptEditorHandle | null>>({
    en: null,
    km: null,
  });
  const drawer = useMountTransition(drawerOpen);
  const drawerTrapRef = useFocusTrap<HTMLDivElement>(drawerOpen && drawer.mounted);
  const fullscreenTrapRef = useFocusTrap<HTMLDivElement>(fullscreen);

  // Remember the chosen mode for this editing session. A mount-only external
  // read: SSR must render the default, so this cannot be a state initializer
  // without causing a hydration mismatch.
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(EDITOR_MODE_STORAGE_KEY) as EditorMode | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from sessionStorage after hydration
      if (stored && MODES.some((m) => m.key === stored)) setMode(stored);
    } catch {
      /* storage unavailable */
    }
  }, []);
  const changeMode = useCallback((next: EditorMode) => {
    setMode(next);
    try {
      sessionStorage.setItem(EDITOR_MODE_STORAGE_KEY, next);
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [fullscreen]);

  // Review-summary items deep-link into the workspace. State adjustments
  // happen during render (React's derived-adjustment idiom); only the DOM
  // focus itself runs in the effect.
  const [handledFocusNonce, setHandledFocusNonce] = useState(externalFocus?.nonce ?? 0);
  if ((externalFocus?.nonce ?? 0) !== handledFocusNonce) {
    setHandledFocusNonce(externalFocus?.nonce ?? 0);
    if (externalFocus) {
      const { target } = externalFocus;
      if (target === "abstract-en" || target === "abstract-km") {
        setActiveLocale(target === "abstract-km" ? "km" : "en");
        setMode((current) => (current === "preview" ? "write" : current));
      } else if (
        (target === "references" || target === "citations") &&
        typeof window !== "undefined" &&
        !window.matchMedia("(min-width: 1024px)").matches
      ) {
        setDrawerOpen(true);
      }
    }
  }
  useEffect(() => {
    if (!externalFocus?.nonce) return;
    const { target } = externalFocus;
    if (target === "abstract-en" || target === "abstract-km") {
      const locale: EditorLocale = target === "abstract-km" ? "km" : "en";
      requestAnimationFrame(() => editorRefs.current[locale]?.focus());
    } else if (target === "references" || target === "citations") {
      if (window.matchMedia("(min-width: 1024px)").matches) {
        document.getElementById(`${idPrefix}-panel-citation-search`)?.focus();
      }
    }
  }, [externalFocus, idPrefix]);

  // The save bar's Preview button switches this workspace into Preview mode.
  const [handledPreviewNonce, setHandledPreviewNonce] = useState(previewNonce);
  if (previewNonce !== handledPreviewNonce) {
    setHandledPreviewNonce(previewNonce);
    if (previewNonce > 0) setMode("preview");
  }

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const values: Record<EditorLocale, string> = { en: abstract, km: abstractKm };
  const changeHandlers: Record<EditorLocale, (v: string) => void> = {
    en: onChangeAbstract,
    km: onChangeAbstractKm,
  };

  const sources = useMemo(
    () => [
      { id: SOURCE_ID.en, text: abstract },
      { id: SOURCE_ID.km, text: abstractKm },
    ],
    [abstract, abstractKm],
  );
  const countsBySource = useMemo(
    () => countCitationsByReferenceAndSource(sources, references),
    [sources, references],
  );
  const kmMismatch = useMemo(() => detectKhmerFieldLanguageMismatch(abstractKm), [abstractKm]);

  // Word counts render only after hydration: server (Node ICU) and browser
  // Intl.Segmenter can segment Khmer differently, which would otherwise be a
  // text hydration mismatch on the language tabs.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time post-hydration flag
    setHydrated(true);
  }, []);
  const wordCountEn = useMemo(() => countWords(abstract, "en"), [abstract]);
  const wordCountKm = useMemo(() => countWords(abstractKm, "km"), [abstractKm]);
  const wordCounts: Record<EditorLocale, string> = {
    en: hydrated ? `${wordCountEn}` : "–",
    km: hydrated ? `${wordCountKm}` : "–",
  };

  const insertTarget = {
    locale: activeLocale,
    ready: mode !== "preview" && caretReady[activeLocale] && !disabled,
  };

  const insertCitations = useCallback(
    (referenceIds: string[], fromDrawer = false) => {
      const editor = editorRefs.current[activeLocale];
      if (!editor) return;
      const inserted = editor.insertCitation(referenceIds);
      if (!inserted) return;
      const numbers = referenceIds
        .map((id) => references.findIndex((reference) => reference.id === id) + 1)
        .filter((n) => n > 0)
        .join(", ");
      setAnnouncement(
        `Inserted citation [${numbers}] at the cursor in the ${LOCALE_LABEL[activeLocale]} abstract.`,
      );
      if (fromDrawer) {
        // Small screens: return to the manuscript with the caret where the
        // administrator left it, right after the new citation.
        setDrawerOpen(false);
      }
    },
    [activeLocale, references],
  );

  const confirmDelete = useCallback(() => {
    const target = references.find((reference) => reference.id === deleteTargetId);
    if (!target) {
      setDeleteTargetId(null);
      return;
    }
    onChangeAbstract(removeCitationTokensForReference(abstract, target.id, references));
    onChangeAbstractKm(removeCitationTokensForReference(abstractKm, target.id, references));
    onChangeReferences(renumber(references.filter((reference) => reference.id !== target.id)));
    setAnnouncement("Reference deleted. Remaining citations renumbered.");
    setDeleteTargetId(null);
  }, [
    references,
    deleteTargetId,
    abstract,
    abstractKm,
    onChangeAbstract,
    onChangeAbstractKm,
    onChangeReferences,
  ]);

  const deleteTarget = references.find((reference) => reference.id === deleteTargetId) ?? null;
  const deletePosition = deleteTarget
    ? references.findIndex((reference) => reference.id === deleteTarget.id) + 1
    : 0;

  const totalCitations = (locale: EditorLocale) =>
    Object.values(countsBySource).reduce(
      (sum, perSource) => sum + (perSource[SOURCE_ID[locale]] ?? 0),
      0,
    );

  const renderPreview = (heightClass: string) => (
    <div
      className={`overflow-y-auto rounded-lg border border-divider bg-paper/30 px-5 py-4 ${heightClass}`}
      aria-label={`${LOCALE_LABEL[activeLocale]} abstract preview`}
    >
      {values[activeLocale].trim() ? (
        <div
          lang={activeLocale}
          className={`max-w-[70ch] text-[15px] leading-7 text-text-body ${activeLocale === "km" ? "font-khmer-serif" : ""}`}
        >
          <AcademicText
            text={values[activeLocale]}
            references={references}
            sourceId={`${idPrefix}-preview-${activeLocale}`}
            linkCitations={false}
            paragraphClassName="mt-3 first:mt-0"
            citationLabel={(number) => `Reference ${number}`}
            missingCitationLabel={(key) => `Missing reference ${key}`}
          />
        </div>
      ) : (
        <p className="text-sm italic text-text-muted">Nothing to preview in {LOCALE_LABEL[activeLocale]} yet.</p>
      )}
    </div>
  );

  const editorHeight = fullscreen
    ? "h-[calc(100vh-14rem)] min-h-[16rem]"
    : mode === "split"
      ? "h-[min(56vh,32rem)] min-h-[18rem]"
      : "h-[min(62vh,38rem)] min-h-[24rem]";

  const citationPanelNode = (variant: "panel" | "drawer") => (
    <CitationPanel
      references={references}
      onChangeReferences={onChangeReferences}
      onRequestDelete={(id) => setDeleteTargetId(id)}
      onInsert={(ids) => insertCitations(ids, variant === "drawer")}
      insertTarget={insertTarget}
      countsBySource={countsBySource}
      disabled={disabled}
      onOpenPasteDialog={() => {
        setDrawerOpen(false);
        setPasteOpen(true);
      }}
      onAnnounce={setAnnouncement}
      idPrefix={`${idPrefix}-${variant}`}
    />
  );

  const workspaceBody = (
    <>
      {/* ── Header: language tabs · mode switch · tools ─────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-divider pb-3">
        <div role="tablist" aria-label="Abstract language" className="flex rounded-lg border border-divider bg-paper/60 p-0.5">
          {(["en", "km"] as const).map((locale) => {
            const active = activeLocale === locale;
            return (
              <button
                key={locale}
                type="button"
                role="tab"
                id={`${idPrefix}-lang-tab-${locale}`}
                aria-selected={active}
                aria-controls={`${idPrefix}-lang-panel`}
                tabIndex={active ? 0 : -1}
                onClick={() => setActiveLocale(locale)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                    event.preventDefault();
                    const next = locale === "en" ? "km" : "en";
                    setActiveLocale(next);
                    document.getElementById(`${idPrefix}-lang-tab-${next}`)?.focus();
                  }
                }}
                className={`min-h-9 cursor-pointer rounded-md px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 ${
                  active
                    ? "bg-bg-surface text-brand shadow-sm"
                    : "text-text-muted hover:text-text-body"
                }`}
              >
                {locale === "en" ? "English" : "Khmer"}
                {locale === "km" ? <span className="ml-1 font-normal text-text-muted">· optional</span> : null}
                <span className="ml-1.5 rounded-full bg-paper px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-text-muted">
                  {wordCounts[locale]} w
                </span>
              </button>
            );
          })}
        </div>

        <div role="group" aria-label="Editor mode" className="flex rounded-lg border border-divider bg-paper/60 p-0.5">
          {MODES.map((entry) => {
            const active = mode === entry.key;
            return (
              <button
                key={entry.key}
                type="button"
                aria-pressed={active}
                onClick={() => changeMode(entry.key)}
                className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 ${
                  active
                    ? "bg-bg-surface text-brand shadow-sm"
                    : "text-text-muted hover:text-text-body"
                }`}
              >
                <entry.icon className="h-3.5 w-3.5" aria-hidden="true" />
                {entry.label}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {publicHref && mode === "preview" ? (
            <a
              href={publicHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-divider px-2.5 text-[12px] font-semibold text-text-body transition-colors hover:border-brand/50 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              Open public page
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-divider px-2.5 text-[12px] font-semibold text-text-body transition-colors hover:border-brand/50 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 lg:hidden"
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
          >
            <BookMarked className="h-3.5 w-3.5" aria-hidden="true" />
            Citations
            <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-brand">
              {references.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            aria-pressed={fullscreen}
            aria-label={fullscreen ? "Exit focused writing" : "Focused writing (full screen)"}
            title={fullscreen ? "Exit focused writing (Esc)" : "Focused writing"}
            className="inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-divider px-2.5 text-text-muted transition-colors hover:border-brand/50 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
          >
            {fullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* ── Manuscript + evidence margin ────────────────────────────────── */}
      <div className="mt-3 gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(19rem,21.5rem)]">
        <div
          id={`${idPrefix}-lang-panel`}
          role="tabpanel"
          aria-labelledby={`${idPrefix}-lang-tab-${activeLocale}`}
          className="min-w-0"
        >
          {mode === "preview" ? (
            renderPreview(editorHeight)
          ) : (
            <div className={mode === "split" ? "grid gap-3 xl:grid-cols-2" : undefined}>
              <div>
                {(["en", "km"] as const).map((locale) => (
                  <div key={locale} hidden={activeLocale !== locale}>
                    <ManuscriptEditor
                      ref={(handle) => {
                        editorRefs.current[locale] = handle;
                      }}
                      locale={locale}
                      value={values[locale]}
                      onChange={changeHandlers[locale]}
                      references={references}
                      disabled={disabled}
                      placeholder={
                        locale === "km"
                          ? "សេចក្តីសង្ខេបជាភាសាខ្មែរ — សរសេរនៅទីនេះ…"
                          : "Describe the objective, method, findings, and conclusion…"
                      }
                      id={`${idPrefix}-abstract-${locale}`}
                      name={locale === "km" ? "abstract_km" : "abstract"}
                      heightClass={editorHeight}
                      describedBy={`${idPrefix}-editor-help`}
                      onCaretStateChange={(ready) =>
                        setCaretReady((prev) =>
                          prev[locale] === ready ? prev : { ...prev, [locale]: ready },
                        )
                      }
                      onRequestCitationPanel={() => {
                        if (window.matchMedia("(min-width: 1024px)").matches) {
                          document
                            .getElementById(`${idPrefix}-panel-citation-search`)
                            ?.focus();
                        } else {
                          setDrawerOpen(true);
                        }
                      }}
                    />
                  </div>
                ))}
                <p id={`${idPrefix}-editor-help`} className="mt-1.5 text-[11px] leading-4 text-text-muted">
                  Supports paragraphs, bold, italic, subscript, superscript, and linked citations —
                  citations stay attached to their reference when the list is reordered.
                  <span lang="km"> អាចប្រើអក្សរដិត អក្សរទ្រេត និងការដកស្រង់បាន។</span>
                </p>
              </div>
              {mode === "split" ? renderPreview(editorHeight) : null}
            </div>
          )}

          {activeLocale === "km" && kmMismatch ? (
            <p
              role="status"
              className="mt-2 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/8 px-3 py-2 text-[12.5px] leading-5 text-text-body"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
              <span>
                This Khmer abstract appears to be mostly English text. It will still save — review
                it before publishing. <span lang="km">សូមពិនិត្យមើលឡើងវិញ។</span>
              </span>
            </p>
          ) : null}

          <p className="mt-2 text-[11px] text-text-muted">
            Citations in this language: EN {totalCitations("en")} · KM {totalCitations("km")}
          </p>
        </div>

        <aside className="mt-4 hidden min-w-0 lg:mt-0 lg:block" aria-label="Citation manager">
          <div className="lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100vh-10.5rem)] lg:min-h-[24rem] lg:flex-col rounded-xl border border-t-2 border-divider border-t-accent bg-bg-surface p-3">
            <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-text-heading">
              <BookMarked className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              References & citations
            </h3>
            {citationPanelNode("panel")}
          </div>
        </aside>
      </div>
    </>
  );

  return (
    <section aria-label="Abstract and references">
      {fullscreen ? (
        <div
          ref={fullscreenTrapRef}
          role="dialog"
          aria-modal="true"
          aria-label="Focused writing"
          className="fixed inset-0 z-50 overflow-y-auto bg-bg-body p-4 sm:p-6"
        >
          <div className="mx-auto max-w-6xl">{workspaceBody}</div>
        </div>
      ) : (
        workspaceBody
      )}

      {/* Citation drawer (below lg) */}
      {drawer.mounted ? (
        <div
          className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-200 motion-reduce:transition-none lg:hidden ${
            drawer.shown ? "opacity-100" : "opacity-0"
          }`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDrawerOpen(false);
          }}
        >
          <div
            ref={drawerTrapRef}
            role="dialog"
            aria-modal="true"
            aria-label="Citation manager"
            className={`absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-bg-surface shadow-xl transition-transform duration-200 motion-reduce:transition-none ${
              drawer.shown ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <div className="flex items-center justify-between border-b border-divider px-4 py-3">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-text-heading">
                <BookMarked className="h-4 w-4 text-accent" aria-hidden="true" />
                References & citations
              </h3>
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  editorRefs.current[activeLocale]?.focus();
                }}
                aria-label="Close citation manager"
                className="cursor-pointer rounded-lg p-2 text-text-muted transition-colors hover:bg-paper hover:text-text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1 p-3">{citationPanelNode("drawer")}</div>
          </div>
        </div>
      ) : null}

      <PasteReferencesDialog
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        existingReferences={references}
        onImport={(imported) => {
          onChangeReferences(renumber([...references, ...imported]));
          setAnnouncement(
            `Imported ${imported.length} reference${imported.length === 1 ? "" : "s"}.`,
          );
        }}
      />

      <DeleteReferenceDialog
        reference={deleteTarget}
        position={deletePosition}
        citedEn={deleteTarget ? countsBySource[deleteTarget.id]?.[SOURCE_ID.en] ?? 0 : 0}
        citedKm={deleteTarget ? countsBySource[deleteTarget.id]?.[SOURCE_ID.km] ?? 0 : 0}
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={confirmDelete}
      />

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </section>
  );
}
