"use client";

import { AlertTriangle, CheckCircle2, FileText, Globe, Search, Users } from "lucide-react";
import { ContextPanel } from "@/components/admin/kit/form";
import type { PublicationReviewResult } from "@/lib/publications/review";

type StepKey = "basic" | "authors" | "content" | "details" | "files" | "review";

export interface PublicationContextProps {
  step: StepKey;
  siteUrl: string;
  title: string;
  slug: string;
  abstract: string;
  journalName: string;
  keywords: string;
  subjects: string;
  authorCount: number;
  referenceCount: number;
  hasPdf: boolean;
  hasCover: boolean;
  review: PublicationReviewResult;
}

/** Google-style truncation points. Not exact — nobody's are — but honest about the cliff. */
const TITLE_LIMIT = 60;
const DESC_LIMIT = 155;

/**
 * The context sidebar's content for the publication workspace.
 *
 * One panel per step, chosen so the panel answers the question the step raises
 * rather than restating the fields beside it. Basic info and Content raise "how
 * will this look to someone who has not read it" — so, the search result. The
 * structural steps raise "is this enough" — so, a count with a verdict.
 *
 * The Review step gets nothing: that tab is already mission control, and a
 * summary of the summary is noise.
 */
export default function PublicationContext(props: PublicationContextProps) {
  const { step } = props;
  if (step === "review") return null;
  if (step === "basic" || step === "content") return <SeoPreview {...props} />;
  if (step === "authors") return <AuthorsContext {...props} />;
  if (step === "files") return <FilesContext {...props} />;
  return <DiscoveryContext {...props} />;
}

function SeoPreview({ siteUrl, title, slug, abstract, journalName }: PublicationContextProps) {
  const shownTitle = title.trim() || "Untitled article";
  const description = abstract.trim().replace(/\s+/g, " ");
  const url = `${siteUrl}/publications/${slug || "…"}`;

  return (
    <ContextPanel
      title="Search result preview"
      icon={Search}
      hint="Roughly how this article appears in Google and on shared links."
    >
      <div className="rounded-lg border border-divider bg-bg-surface p-3">
        <p className="truncate text-[11px] text-success-text">{url}</p>
        <p className="mt-0.5 line-clamp-2 text-[15px] font-medium leading-snug text-info-text">
          {shownTitle}
          {journalName.trim() ? ` — ${journalName.trim()}` : ""}
        </p>
        <p className="mt-1 line-clamp-3 text-[12.5px] leading-[1.55] text-text-body">
          {description || "No abstract yet — search engines will invent a snippet from the page."}
        </p>
      </div>

      {/*
        Counts against the truncation point, not a hard limit. Over-length is a
        warning, never an error: a long title is a real title, and refusing to
        save one would be the tool overruling the record.
      */}
      <dl className="mt-3 space-y-1.5 text-xs">
        <Measure label="Title" length={shownTitle.length} limit={TITLE_LIMIT} />
        <Measure label="Snippet" length={description.length} limit={DESC_LIMIT} />
      </dl>
    </ContextPanel>
  );
}

function Measure({ label, length, limit }: { label: string; length: number; limit: number }) {
  const over = length > limit;
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-text-muted">{label}</dt>
      <dd className={`tabular-nums font-medium ${over ? "text-warning-text" : "text-text-body"}`}>
        {length}/{limit}
        {over ? " — will be cut" : ""}
      </dd>
    </div>
  );
}

function AuthorsContext({ authorCount, review }: PublicationContextProps) {
  const authorIssues = review.items.filter((i) => i.step === "authors");
  return (
    <ContextPanel title="Authorship" icon={Users} hint="Order here is the order readers and citations see.">
      <Stat value={authorCount} label={authorCount === 1 ? "author listed" : "authors listed"} ok={authorCount > 0} />
      <IssueList items={authorIssues.map((i) => i.message)} okLabel="No authorship problems." />
    </ContextPanel>
  );
}

function FilesContext({ hasPdf, hasCover, review }: PublicationContextProps) {
  const fileIssues = review.items.filter((i) => i.step === "files");
  return (
    <ContextPanel title="Files" icon={FileText} hint="What a reader can open and what the listing shows.">
      <ul className="space-y-1.5 text-[13px]">
        <FileRow label="Article PDF" present={hasPdf} required />
        <FileRow label="Cover image" present={hasCover} />
      </ul>
      <IssueList items={fileIssues.map((i) => i.message)} okLabel="No file problems." />
    </ContextPanel>
  );
}

function DiscoveryContext({ keywords, subjects, referenceCount, review }: PublicationContextProps) {
  const count = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean).length;
  const detailIssues = review.items.filter((i) => i.step === "details" || i.step === "content");
  return (
    <ContextPanel title="Discovery" icon={Globe} hint="How this article gets found once it is live.">
      <div className="grid grid-cols-3 gap-2">
        <Tile value={count(keywords)} label="Keywords" />
        <Tile value={count(subjects)} label="Subjects" />
        <Tile value={referenceCount} label="Refs" />
      </div>
      <IssueList items={detailIssues.map((i) => i.message)} okLabel="Nothing outstanding here." />
    </ContextPanel>
  );
}

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border border-divider bg-bg-surface px-2 py-2 text-center">
      <p className="text-lg font-bold tabular-nums leading-none text-text-heading">{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">{label}</p>
    </div>
  );
}

function Stat({ value, label, ok }: { value: number; label: string; ok: boolean }) {
  return (
    <p className="flex items-baseline gap-2">
      <span className={`text-2xl font-bold tabular-nums ${ok ? "text-text-heading" : "text-danger"}`}>{value}</span>
      <span className="text-[13px] text-text-muted">{label}</span>
    </p>
  );
}

function FileRow({ label, present, required }: { label: string; present: boolean; required?: boolean }) {
  return (
    <li className="flex items-center gap-2">
      {present ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
      ) : (
        <AlertTriangle
          className={`h-4 w-4 shrink-0 ${required ? "text-danger" : "text-warning"}`}
          aria-hidden="true"
        />
      )}
      <span className="text-text-body">{label}</span>
      <span className="ml-auto text-xs text-text-muted">
        {present ? "Present" : required ? "Required" : "Optional"}
      </span>
    </li>
  );
}

function IssueList({ items, okLabel }: { items: string[]; okLabel: string }) {
  if (items.length === 0) {
    return <p className="mt-3 text-xs text-text-muted">{okLabel}</p>;
  }
  return (
    <ul className="mt-3 space-y-1.5 border-t border-divider pt-3">
      {items.map((message) => (
        <li key={message} className="flex items-start gap-1.5 text-xs leading-[1.55] text-text-body">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" aria-hidden="true" />
          {message}
        </li>
      ))}
    </ul>
  );
}
