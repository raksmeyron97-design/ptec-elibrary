# SEO runbook: steps outside the repository

Things this programme cannot change from code. Phase 0 (2026-09-30) opened the
file with the checks its findings need; Phase 7.4 completes it (Search Console,
Bing, the PTEC main-site menu, the old Google Site, Google Business Profile).

---

## F1: find where the stale `/books` came from

Production served the current `/books` on 40 of 40 requests on 2026-09-30, and
nothing in our stack can hold HTML for weeks (`AUDIT-VERIFICATION.md` F1). Two
hypotheses remain. Each takes a few minutes to settle.

**A. The auditor's side.** Ask for the raw response headers of the stale
response. Every response from this origin carries `cf-ray`, `date` and
`cf-cache-status` (`DYNAMIC` for `/books`). A copy without them, or with a
`date` from before 2026-09-12, did not come from us.

**B. A second origin behind the hostname.**

1. Cloudflare Zero Trust → Networks → Tunnels → the tunnel serving
   `library.ptec.edu.kh` → **Connectors**. Expect exactly the ZimaOS box. Any
   other connector (another IP or hostname, or an old `cloudflared` version) is
   a second origin: find it and stop it.
2. On the box, list what runs from the app image:

   ```sh
   docker ps --format '{{.ID}}  {{.Image}}  {{.CreatedAt}}  {{.Ports}}' \
     | grep -E 'ptec-elibrary|:13000|:3000'
   ```

   Expect exactly one app container, from the image the latest deploy pulled.
   A second container from an older image, or anything else answering on the
   tunnel's target port (`13000`, per the `docker-compose.yml` comment), is the
   stale origin.
3. Once one of these is settled, record the answer in
   `AUDIT-VERIFICATION.md` F1.

From Phase 1 onward, a build-fingerprint response header will make any stale
copy attributable in one request.

## N7: is ISR memory-only in production?

The container's root filesystem is read-only (`docker-compose.yml`
`read_only: true`; only `/tmp` and `/app/.next/cache` are writable), and Next's
file-system ISR cache writes pages under `.next/server/app`. To confirm, check
the container log for write failures:

```sh
docker logs --since 24h <app-container> 2>&1 | grep -iE 'EROFS|read-only file system|ENAMETOOLONG|prerender cache' | head
```

Write failures mean ISR entries live only in the in-memory LRU and are lost on
every restart, which bears on Phase 6.

## Cloudflare: before anyone adds an HTML cache rule

Today Cloudflare stores **no** HTML (`cf-cache-status: DYNAMIC` on every
page). ISR pages leave the origin with
`s-maxage=<revalidate>, stale-while-revalidate=31535940`, about **one year**.
If a "Cache Everything" or HTML cache rule is ever added, Cloudflare would be
entitled to serve a year-old page while it revalidates: exactly the F1 symptom,
this time for real. Any such rule must set an explicit Edge TTL and
**ignore** the origin's `stale-while-revalidate`, and `/books`, `/search` and
every other `private, no-store` page must stay excluded. Purge on deploy
(Phase 7.4).

## Phase 2: publishing reviewed introductions and names

Nothing in these files reaches a page until a librarian marks it approved.

**Subject introductions and English names** (`content/drafts/subject-intros.json`).
1. For each subject: edit `intro_en` to 80–150 words (32 of the 35 drafts are
   shorter — the database holds no more facts; add what a librarian knows),
   have a Khmer reader correct `intro_km` and clear `km_review`, check
   `name_en.value` and set `name_en.status` to `"approved"` if it is right,
   then set `status` to `"approved"`. Two entries carry a Khmer spelling
   question in `notes`.
2. Dry run on a machine that can reach the target database:
   `NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/seo-import-subject-intros.ts`
   — it prints the target host and what it would write, and refuses an
   approved entry that breaks a rule.
3. The same command with `--apply`. Pages change within an hour (the
   subject reads are cached under the `categories` tag), or at once after
   any category save in the admin.

**Hub introductions** (`content/drafts/hub-intros.json` → `content/hub-intros.json`).
Copy an approved hub's `en` and `km` into `content/hub-intros.json` under its
key with `"status": "approved"`, in a pull request. `lib/seo/hub-intros.test.ts`
refuses the PR if an entry is not approved, still carries a review marker, or
runs outside 60–120 English words.

**Author biographies** (Phase 2.6). A journal author's biography counts as
approved once their profile is published (Admin → Journals → Authors). A book
author's biography needs `authors.bio_status = 'approved'`; there is no admin
control for it yet, so it is a one-row SQL update on the box. The "PTEC staff"
switch is on the journal-author form.

**Catalogue twins** (`docs/seo/catalogue-twin-candidates.csv`). 40 print/e-book
pairs share a title but name different authors, so the site does not link
them. Mark `same_work` for the librarians' record; linking them needs a
decision first (see the Phase 2 report).

**After deploy**, sequential, read-only:
- `curl -s https://library.ptec.edu.kh/sitemaps/authors.xml | grep -c '<loc>'`
  — today's single sitemap lists 361 author URLs; after deploy only authors
  with 3+ works or an approved biography remain (D2).
- `curl -s "https://library.ptec.edu.kh/subjects/%E1%9E%82%E1%9E%8E%E1%9E%B7%E1%9E%8F%E1%9E%9C%E1%9E%B7%E1%9E%91%E1%9F%92%E1%9E%99%E1%9E%B6?page=2" | grep -o '<link rel="canonical"[^>]*>'`
  — page 2 of Mathematics is self-canonical.

## Phase 3: research, open access and Google Scholar

**Opening a thesis's full text** (a librarian's decision; nothing is open by
default, D4). Admin → Theses → edit → "Public full text": record the licence in
the form, tick that the authors consented, tick "Publish the full text openly",
save. The database refuses `open` without both (0163). Then, read-only:
`curl -sI https://library.ptec.edu.kh/theses/<slug>/fulltext.pdf` should answer
`200` with `content-type: application/pdf`. Every other thesis answers `403`.

**Before opening one, check Scholar will take it.** On the box, with the
service key (the text-layer column needs it):
`NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/seo-scholar-pdf-report.ts`
— a PDF over 5 MB or without a text layer (a scan, or Khmer in a legacy
non-Unicode font) is refused by Google Scholar as full text; re-export it first.

**Research that should move into the theses collection.** Librarians mark the
`decision` column of `docs/seo/research-migration.csv` (33 `/books` candidates,
six old Google Site items). A confirmed move ships as its own change with a 301
from the old `/books/<slug>` and a test per redirect; the Google Site items are
created as new thesis records with librarian-checked metadata.

**Google Scholar has no submission form.** It crawls pages that carry
`citation_*` tags. After deploy, sequential and read-only:
- `curl -s https://library.ptec.edu.kh/theses/<slug> | grep -c 'name="citation_'`
  on the page in the work's own language, and `0` on the other one.
- `npx tsx scripts/seo-check.ts --base https://library.ptec.edu.kh --phase 3 --delay 1500`.
Inclusion takes weeks; check with a `site:library.ptec.edu.kh` search on
scholar.google.com, not before a month.

## Phase 4: checking the structured data after deploy

Every public page now carries ONE `application/ld+json` block holding an
`@graph`. After deploy, one URL per template, by hand:
- validator.schema.org — paste the URL; expect no errors, and the college,
  library and website nodes plus the page's own.
- Google's Rich Results Test — books, articles, posts/events and the two FAQ
  pages (`/` and `/policy`); FAQ rich results are no longer shown by Google
  (May 2026), so "not eligible" there is expected, not a defect.
- Search Console → Enhancements: the counts move over the following weeks;
  a drop in "Sitelinks search box" items is expected (D10 removed it).
Then, read-only and sequential:
`npx tsx scripts/seo-check.ts --base https://library.ptec.edu.kh --phase 4 --delay 1500`.

## Phase 5: book descriptions

**Before anything:** migration `0164_book_description_review.sql` must be on
production (it reaches the box with the merge — check `/admin/data-quality/descriptions`
opens and lists books). It adds three columns to `books` and the service-role-only
`book_description_drafts` table; it changes no existing description.

**Writing and approving descriptions (librarians).** Admin → Data Quality →
*Book descriptions* lists, most-viewed first, the books whose description is
empty or shared with four or more others (`docs/seo/description-quality.md`
has the counts). For each book: write the description in the book's own
language (the field the page shows is the one approval copies), *Save draft*,
then *Approve and publish* — two separate acts on purpose. Approval needs
`books: write`; the draft is visible to nobody outside the admin panel until
then. A draft that still contains `TODO`, `needs_review` or `TBD` is refused
at approval: remove the marker once the wording has been checked.

**Rule-built drafts (optional, off by default).** On the box, where the
service-role key lives (never from a laptop against production):

```
NEXT_PUBLIC_SUPABASE_URL=<internal Supabase URL> SUPABASE_SERVICE_ROLE_KEY=<key> \
  npx tsx scripts/seo-draft-book-descriptions.ts --limit 20 --confirm-host <host>
```

That is a dry run: it reads one request at a time, prints the time it will
take (no paid API is used), and writes `content/drafts/book-descriptions.json`.
Read the file; if the drafts are worth a librarian's time, add `--apply` to
store them as drafts (`source = 'extracted'`, never over an existing draft).
More than 50 books on production also needs `--approved-over-50` — the
owner's decision, not the operator's. A book whose contents page has no
numbered chapters gets no draft; it stays in the queue for a librarian.

**Claude-written drafts (`source = 'claude_cowork'`, approved 2026-10-01).**
The owner overrode D7 on 2026-10-01: model-written description drafts are
allowed in this pipeline. They are still DRAFTS — stored in the RLS-closed
drafts table, published only by a librarian's *Approve and publish*, labelled
in the queue as written by Claude. Needs migration 0165. Three steps, with a
file between each:

```
# 1. read-only export: metadata + readable front/body page text
NEXT_PUBLIC_SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> \
  npx tsx scripts/seo-cowork-descriptions.ts export --limit 20 --confirm-host <host> --out cowork-bundle.json
# 2. Claude writes cowork-drafts.json from the bundle, checking as it goes (offline, no env):
npx tsx scripts/seo-cowork-descriptions.ts check --bundle cowork-bundle.json --drafts cowork-drafts.json
# 3. dry run, then --apply to store them
… seo-cowork-descriptions.ts apply --bundle cowork-bundle.json --drafts cowork-drafts.json --confirm-host <host> [--apply]
```

The check (`lib/seo/cowork-description.ts`) refuses any number the book's
own material does not contain, the wrong language for the book, Arabic
digits or broken orthography in Khmer, and lengths outside the band. It
cannot tell whether a sentence is TRUE: that is the review. These drafts
carry no `TODO(km-review)` marker (owner decision), so one click approves.
Export in pages of 250 rows: a 1,000-row books page with embeds hit
production's statement timeout. The bundle holds page text: keep it out of
git (`content/drafts/cowork-*.json` is ignored) and delete it after apply.

**Switching the indexing gate on (owner decision, after review has started).**
`SEO_DESCRIPTION_GATE=on` in the box's `.env`, then restart the container.
A book with NO readable file and an empty or templated description becomes
`noindex, follow` and leaves `/sitemaps/books.xml`. Books with a file are
never withheld. Measured 2026-09-30: the gate would withhold **2** of 1,956
books.

Timing: a book PAGE follows the gate on its next render (an hour at most for
a page already in the ISR cache). The SITEMAPS are rendered on every request
from entries cached for an hour (`unstable_cache`, tag `sitemap`). A restart
starts with an empty cache, so the first request after it already reflects
the gate. Approving a description fires the `books` and `sitemap` tags
(`revalidateBook()`), so the book is back in the sitemap within a request or
two. Until 2026-10-01 both sitemap routes were prerendered while the image
was built in CI, where `SEO_DESCRIPTION_GATE` does not exist, so every deploy
put the withheld books back in `books.xml` for about an hour while their
pages said noindex. They now render at request time, pinned by
`lib/seo/description-gate.test.ts`. Check after the restart, sequentially:
`curl -s https://library.ptec.edu.kh/sitemaps/books.xml | grep -c '<loc>'`
should drop by that number, and
`npx tsx scripts/seo-check.ts --base https://library.ptec.edu.kh --description-gate --delay 1500`
should pass — the flag lets the books sitemap hold fewer records than `/books`
and prints the gap. Without the flag that check fails while the gate is on.


## Phase 7: after the programme deploys

Everything below happens outside the repository. Read-only checks against
production go **one request at a time** (`--delay 1500`): it 502s under about
six concurrent requests.

### 1. Verify the deploy (the same day)

1. Migrations 0161–0164 reach production through the box's `migrate.sh` on
   deploy (`supabase/MIGRATIONS.md`); `migrate.yml` going green applies
   nothing here. Confirm each with one query in the box's SQL console
   (read-only):
   `select count(*) from information_schema.columns where table_name = 'books' and column_name = 'description_status';` → 1.
   If the deploy log says `canceling statement due to lock timeout`, the
   database was busy: nothing was applied, the old image is still serving,
   and the next timer tick retries. If the new image failed its health check
   while the site was already down for another reason, `deploy.sh` marks it
   known-bad and stops retrying: run `sudo ./deploy/deploy.sh --force` once
   the box is healthy.
2. `npx tsx scripts/seo-check.ts --base https://library.ptec.edu.kh --delay 1500`
   — every phase. A `fail` is a regression; `unknown` is the network.
3. `scripts/seo-lighthouse.sh`, then
   `npx tsx scripts/seo-lighthouse-summary.ts reports/lh`, and compare the
   table with the baseline in `docs/seo/perf-baseline.md` (the baseline's raw
   reports are not committed; keep this run's `reports/lh` as the next one). Expect the record cover's image bytes and
   `/books` / `/catalogs` script bytes to drop as measured locally, and the
   thesis and subject LCP render delay to shrink (the H1 is no longer in a
   hidden streaming container).

### 2. Cloudflare (dashboard for `ptec.edu.kh`)

1. **Caching → Cache Rules**: confirm there is still no rule caching HTML
   (see "Cloudflare: before anyone adds an HTML cache rule" above). Nothing
   needs purging on deploy while that is true: static files are content-hashed
   and HTML is `DYNAMIC`.
2. **Security → Bots**: keep the AI-crawler setting that *instructs via
   robots.txt* **off**. When on, Cloudflare prepends its own robots.txt to the
   app's, which is how the September 2026 robots override happened. Check:
   `curl -s https://library.ptec.edu.kh/robots.txt | head -3` must start
   with the app's own comment, not Cloudflare's.
3. **Bot Fight Mode**: verified bots (Googlebot, Bingbot) must stay allowed.
   If Bot Fight Mode is on, Security → Events filtered on `Googlebot` should
   show no blocks.
4. **Caching → Configuration → Crawler Hints**: leave **off** if the app's
   IndexNow is switched on (step 5). Both notify the same engines; the app's
   pings fire on publish, Cloudflare's on cache changes this site does not
   make (HTML is not cached).

### 3. Google Search Console

1. **Property.** Prefer a *Domain* property for `ptec.edu.kh` (DNS TXT record
   in Cloudflare) so the library and the main site sit under one owner. The
   existing URL-prefix verification (`/googlee89036a09f36e87d.html`, 200)
   keeps working; do not delete that file while it is the only method.
2. **Sitemaps.** Submit `https://library.ptec.edu.kh/sitemap.xml` (an index
   since Phase 1). Remove anything else listed there that is not this URL.
3. **URL Inspection → Request indexing**, about ten a day: `/`, `/km`,
   `/books`, `/theses`, `/journals`, `/subjects`, `/paths`, then the most-viewed
   records (`docs/seo/description-quality.csv` is sorted by views).
4. **Pages report**, every two weeks for two months. Expected and fine:
   - "Excluded by noindex": catalogue records, thin author pages (D2),
     filtered and sorted listings, and books withheld by the description gate
     if it is on.
   - "Alternate page with proper canonical tag": filtered listing URLs.

   Not fine:
   - "Duplicate, Google chose different canonical than user" on a record.
   - Any record in "Crawled – currently not indexed" in large numbers. Note
     the template and add it to the next SEO review.
5. **Crawl stats** (Settings → Crawl stats), monthly: export *By response*,
   *By file type* and *By purpose*. It feeds the F13 / D6 review (section 8).
6. Google Scholar has no console; see "Phase 3".

### 4. Bing Webmaster Tools

1. **Add site → Import from Google Search Console** (fastest), or verify with
   the `msvalidate.01` token: System Settings → SEO → Bing verification →
   publish (the token is rendered on every public page).
2. **Sitemaps**: submit `https://library.ptec.edu.kh/sitemap.xml`.
3. **IndexNow** (only if switched on, section 5): after the next publish,
   *IndexNow → Submitted URLs* lists the record's English and Khmer URLs.

### 5. IndexNow (optional; off until a key is set)

The app notifies IndexNow engines (Bing, Yandex, Seznam, Naver; Google does
not use it) when a book, thesis, journal article, post or learning path is
created, edited, published, unpublished or deleted. Off until a key exists.

1. Generate a key:
   `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"`.
2. Add `INDEXNOW_KEY=<key>` to the box's `.env`, restart the app container.
3. `curl -s https://library.ptec.edu.kh/<key>.txt` must print the key; any
   other `/<hex>.txt` must answer 404.
4. Publish or edit one record. The container log shows one `[indexnow]` line
   with the HTTP status (200 or 202). Nothing is sent from a non-production
   environment, and nothing while the SEO switch in System Settings is off.
5. To stop: remove the variable and restart.

### 6. www.ptec.edu.kh (the college website team)

1. Add a **Library** item to the main menu (header) and footer of every page,
   linking to `https://library.ptec.edu.kh/`, and a Khmer label
   (`បណ្ណាល័យ`) to `https://library.ptec.edu.kh/km` on the Khmer pages. It
   must be a plain `<a href>` in the server HTML, not a script-built menu.
   Check: `curl -s https://www.ptec.edu.kh/ | grep -o 'href="https://library.ptec.edu.kh[^"]*"' | sort -u`.
2. Where the main site lists research or publications, link the theses
   collection (`/theses`) and the journals (`/journals`).
3. If the main site adds JSON-LD for the college, ask for
   `"@id": "https://www.ptec.edu.kh/#org"`: the library's pages already refer
   to that id (Phase 4), and the two then describe one entity.

### 7. The old Google Site (research archive)

1. Leave it up until the migrated records are indexed: Google Sites cannot
   301, and deleting first loses the only copy Google knows.
2. For each item the librarians moved into `/theses`
   (`docs/seo/research-migration.csv`, `decision = move`), replace the page body
   with one sentence and a link to the new record. Add a banner on the site's
   home page linking to `https://library.ptec.edu.kh/theses`.
3. When Search Console shows a new record indexed (URL Inspection), unpublish
   the old page. After every item is moved, unpublish the site.

### 8. F13: crawl budget and decision D6

D6 keeps `?sort=` and `?view=` crawlable: those URLs answer
`noindex, follow` with a canonical to the base list, and blocking them in
robots.txt would hide that signal. Revisit only on data. The monthly
Crawl stats export lists example requests; from them, estimate the share of
Googlebot requests that went to listing URLs carrying `sort`, `view` or a
filter parameter:

- **Under 20%**: no change.
- **Over 20% for two consecutive months, or record pages growing in "Discovered
  – currently not indexed" at the same time**: bring D6 back for a decision.
  A robots.txt `Disallow` change needs the owner's approval, and must never
  block `page`.

### 9. Google Business Profile

1. Find the college's profile (or the library's own, if one exists). Its
   **Website** field: the college site for the college's profile; for a
   library profile, `https://library.ptec.edu.kh/`.
2. Hours and phone must match System Settings (the footer and the
   structured data's `openingHoursSpecification` come from there). Update the
   profile whenever the settings change, and vice versa.
3. Category for a library profile: *Library* (or *Academic library*), with the
   college as the parent location in the description.
