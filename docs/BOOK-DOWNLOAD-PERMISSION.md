# Per-book download permission

A librarian can publish a book as **read online only**: readers open it in the
in-app viewer exactly as before, and the server refuses to hand over the file.

This is the book counterpart of the publication rule in
[AUTHOR-PROFILES-AND-ACCESS.md](./AUTHOR-PROFILES-AND-ACCESS.md) §2 — same
column names, same default, same reading of an absent column — so the two are
two thin readings of one idea rather than two ideas.

---

## 1. What it is, and what it is not

It is **authorization over a file-serving route**, not DRM.

| Blocked | Not blocked |
|---|---|
| The sanctioned download route, for every caller | Reading the book in the viewer |
| `Content-Disposition: attachment` anywhere in the book routes | The PDF bytes travelling to the browser so it can render pages |
| Saving the book for offline reading (a copy kept on the device) | A determined reader reassembling those bytes by hand |
| The download counter and download history | |
| `citation_pdf_url` for Google Scholar | Every other `citation_*` tag, and the landing page |
| `fileUrl` in OAI-PMH / metadata exports | The harvestable metadata record itself |

Online reading necessarily streams the file to the client. Anyone able to open
devtools can keep what their own browser received. Claiming otherwise would be
false, and would invite exactly the wrong kind of confidence. What the setting
buys is that **no route hands out the file as a file**, no aggregator is told
where to fetch it, no permanent URL exists to share, and every refusal is
recorded.

---

## 2. Schema (`0131`)

```sql
alter table public.books
  add column if not exists allow_download           boolean not null default true,
  add column if not exists download_disabled_reason text;
```

`not null default true` is written for every existing row by the ALTER itself,
so **no book becomes restricted by applying the migration**. There is no
nullable "unknown" state to interpret.

`books_with_stats` lists its columns explicitly (it predates `books.embedding`
and must never expose the vector), so `0131` recreates it with
`allow_download` added — otherwise the listing surfaces could not see the flag
without a second query per book.

No index: the flag is read alongside a book already located by primary key or
slug, never as a search predicate.

---

## 3. One resolution, five readers

`lib/books/access.ts` → `resolveBookDownloadAccess()` is pure and
browser-safe. Everything asks it, so a drawn button and a served byte stream
cannot disagree:

1. **`/api/books/[slug]/download` — the enforcement point.** It decides whether
   the bytes leave the server, re-deciding on every request.
2. `app/[locale]/(public)/books/[slug]/page.tsx` — whether the offline-save
   action is offered, and which notice replaces it.
3. `app/[locale]/(public)/books/[slug]/read/page.tsx` — the viewer's
   `allowDownload` prop.
4. `/api/search/native` — whether a result carries a download action, so a
   result never links straight at a 403.
5. `lib/seo/citation.ts` and `lib/metadata-exports/works.ts` — whether a
   machine is told where the file is.

### The bypass that had to be closed first

`/api/books/[id]/file?download=1` used to answer with an `attachment`
disposition of its own. That made it a **second, ungated download path** — and
the one the search results linked at — so any policy on `/download` would have
been sidestepped by a query parameter.

It now 307-redirects into `/download` *before* any database or storage work, so
there is exactly one gate. `app/api/books/[slug]/file/route.test.ts` includes a
source scan asserting the file route builds no `attachment` disposition at all;
the only way back to a bypass is someone reintroducing that string.

`/download` accepts a **slug or a book id** for exactly this reason: the file
route is keyed by id, and resolving both keeps the redirect a redirect instead
of a second copy of the policy.

---

## 4. Storage URLs (the leak this closed)

`book_files.file_url` is a Zima CDN URL that `zimaFetch()` retrieves with **no
credentials**. Anyone holding the string can fetch the PDF forever: no session,
no rate limit, no policy, no log.

Four places were handing it to browsers — `mapRowToBook()`, the
continue-reading route, the homepage shelf and `getSavedBooks()` — which would
have made this whole feature decorative. All of them now emit
`bookFileHref(id)` (`/api/books/<id>/file`, the authenticated proxy), and
`lib/books/storage-url-exposure.test.ts` is a source scan that fails if a
`pdfUrl` is ever assigned from `file_url` again.

Legacy R2 bare keys are unaffected: they were already served through a
short-lived presigned GET made server-side, never handed to the client.

---

## 5. Who may still download a restricted book

`canOverrideBookDownloadPolicy()` (`lib/books/download-authority.ts`) delegates
to `requirePermission("books", "write")` — the same check the upload form and
the edit form pass. So the people who can **set** this policy are exactly the
people who can look past it, and the admin panel's MFA requirement rides along.

It is asked from a public route about a caller who is usually an ordinary
reader, so it answers `false` rather than throwing: an unauthenticated caller,
a reader, and an admin who has not completed MFA all fail closed, in one place.

Every override writes an `admin_actions` row (`book.download_override`).

---

## 6. Reader-facing states

| Reason | What the reader sees |
|---|---|
| `no-file` | The existing "PDF not available" state — nothing to read or download |
| `policy` | The librarian's own message, or `bookDetail.readOnlineOnly`; the offline-save action is absent |

No status codes, no storage vocabulary. The reader is told what this book *is*,
not that something failed. Reading online stays the primary action, which it
already was on a book detail page.

---

## 7. Audit and telemetry

| Event | Where |
|---|---|
| `book.download_permission` (from → to) | `admin_audit_log`, on every change in the edit form |
| `book.download_override` | `admin_audit_log`, when a librarian downloads a restricted book |
| `download` / `denied` / `DOWNLOAD_DISABLED` | `activity_events`, minute-idempotent so one burst of clicks is one event |
| `download_blocked` | the security event stream |

A refused attempt is **never** counted as a download: `increment_download_count`
and the `download_logs` insert both sit after the gate.

---

## 8. Pre-migration safety

Every read of the columns is defensive, because a deploy that reaches a
database before `0131` does must degrade to today's behaviour, not to an error:

| Reader | Behaviour without the columns |
|---|---|
| `/api/books/[slug]/download` | retries with the pre-0131 column list → allowed |
| book detail page, read page, `generateMetadata` | retry without the columns → page renders, downloadable |
| `/api/search/native` | retry without the column → results render, download offered |
| `lib/metadata-exports/works.ts` | `fallbackSelect` on the spec → OAI-PMH keeps working |
| `saveBookRecord` | omits the keys unless the client decided → column default |
| `updateBook` | a payload without `allowDownload` leaves the setting untouched |

`resolveBookDownloadAccess` treats `undefined` **and** `null` as allowed, and
`lib/books/access.test.ts` pins that: only an explicit `false` restricts, so a
partial select can never silently restrict a book a librarian never restricted.

---

## 9. Caching

The 403 and the 200 both carry `private, no-cache, no-store`. `/download` is
not matched by `FILE_ROUTE_RE`, so the service worker treats it as private
NetworkOnly and never caches it (`lib/sw-policy.ts`). The public book page
caches the flag for up to an hour under the `books` tag, and `revalidateBook()`
runs on every save — but the route reads no cache at all, which is what makes a
stale page harmless.
