# Pre-Meeting Technical Checklist

_Generated 28 August 2026 from a live audit of production
(`library.ptec.edu.kh` / Supabase `ufeymdoqksojwyysicun`)._

Work top-down. **§1 and §2 are blockers** — do not demo without clearing them.

---

## 1. Blockers — fix before the meeting

### ☐ 1.1 Two published records have missing files (404)

Verified against storage on 28 Aug 2026. Both records render their detail page
normally, so the failure only appears **when you click to read or download** —
the worst possible moment in a demo.

| Record | Slug | Broken | Fix |
|---|---|---|---|
| Thesis (the library's **only** thesis) | `/theses/research` | PDF → 404 | Re-upload the PDF at `/admin/theses` |
| Book "This IS NOT Acceptable" | `/books/this-is-not-acceptable` | PDF **and** cover → 404 | Re-upload both, or unpublish |

The bytes are gone from both storage hosts (`storage-ptec.online` and
`api.storage-ptec.online`) — they cannot be recovered by script, only
re-uploaded from the original files.

**Root cause of the thesis failure:** the stored filename is a run of 80
underscores — a Khmer filename stripped to nothing by ASCII sanitisation. When
re-uploading, **rename the file to Latin characters first**.

**Minimum action if the PDFs cannot be found:** unpublish both records so
nothing broken is reachable during the demo.

```bash
# Re-check after fixing — expect "0 broken"
npx tsx scripts/check-file-health.ts
```

### ☐ 1.2 No librarian or staff account exists

Current accounts: **14 reader**, **1 admin** (`mongkul.digital@gmail.com`),
**2 super_admin** (`raksmeyron97@gmail.com`, `ronraksmey3@gmail.com`).

The demo script's Stage 2 shows the *librarian* workspace and Stage 3 shows
role differences — neither can be shown convincingly with no librarian account.

**Action:** at `/admin/users`, create or promote three demo accounts:

| Purpose | Role | Shows |
|---|---|---|
| Reader demo | `reader` | Public site, saved books, reading lists |
| Librarian demo | `librarian` | Book/thesis CRUD, uploads — but **no** settings or user management |
| Admin demo | `admin` | Everything except role editing and storage management |

Signing in as the librarian and showing that System Settings is **absent** is
the most convincing proof that the permission system is real.

---

## 2. Verify — 24 hours before

### ☐ 2.1 Tunnel and domain

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://library.ptec.edu.kh/
curl -s https://library.ptec.edu.kh/api/health
```

Expect `200` and `{"status":"ok","checks":{"db":"ok","storage":"ok"}}`.

**Known issue — the fallback hostname is not redirecting.**
`https://library.storage-ptec.online/` currently returns **200 and serves the
full library**, instead of a 308 to the canonical host. It also sends no
`x-robots-tag`, so it is indexable.

Two consequences, both worth fixing but neither a demo blocker if you only ever
type the canonical URL:

- **Sessions break.** Auth cookies are per-host — a reader who arrives on the
  fallback hostname appears signed out.
- **Duplicate content.** The same library is publicly indexable on two
  hostnames, competing with the canonical one in search results.

Middleware *is* running on that host (it returns `x-request-id`), so the most
likely cause is `CANONICAL_HOST_REDIRECT=off` still set in the box's `.env`
from a DNS cutover, or a deployed image predating the redirect. Check the box:

```bash
grep CANONICAL_HOST_REDIRECT .env   # on the ZimaOS box — should be unset
```

**During the demo, always type `library.ptec.edu.kh` directly.**

### ☐ 2.2 Demo dataset spot-check

Every item below was verified working on 28 Aug 2026:

```
☐ /                        homepage + live counters
☐ /km                      Khmer homepage, URL stays /km
☐ /books                   114 published books, 0 missing covers
☐ /search?q=action research    results + 6 "Found inside" page hits
☐ /books/action-research-in-practice   opens in the reader
☐ /paths/foundations-of-pedagogy       learning path
☐ /api/oai?verb=Identify   OAI-PMH feed answers
☐ /sitemap.xml             200
```

Khmer search terms that return real results: `វិទ្យាសាស្ត្រ`, `ស្រាវជ្រាវ`, `គណិតវិទ្យា`.

### ☐ 2.3 AI features

The Gemini **generation** quota is healthy — `/api/search` returned a real
summary with page citations on 28 Aug.

The Gemini **embedding** quota was **exhausted** on 28 Aug during the backfill
(HTTP 429). Impact is limited and does not affect the demo:

- ✅ **Metadata embeddings complete** — books 118/118, theses 1/1,
  publications 1/1, catalog 7/7. Semantic search works.
- ✅ **"Found inside" works** — it reads `book_pages` (text), not embeddings.
- ⚠️ **Passage-level chunks incomplete** — 3 of 97 records. Only affects
  page-cited answers in the AI assistant.

**Action:** re-run after the quota resets (it is idempotent — it skips what is
already done):

```bash
npx tsx scripts/embed-library.ts
```

Expect to re-run it across several days until `book_chunks` reaches 97/97.

### ☐ 2.4 Offline / PWA device check

Do this on the **actual phone** you will present with, the day before:

```
☐ Open https://library.ptec.edu.kh in the phone browser
☐ Add to Home Screen — confirm the PTEC emblem and splash screen appear
☐ Launch from the home screen icon (not the browser)
☐ Open a book and let it finish loading
☐ Turn on flight mode
☐ Open /offline-books — the book must still open
☐ Turn flight mode off
```

If a previous version of the app is installed on that phone, the service worker
waits rather than activating (updates are opt-in by design). **Accept the
update prompt and let it reload before the meeting**, so no update banner
appears mid-demo.

### ☐ 2.5 Presenter account

```
☐ raksmeyron97@gmail.com signs in at /admin/login          (role: super_admin ✅)
☐ MFA is enrolled — currently 0 factors, so first login forces enrolment
☐ Authenticator app is on the phone you will bring
☐ Recovery details stored offline
```

**Do not leave MFA enrolment until the meeting.** Enrol at `/admin/mfa/enroll`
beforehand and confirm you can sign in twice.

---

## 3. Backup and rollback readiness

```
☐ Pre-meeting backup verified — ~/ptec-backups/db/2026-08-28T14-30-15Z/
    97 tables, 34,736 rows, checksums pass (30 MB)
☐ BACKUP_PASSPHRASE set on the box (archives are otherwise unencrypted)
☐ A copy exists on a second device
```

Re-verify the newest archive on the morning of the meeting:

```bash
node scripts/backup/verify-backup.mjs "$(ls -td ~/ptec-backups/db/*/ | head -1)"
```

---

## 4. Repository state

```
☐ npx vitest run          — 1847 passed, 33 skipped (verified 28 Aug) ✅
☐ npx tsc --noEmit        — clean, exit 0 (verified 28 Aug) ✅
☐ Migration 0124 merged and applied by CI before the meeting
```

**Migration 0124** (`0124_reconcile_schema_drift.sql`) was added during this
audit. It restores two objects that existed in the migration chain but were
missing from the hosted database:

- `contact_rate_limit` — **absent in production**, which silently disabled the
  contact form's 60-second cooldown and hourly cap. `checkLimit()` read a
  missing table, fell back to an empty history, and returned "not blocked" for
  every submission. Turnstile was the only remaining anti-spam layer.
- `categories.created_at` — absent; currently unread by app code.

Apply it the normal way — open a PR and let `migrate.yml` apply it on merge.
**Never apply migrations by hand in the Supabase SQL editor.**

---

## 5. Known limitations — have an answer ready

Say these plainly if asked; do not let them surface as surprises.

| Topic | Honest answer |
|---|---|
| **Only 1 thesis, 1 publication** | The books collection is the mature part (114 published). Theses and publications are built and working but need content — that is a first-month task for library staff, not a development task. |
| **Thesis PDF missing** | Being re-uploaded; caused by a Khmer filename that the storage layer could not encode. The filename handling is a known item. |
| **Some URLs contain Khmer script** | They work, but they are hard to share in chat apps. Prefer Latin slugs for new content. |
| **English subject names show Khmer text** | The canonical `subjects` table has `name_en` populated with Khmer and `name_km` empty. It is **not user-visible today** — the site reads the `categories` table — but it must be corrected before the canonical model becomes the read source. See `docs/CANONICAL-RESOURCES.md`. |
| **Duplicate academic program** | `research_programs` has both "Bachelor + 1" (`bachelor_plus_1`) and "ba+1" (`b_cd-12`). Clean up at `/admin/manage`. |

---

## 6. Meeting-day sequence

```
☐ 60 min before  — confirm /api/health returns ok
☐ 60 min before  — sign in to /admin, clear the MFA prompt
☐ 30 min before  — open every Stage-1 URL once to warm the cache
☐ 30 min before  — phone: launch the PWA, accept any update prompt
☐ 15 min before  — open docs/CLIENT_DEMO_SCRIPT.md on a second screen
☐ 15 min before  — close unrelated browser tabs; disable notifications
☐  5 min before  — load the homepage in the browser you will present from
```

**If the internet fails during the meeting:** the installed PWA still opens
downloaded books offline. That is not a fallback — it is Stage 1.5 of the demo.
Show it deliberately.
