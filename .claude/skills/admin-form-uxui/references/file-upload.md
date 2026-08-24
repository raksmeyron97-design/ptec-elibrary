# File upload

The most consequential form surface in this app: books and theses are PDFs, and
a failed or silently-wrong upload is a broken public record.

## PTEC storage facts (do not change these as part of a UX task)

- **Zima Storage is primary** (`lib/zima.ts`); bare R2 keys are a legacy
  fallback for old rows.
- Admin uploads go through the `uploadToZima()` Server Action
  (`app/actions/upload.ts`) or `POST /api/admin/upload`. Both check
  `requirePermission("books", "write")` and restrict the destination to
  `books/`, `posts/`, `research/`, `reports/`, `team/`, `avatars/`.
- Images are optimised with sharp (`lib/image-optimize.ts`) server-side.
- `VIRUSTOTAL_API_KEY` drives a hash-reputation check (`lib/virus-scan.ts`) and
  **fails open** if unset.
- Book covers are Zima CDN URLs, or legacy R2 keys prefixed with
  `NEXT_PUBLIC_R2_COVERS_URL`.
- User avatars use Vercel Blob.
- "Theses" upload to `research/` — the naming caveat in `CLAUDE.md` is real.

Existing components to reuse before writing anything:
`app/(admin)/admin/(protected)/theses/_components/PdfDropzone.tsx`,
`CoverDropzone.tsx`, and `components/admin/catalogs/CatalogCoverField.tsx`.

## Required lifecycle

```
select or drop
   → validate type + size CLIENT-SIDE (before any network call)
   → local preview (object URL for images, name+size for PDFs)
   → upload with visible progress
   → success: show the stored file with replace / remove
   → failure: keep the old file, show the error, offer Retry
```

## Selection

- **Both** a drop zone and a browse button. Never drop-only — it is unreachable
  by keyboard and impossible on touch.
- Keep the real `<input type="file">` in the DOM as `sr-only` with a genuine
  `<label htmlFor>`. Do not replace it with a `<div onClick>` that calls
  `.click()` — that loses keyboard access and the accessible name.
- Reset `input.value = ""` after every pick, or re-selecting the same file after
  a failed upload silently does nothing.
- `accept` narrows the picker but is **not** validation — the user can still
  drop anything.

## Client-side validation

Run before the request. Refusing a 400 MB PDF after a four-minute upload is the
worst possible order.

| Kind | Types | Cap |
|---|---|---|
| Book / thesis / article PDF | `application/pdf` | State the real limit in the hint and enforce it |
| Cover image | `image/jpeg`, `image/png`, `image/webp`, `image/avif` | Enforce, and say the recommended aspect |
| Attachment | per field | per field |

Messages name the actual problem and the actual limit:

- "That file is a .docx — upload a PDF."
- "That file is 68 MB. The limit is 50 MB."
- "That image is 320×180. Covers need to be at least 600px wide."

Show the accepted types and the size cap **in the hint, before** the user picks —
not only in the error afterwards.

## Progress

- Use real progress where the transport reports it (`XMLHttpRequest.upload.onprogress`,
  or a streamed fetch). A determinate bar on a 40 MB PDF over a Cambodian mobile
  connection is the difference between waiting and reloading the page.
- Where progress genuinely is not observable, a spinner **plus** a label
  ("Uploading manuscript…") — never a bare spinner.
- Show the file name and size next to the progress. Users upload the wrong file
  more often than the upload fails.
- **Block Save while an upload is in flight**, with the button labelled
  "Waiting for upload…". A save that races the upload stores a null URL.

## Preview

- Images: render the object URL immediately on pick, before the upload finishes,
  with a busy overlay **on top of** the preview. Swap to the stored URL on
  success. Never blank the area while uploading.
- PDFs: file name, human-readable size, page count if already known, and a link
  to open the stored file once it exists.
- Existing file in **edit** mode is shown as the current state with **Replace**
  and **Remove** — never as an empty picker that implies nothing is attached.

## Replace, remove, failure

- **Replace** is a distinct action from Remove. Remove clears the field; Replace
  opens the picker with the old value still in place until the new one succeeds.
- **A failed upload must leave the existing URL untouched.** Set the new value
  only after success. This is the rule iCase gets right and it is the one that
  actually protects data.
- **Retry** re-sends the same file without re-picking it. Keep the `File` object
  in state until the upload has succeeded.
- **Remove** on a file that is already published is a destructive action —
  confirm it via `ConfirmDialog`, naming what will break.
- Removing a queued-but-not-uploaded file needs no confirmation.

## Multiple files

- A list, not a grid, when order matters and labels are needed (supporting
  information). A grid when they are images.
- First image is **Primary** with a badge, and the others carry a
  "Make primary" action.
- Per-row remove, with an `aria-label` naming the row
  (`Remove supporting file 2`).
- Row actions must be reachable on `focus-within`, not `group-hover` alone.
- An empty list gets a line of text ("No supporting files yet."), never a blank
  area.

## By resource type

| Resource | Fields | Notes |
|---|---|---|
| **Books** | PDF (required) + cover (strongly recommended) | Cover absence is a warning at publish, not a blocker at save. Indexing of page text happens server-side via `after()` — do not make the user wait for it |
| **Theses** | PDF → `research/` + cover | Publish gate lives in `lib/publish-readiness.ts` |
| **Publications** | Article PDF + graphical abstract + N supporting files | Supporting rows need a label field each |
| **Catalog (physical)** | Cover only | No PDF field at all — do not show one |
| **Posts** | Inline images + hero | Hero has an aspect-ratio hint |
| **Team** | Portrait | Square crop hint; avatars go to Vercel Blob, not Zima |
| **Homepage photos** | Image + alt text | Alt text is **required**, not optional — it is a public accessibility obligation |

## Anti-patterns

- Uploading on form submit rather than on pick, so the user waits at the end
  with no idea which file is slow.
- Clearing the field when the upload fails.
- A drop zone with no visible browse affordance.
- Validating type only by file extension.
- Silently truncating a filename so the user cannot tell which file they picked.
- Auto-uploading in the background with no indication, then saving a URL the
  user never saw confirmed.
