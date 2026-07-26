# Legacy R2 cover migration — plan only (not executed)

Per this run's explicit instructions, **no storage migration was performed**. This document
describes how to run the migration that already exists in the repo, safely, when a human
decides to do it.

## Current state

Some published books' `cover_url` still points at the legacy default Cloudflare R2 public
domain (`pub-859a15e085144721b664647523d5ccff.r2.dev`) rather than the Zima CDN
(`*.storage-ptec.online`). These are pre-`lib/image-optimize.ts` uploads: full-size originals,
not the sharp-optimized WebP variant every upload gets today. `docs/SECURITY-HEADERS.md`
already whitelists `*.r2.dev` in the CSP `img-src` because of this, and
`scripts/optimize-legacy-covers.mjs` already exists to fix it.

## What the existing script does (read, not modified, this run)

`scripts/optimize-legacy-covers.mjs`:

1. Finds published books whose `cover_url` is on the legacy R2 public bucket and whose object
   is larger than `SIZE_LIMIT` (150 KB).
2. Downloads each, re-encodes with `sharp` to WebP (max 800px wide, q75 — the same recipe as
   `BOOK_COVER_OPTS` in `lib/image-optimize.ts`, so the output matches what a fresh upload
   would produce today).
3. Uploads the result **alongside** the original, as `<original-path>-opt.webp` — the original
   object is never touched, so it is the rollback path.
4. Updates `books.cover_url` to the new object via PostgREST.

It has a dry-run mode by default; `--apply` is required to write anything.

## Recommended rollout (for a future run, with a human watching)

1. **Dry run first**, on a normal weekday, not during a deploy: `node
   scripts/optimize-legacy-covers.mjs` (no `--apply`). Review the report: how many books,
   total bytes, any download/encode failures.
2. **Spot-check** 3–5 of the reported books manually — the cover still renders correctly, still
   passes through the CDN, no aspect-ratio/crop regression from the 800px cap.
3. **Apply during low traffic**: `node scripts/optimize-legacy-covers.mjs --apply`. This only
   writes new objects and updates `cover_url` — it does not touch `book_files` (the actual PDF
   assets), so it carries none of the risk a document-storage migration would.
4. **Verify**: homepage + `/books` LCP improves (this was flagged from a real Lighthouse run
   measuring 1.26 MB of covers, one at 582 KB, as the homepage's LCP ceiling); no broken
   `<img>` for any book cover across both locales.
5. **Do not delete the original R2 objects** in the same pass. Keep them for at least one full
   release cycle as the rollback path; removing `*.r2.dev` from the CSP `img-src` allowlist
   only after confirming (via server logs or a grep of live `cover_url` values) that nothing
   still points there.
6. This does **not** touch book/thesis/publication PDF files or the Zima/R2 download routes —
   scope is covers only.

## Why this wasn't run now

The task's own instructions for this audit pass explicitly prohibit storage migrations in this
run ("do NOT migrate storage in this run; write a migration plan doc only") — independent of
that, this sandbox also has no `R2_*` or `SUPABASE_SERVICE_ROLE_KEY` credentials, so the script
could not have been run here even if it were in scope.
