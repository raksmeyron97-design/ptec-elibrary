// lib/journals/open-access.ts
//
// Whether a journal article's full text is PUBLIC (SEO Phase 3.7): it has a
// PDF, the library has not switched its download off, and its licence (or a
// librarian's explicit override) lets it be redistributed — the rule
// lib/publications/access.ts already applies to the download button. Only
// then is it served at /journals/articles/<slug>/fulltext.pdf and named in
// `citation_pdf_url`. A citation-only record of a third-party © article
// names no PDF.

import { resolveDownloadAccess } from "@/lib/publications/access";

export type ArticleOpenAccessRow = {
  slug: string;
  title: string;
  publisher?: string | null;
  license?: string | null;
  allow_download?: boolean | null;
  download_disabled_reason?: string | null;
  fulltext_redistributable?: boolean | null;
  pdf_url?: string | null;
  is_published?: boolean | null;
};

export function articleIsOpenAccess(row: ArticleOpenAccessRow): boolean {
  if (row.is_published === false) return false;
  return resolveDownloadAccess({
    slug: row.slug,
    title: row.title,
    publisher: row.publisher ?? null,
    license: row.license ?? null,
    allow_download: row.allow_download,
    download_disabled_reason: row.download_disabled_reason,
    fulltext_redistributable: row.fulltext_redistributable,
    pdf_url: row.pdf_url,
  }).canDownload;
}
