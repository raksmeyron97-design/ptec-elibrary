"use client";

// Searchable citation manager: the evidence margin beside the manuscript.
// Shown as a sticky side panel on wide screens and inside a drawer below lg.

import { useCallback, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookMarked,
  Check,
  ChevronDown,
  ClipboardPaste,
  CornerDownLeft,
  Link2,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import type { PublicationReference } from "@/lib/publications";
import {
  MAX_PUBLICATION_REFERENCES,
  createPublicationReferenceId,
  normalizeDoi,
} from "@/lib/publications/citations";
import type { StructuredReferenceMetadata } from "@/lib/publications/reference-metadata";
import { lookupDoiMetadata } from "@/app/actions/publication-workspace";
import { INPUT_CLASS } from "@/app/(admin)/admin/(protected)/theses/_components/form-styles";
import ReferenceDetailsForm from "./ReferenceDetailsForm";
import {
  referenceCardDisplay,
  referenceSearchText,
  type InsertTarget,
} from "./shared";

type CitedFilter = "all" | "cited" | "uncited";

type DoiState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "invalid" }
  | { phase: "not_found" }
  | { phase: "rate_limited" }
  | { phase: "unavailable" }
  | { phase: "duplicate"; position: number }
  | { phase: "ready"; formatted: string; doi: string; meta: StructuredReferenceMetadata };

export interface CitationPanelProps {
  references: PublicationReference[];
  onChangeReferences: (references: PublicationReference[]) => void;
  /** Parent owns deletion (safety dialog + token cleanup). */
  onRequestDelete: (referenceId: string) => void;
  onInsert: (referenceIds: string[]) => void;
  insertTarget: InsertTarget;
  /** referenceId → sourceId → count (abstract-en / abstract-km). */
  countsBySource: Record<string, Record<string, number>>;
  disabled?: boolean;
  onOpenPasteDialog: () => void;
  onAnnounce: (message: string) => void;
  idPrefix: string;
}

function renumber(references: PublicationReference[]): PublicationReference[] {
  return references.map((reference, index) => ({ ...reference, index: index + 1 }));
}

export default function CitationPanel({
  references,
  onChangeReferences,
  onRequestDelete,
  onInsert,
  insertTarget,
  countsBySource,
  disabled = false,
  onOpenPasteDialog,
  onAnnounce,
  idPrefix,
}: CitationPanelProps) {
  const [query, setQuery] = useState("");
  const [citedFilter, setCitedFilter] = useState<CitedFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [doiInput, setDoiInput] = useState("");
  const [doiState, setDoiState] = useState<DoiState>({ phase: "idle" });
  const [addOpen, setAddOpen] = useState(false);
  const listRef = useRef<HTMLOListElement | null>(null);
  const doiRequestRef = useRef(0);

  const citedCount = useCallback(
    (referenceId: string, sourceId: string) => countsBySource[referenceId]?.[sourceId] ?? 0,
    [countsBySource],
  );
  const totalCited = useCallback(
    (referenceId: string) =>
      Object.values(countsBySource[referenceId] ?? {}).reduce((sum, n) => sum + n, 0),
    [countsBySource],
  );

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("en");
    return references
      .map((reference, index) => ({ reference, index }))
      .filter(({ reference }) => {
        if (citedFilter === "cited" && totalCited(reference.id) === 0) return false;
        if (citedFilter === "uncited" && totalCited(reference.id) > 0) return false;
        if (!term) return true;
        return referenceSearchText(reference).includes(term);
      });
  }, [references, query, citedFilter, totalCited]);

  const patchReference = useCallback(
    (referenceId: string, patch: Partial<PublicationReference>) => {
      onChangeReferences(
        references.map((reference) =>
          reference.id === referenceId ? { ...reference, ...patch } : reference,
        ),
      );
    },
    [references, onChangeReferences],
  );

  const move = useCallback(
    (index: number, direction: -1 | 1) => {
      const target = index + direction;
      if (target < 0 || target >= references.length) return;
      const next = [...references];
      [next[index], next[target]] = [next[target], next[index]];
      onChangeReferences(renumber(next));
      onAnnounce(
        `Moved reference to position ${target + 1} of ${references.length}. Citation numbers updated.`,
      );
      const movedId = references[index].id;
      requestAnimationFrame(() => {
        const row = listRef.current?.querySelector<HTMLElement>(`[data-reference="${movedId}"]`);
        const same = row?.querySelector<HTMLButtonElement>(
          `button[data-move="${direction === -1 ? "up" : "down"}"]`,
        );
        const other = row?.querySelector<HTMLButtonElement>(
          `button[data-move="${direction === -1 ? "down" : "up"}"]`,
        );
        (same && !same.disabled ? same : other)?.focus();
      });
    },
    [references, onChangeReferences, onAnnounce],
  );

  const addManual = useCallback(() => {
    if (references.length >= MAX_PUBLICATION_REFERENCES) return;
    const id = createPublicationReferenceId();
    onChangeReferences(
      renumber([...references, { id, index: references.length + 1, text: "" }]),
    );
    setExpandedId(id);
    setQuery("");
    setCitedFilter("all");
    onAnnounce(`Added reference ${references.length + 1}. Fill in its details.`);
  }, [references, onChangeReferences, onAnnounce]);

  const lookupDoi = useCallback(async () => {
    const raw = doiInput.trim();
    if (!raw) return;
    const normalized = normalizeDoi(raw);
    const duplicateIndex = normalized
      ? references.findIndex(
          (reference) => reference.doi?.toLowerCase() === normalized.toLowerCase(),
        )
      : -1;
    if (duplicateIndex >= 0) {
      setDoiState({ phase: "duplicate", position: duplicateIndex + 1 });
      return;
    }
    const requestId = ++doiRequestRef.current;
    setDoiState({ phase: "loading" });
    const result = await lookupDoiMetadata(raw);
    if (requestId !== doiRequestRef.current) return; // superseded
    if (result.status === "ok") {
      setDoiState({
        phase: "ready",
        formatted: result.formatted,
        doi: result.doi,
        meta: result.metadata,
      });
    } else if (result.status === "invalid") setDoiState({ phase: "invalid" });
    else if (result.status === "not_found") setDoiState({ phase: "not_found" });
    else if (result.status === "rate_limited") setDoiState({ phase: "rate_limited" });
    else setDoiState({ phase: "unavailable" });
  }, [doiInput, references]);

  const acceptDoi = useCallback(() => {
    if (doiState.phase !== "ready") return;
    const id = createPublicationReferenceId();
    onChangeReferences(
      renumber([
        ...references,
        {
          id,
          index: references.length + 1,
          text: doiState.formatted,
          doi: doiState.doi,
          meta: doiState.meta,
        },
      ]),
    );
    setExpandedId(id);
    setDoiInput("");
    setDoiState({ phase: "idle" });
    onAnnounce(`Added reference ${references.length + 1} from DOI. Review its details.`);
  }, [doiState, references, onChangeReferences, onAnnounce]);

  const insertLabel = insertTarget.ready
    ? `Insert at the cursor in Abstract ${insertTarget.locale.toUpperCase()}`
    : "Click in the abstract where the citation should go, then insert";

  const filterChip = (value: CitedFilter, label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setCitedFilter(value)}
      aria-pressed={citedFilter === value}
      className={`min-h-8 cursor-pointer rounded-full border px-2.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 ${
        citedFilter === value
          ? "border-brand bg-brand text-brand-contrast"
          : "border-divider bg-paper text-text-muted hover:border-brand/40 hover:text-text-body"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Insertion target — always states where a citation will land. */}
      <p
        className={`mb-2 flex items-start gap-1.5 rounded-lg border px-2.5 py-2 text-[11.5px] leading-4 ${
          insertTarget.ready
            ? "border-accent/40 bg-accent/8 text-text-body"
            : "border-divider bg-paper/60 text-text-muted"
        }`}
      >
        <CornerDownLeft className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{insertLabel}</span>
      </p>

      <div className="mb-2 flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <input
            id={`${idPrefix}-citation-search`}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Author, title, year, DOI…"
            aria-label="Search references by author, title, year, or DOI"
            className={`${INPUT_CLASS} !h-9 !pl-8 !text-[12.5px]`}
          />
        </div>
        <span className="shrink-0 rounded-full bg-paper px-2 py-1 text-[10.5px] font-semibold tabular-nums text-text-muted">
          {references.length}/{MAX_PUBLICATION_REFERENCES}
        </span>
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Filter references">
        {filterChip("all", "All")}
        {filterChip("cited", "Cited")}
        {filterChip("uncited", "Uncited")}
      </div>

      {/* Reference list */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5 [scrollbar-gutter:stable]">
        {references.length === 0 ? (
          <div className="rounded-xl border border-dashed border-divider px-3 py-8 text-center">
            <BookMarked className="mx-auto h-5 w-5 text-text-muted/60" aria-hidden="true" />
            <p className="mt-2 text-[12.5px] text-text-muted">
              No references yet. Add one by DOI, manually, or paste a list.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-divider px-3 py-6 text-center text-[12.5px] text-text-muted">
            No references match this search or filter.
          </p>
        ) : (
          <ol ref={listRef} className="space-y-2">
            {visible.map(({ reference, index }) => {
              const display = referenceCardDisplay(reference);
              const enCount = citedCount(reference.id, "abstract-en");
              const kmCount = citedCount(reference.id, "abstract-km");
              const cited = enCount + kmCount > 0;
              const expanded = expandedId === reference.id;
              const missingText = !reference.text.trim();
              return (
                <li
                  key={reference.id}
                  data-reference={reference.id}
                  className={`rounded-xl border bg-bg-surface p-2.5 transition-colors ${
                    missingText ? "border-warning/60" : "border-divider"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex shrink-0 flex-col items-center gap-0.5">
                      <span
                        aria-hidden="true"
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/8 text-[10px] font-bold tabular-nums text-brand"
                      >
                        {index + 1}
                      </span>
                      <button
                        type="button"
                        data-move="up"
                        disabled={disabled || index === 0}
                        onClick={() => move(index, -1)}
                        aria-label={`Move reference ${index + 1} up`}
                        className="cursor-pointer rounded p-0.5 text-text-muted transition-colors hover:bg-paper hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        data-move="down"
                        disabled={disabled || index === references.length - 1}
                        onClick={() => move(index, 1)}
                        aria-label={`Move reference ${index + 1} down`}
                        className="cursor-pointer rounded p-0.5 text-text-muted transition-colors hover:bg-paper hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-semibold leading-4 text-text-heading">
                        {display.shortCitation || "Untitled reference"}
                      </p>
                      {display.title && display.title !== display.shortCitation ? (
                        <p className="mt-0.5 line-clamp-2 text-[12px] leading-4 text-text-body" title={reference.text}>
                          {display.title}
                        </p>
                      ) : null}
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] font-medium text-text-muted">
                        <span className={reference.doi ? "text-success" : ""}>
                          {reference.doi ? "DOI ✓" : "DOI missing"}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className={cited ? "text-brand" : "text-warning"}>
                          {cited
                            ? `Cited — EN ${enCount} · KM ${kmCount}`
                            : "Not cited yet"}
                        </span>
                        {missingText ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-warning">Needs citation text</span>
                          </>
                        ) : null}
                      </p>

                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          disabled={disabled || !insertTarget.ready || missingText}
                          onClick={() => onInsert([reference.id])}
                          title={
                            missingText
                              ? "Add citation text first"
                              : insertTarget.ready
                                ? `Insert [${index + 1}] at the cursor in Abstract ${insertTarget.locale.toUpperCase()}`
                                : "Click in the abstract first to place the cursor"
                          }
                          className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg bg-brand px-2.5 text-[11.5px] font-semibold text-brand-contrast transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <CornerDownLeft className="h-3 w-3" aria-hidden="true" />
                          Insert [{index + 1}]
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : reference.id)}
                          aria-expanded={expanded}
                          className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg border border-divider px-2 text-[11.5px] font-medium text-text-body transition-colors hover:border-brand/50 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
                        >
                          <ChevronDown
                            className={`h-3 w-3 transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
                            aria-hidden="true"
                          />
                          {expanded ? "Close" : "Edit"}
                        </button>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => onRequestDelete(reference.id)}
                          aria-label={`Delete reference ${index + 1}`}
                          className="ml-auto inline-flex min-h-8 cursor-pointer items-center rounded-lg p-1.5 text-text-muted transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {expanded ? (
                    <ReferenceDetailsForm
                      reference={reference}
                      position={index + 1}
                      disabled={disabled}
                      onPatch={patchReference}
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Add actions */}
      <div className="mt-2 border-t border-divider pt-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={disabled || references.length >= MAX_PUBLICATION_REFERENCES}
            onClick={() => setAddOpen((v) => !v)}
            aria-expanded={addOpen}
            className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-lg border border-divider px-2.5 text-[12px] font-semibold text-text-body transition-colors hover:border-brand/50 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            Add by DOI
          </button>
          <button
            type="button"
            disabled={disabled || references.length >= MAX_PUBLICATION_REFERENCES}
            onClick={addManual}
            className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-lg border border-divider px-2.5 text-[12px] font-semibold text-text-body transition-colors hover:border-brand/50 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Manually
          </button>
          <button
            type="button"
            disabled={disabled || references.length >= MAX_PUBLICATION_REFERENCES}
            onClick={onOpenPasteDialog}
            className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-lg border border-divider px-2.5 text-[12px] font-semibold text-text-body transition-colors hover:border-brand/50 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
            Paste list
          </button>
        </div>

        {addOpen ? (
          <div className="mt-2 space-y-1.5">
            <label htmlFor={`${idPrefix}-doi-input`} className="block text-[11px] font-semibold text-text-body">
              DOI or DOI URL
            </label>
            <div className="flex gap-1.5">
              <input
                id={`${idPrefix}-doi-input`}
                value={doiInput}
                onChange={(event) => {
                  setDoiInput(event.target.value);
                  setDoiState({ phase: "idle" });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void lookupDoi();
                  }
                }}
                placeholder="10.1021/ed500184t"
                className={`${INPUT_CLASS} !h-9 font-mono !text-xs`}
              />
              <button
                type="button"
                disabled={disabled || !doiInput.trim() || doiState.phase === "loading"}
                onClick={() => void lookupDoi()}
                className="inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-brand px-3 text-[12px] font-semibold text-brand-contrast transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {doiState.phase === "loading" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Search className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Look up
              </button>
            </div>

            <div aria-live="polite">
              {doiState.phase === "invalid" ? (
                <p className="text-[11.5px] font-medium text-danger">
                  That doesn’t look like a DOI. DOIs start with “10.” — you can also add the reference manually.
                </p>
              ) : doiState.phase === "not_found" ? (
                <p className="text-[11.5px] font-medium text-warning">
                  No record found for this DOI. Check for typos or add the reference manually.
                </p>
              ) : doiState.phase === "rate_limited" ? (
                <p className="text-[11.5px] font-medium text-warning">
                  Too many lookups right now — wait a minute and try again, or add manually.
                </p>
              ) : doiState.phase === "unavailable" ? (
                <p className="text-[11.5px] font-medium text-warning">
                  The DOI service didn’t respond. Try again shortly or add the reference manually.
                </p>
              ) : doiState.phase === "duplicate" ? (
                <p className="text-[11.5px] font-medium text-warning">
                  Reference [{doiState.position}] already uses this DOI — insert a citation to it instead of adding a duplicate.
                </p>
              ) : doiState.phase === "ready" ? (
                <div className="rounded-lg border border-success/40 bg-success/5 p-2">
                  <p className="text-[12px] leading-5 text-text-body">{doiState.formatted}</p>
                  <div className="mt-1.5 flex gap-1.5">
                    <button
                      type="button"
                      onClick={acceptDoi}
                      className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg bg-brand px-2.5 text-[11.5px] font-semibold text-brand-contrast transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
                    >
                      <Check className="h-3 w-3" aria-hidden="true" />
                      Add reference
                    </button>
                    <button
                      type="button"
                      onClick={() => setDoiState({ phase: "idle" })}
                      className="cursor-pointer rounded-lg px-2.5 text-[11.5px] font-medium text-text-muted transition-colors hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
                    >
                      Discard
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
