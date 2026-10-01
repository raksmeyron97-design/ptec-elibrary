# Performance baseline (SEO Phase 6, finding F15)

Mobile Lighthouse on production, before any of this programme's changes are
deployed (production runs `main` at `622db9d`). Two sources, both read-only:

1. **My runs, 2026-10-01**, Lighthouse **13.5.0**, mobile, simulated throttling
   (150 ms RTT, 1.6 Mbps, 4× CPU), headless Chrome 154. One URL per template
   the programme names, **3 rounds**, strictly one page at a time with an 8 s
   pause between runs. Medians are taken **metric by metric**. The runner is
   `scripts/seo-lighthouse.sh`, the table is from
   `scripts/seo-lighthouse-summary.ts`.
2. **The Lighthouse CI median reports** of the post-deploy run on 2026-09-30
   (`lighthouse.yml`, run 36688775811, Lighthouse 12.1, GitHub runner). These
   cover ten URLs, not including a subject or a path. That Lighthouse version
   crashed in the LCP-element gatherer on the runner's Chrome, so these
   reports cannot name the LCP element. That is why I made my own runs.

**Read TBT with care.** Lighthouse simulates the network but replays the CPU
time it *observed*. My machine was under load (load average 7–18), so TBT
varies 0.5–4.5 s between rounds of the same page. The CI runner is quieter.
Bytes, the LCP element and CLS do not depend on load.

## Six templates (my runs, medians of 3)

| Template | URL | Perf | FCP s | LCP s | TBT ms | CLS | JS KB | Image KB | Font KB | Total KB | Requests | LCP element (slot) | LCP: TTFB · load delay · load · render delay (ms) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| home | `/` | 49 | 2.1 | 5.2 | 1921 | 0.00 | 273 | 169 | 155 | 867 | 64 | img 412×841 (hero) | 270 · 43 · 79 · 1199 |
| books | `/books` | 60 | 1.8 | 5.3 | 769 | 0.00 | 356 | 435 | 155 | 1251 | 75 | img 182×243 (first cover) | 348 · 31 · 476 · 289 |
| record | `/books/introduction-to-qualitative…` | 62 | 1.8 | 5.5 | 701 | 0.00 | 312 | 178 | 155 | 954 | 66 | img 220×293 (cover) | 397 · 55 · 555 · 234 |
| subject | `/subjects/គណិតវិទ្យា` | 68 | 1.7 | 3.9 | 746 | 0.00 | 279 | 51 | 155 | 809 | 60 | h2 338×54 | 353 · — · — · 774 |
| path | `/paths/early-grade-reading` | 64 | 2.1 | 4.8 | 733 | 0.00 | 287 | 109 | 155 | 858 | 58 | img 336×188 (header) | 313 · 47 · 429 · 326 |
| thesis | `/theses/គុណភាពនៃការបង្រៀន-និង-រៀន-…` | 60 | 1.8 | 4.7 | 910 | 0.00 | 299 | 56 | 155 | 819 | 57 | h1 356×195 | 390 · — · — · 954 |

## Ten URLs (Lighthouse CI medians, 2026-09-30)

| URL | Perf | FCP ms | LCP ms | TBT ms | CLS | JS KB | Image KB | Font KB | Total KB |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `/` | 46 | 2455 | 4994 | 3165 | 0 | 273 | 179 | 155 | 879 |
| `/km` | 76 | 2161 | 5181 | 185 | 0 | 273 | 179 | 168 | 910 |
| `/books` | 72 | 2016 | 6488 | 204 | 0 | 356 | 436 | 156 | 1255 |
| a book (`/books/សេដ្ឋកិច្ចកម្ពុជា`) | 75 | 2029 | 6515 | 66 | 0 | 312 | 186 | 156 | 972 |
| `/theses` | 78 | 2310 | 5058 | 116 | 0 | 312 | 51 | 156 | 869 |
| a thesis | 84 | 1988 | 4125 | 87 | 0 | 299 | 50 | 156 | 816 |
| the same thesis, `/km` | 80 | 1978 | 4906 | 105 | 0 | 299 | 50 | 156 | 839 |
| `/catalogs` | 74 | 2089 | 7275 | 82 | 0 | 354 | 117 | 156 | 952 |
| `/contact` | 76 | 1931 | 5596 | 121 | 0 | 711 | 70 | 156 | 1231 |
| `/auth/login` | 88 | 2022 | 3544 | 96 | 0.036 | 378 | 116 | 156 | 1648 |

## What the data says, and what it does not

- **Layout shift is solved.** CLS is 0 on every public template, in both
  sources. Nothing to fix.
- **First paint is about 2 s everywhere; the largest paint is 4–7 s.** The gap
  differs by template:
  - **Record page.** The LCP is the cover, in a **220×293** slot. Its `sizes`
    said `100vw` below 768 px, so a 412 px phone at DPR 1.75 fetched the
    **828w** variant: Lighthouse counts 48 of 65 KB of that image as wasted.
    **Fixed** (below).
  - **`/books`.** The LCP is the first card's cover, and its `sizes` is right
    (the 384w variant). The extra JS on this page is not a cover problem: see
    the next bullet.
  - **Thesis and subject.** The LCP is text: the H1 on the thesis, a section
    H2 on the subject hub. Most of the time is *render delay* (0.8–1.0 s after
    the HTML arrives). On production the H1 still sits in the hidden streaming
    container that Phase 1 removed (D9; the harness's `h1-visible-without-js`
    passes on every template locally), so these pages should improve when
    Phases 1–5 deploy. That is unmeasured until then.
  - **Home.** The LCP is the hero AVIF (26 KB, preloaded at high priority).
    Its load is fast (≈80 ms); the delay is main-thread time.
- **`/books` and `/catalogs` carry 45 KB of JavaScript no other page does**:
  the Supabase browser client (realtime, storage, WebAuthn; 161 KB
  uncompressed), 36 KB of it unused at load. One component pulled it in: the
  "Request a book" button created the client at mount to ask whether its
  dialog should show a sign-in prompt. **Fixed** (below).
- **The English home page's 3.2 s TBT in CI is an ordering artefact, not the
  page.**
  - `/` and `/km` run the same chunks; on `/` each takes about twice as long.
  - `/` is the first URL of the CI run and of each of my rounds.
  - In my second and third rounds `/` blocked about as long as `/books`.
  - Not pursued.
- **The boot screen does not cost LCP.** It covers the viewport on the first
  page of every browser session, which is every Lighthouse run and every
  visitor arriving from a search result. A paired experiment (5 alternating
  pairs per page, throttled, on the local build) gave the same LCP with and
  without it:
  - home 2,308 vs 2,280 ms
  - record 2,160 vs 2,184 ms
  - On the thesis its emblem became the LCP element (1,824 ms) rather than
    delaying the page's content.
  - Kept as it is.
- **No preconnect to the storage host.** Every request on every template goes
  to `library.ptec.edu.kh` (covers are served through `/_next/image`) plus
  Cloudflare's beacon. A preconnect would open a connection nothing uses.
- **Fonts are already lean.** Four files on every page (155 KB):
  - Crimson Pro, Inter and Hanuman-Khmer, each preloaded (42–48 KB).
  - Hanuman's Latin face (17 KB, not preloaded), pulled in by spaces and
    digits inside Khmer text.
  - No bold Khmer loads. The display faces (Koulen, Angkor) are not
    preloaded.

  All four are used on every template, so dropping a preload would only trade
  bytes now for a later font swap. No change.
- **`/contact` loads ~420 KB of Google Maps JavaScript.** The iframe is already
  `loading="lazy"`, but Chrome's iframe threshold on slow connections reaches
  it from the first viewport. It runs out of process (TBT 121 ms), so it costs
  bytes, not interactivity. A click-to-load placeholder would remove it, but
  that changes the page, so it is your call (Phase 6 report, P6-1).

## After (local production build, same machine)

**What was measured.** The two fixes change bytes, which do not depend on
machine load, so the comparison is bytes on the wire. A phone (412×823,
DPR 1.75) loaded each page on two local production builds of the same
database, one before the fixes and one after:

| Page | What | Before | After |
|---|---|---:|---:|
| `/books/<record>` | the cover (the LCP element) | 828w file, **56 KB** | 448w file, **22 KB** (−61%) |
| `/books` | script, first load | 366 KB, 36 files, Supabase client loaded | **299 KB**, 32 files, no Supabase client |
| `/catalogs` | script, first load | 365 KB, 35 files, Supabase client loaded | **297 KB**, 31 files, no Supabase client |

The 67 KB saved on `/books` is exactly the three Supabase chunks
(`9845` 45 KB, `44530001` 14 KB, `9304` 8 KB); the same files carry the same
content hashes in production, so the saving carries over unchanged.

**Timing was not measurable locally today.** The paired Lighthouse runs
(before/after, 3 rounds) failed with `NO_NAVSTART`: the machine reached a
load average of 67 and later 181, and Chrome could not record a trace. One
build also failed when the network dropped mid-download of the fonts. I did
not substitute a number. Timing is re-measured on production after deploy
with the same runner (`scripts/seo-lighthouse.sh`, RUNBOOK Phase 7 §1). The
expected effect, for checking it against:

- **Record page.** At Lighthouse's simulated 1.6 Mbps, 34 KB less on the LCP
  image is about 0.17 s less "load" in the LCP split (555 ms median today).
- **`/books` and `/catalogs`.** 67 KB less script before the page is
  interactive, and 161 KB less to parse.
- **Thesis and subject.** Their text LCP should lose most of its 0.8–1.0 s
  render delay once Phase 1's removal of the hidden streaming container is
  live. That is not a Phase 6 change; this file records the expectation so
  the post-deploy run can confirm or refute it.

## After deploy (production, 2026-10-01, 15:05 Phnom Penh time)

The same runner, the same six URLs, three sequential rounds, Lighthouse 13.5
mobile. The machine's load was 6.7 (it was 7–18 for the baseline), so read
TBT as indicative only. Before → after, medians:

| Template | Perf | FCP s | LCP s | JS KB | Image KB | LCP element | LCP render delay (ms) |
|---|---:|---:|---:|---:|---:|---|---:|
| home | 49 → 69 | 2.1 → 1.8 | 5.2 → 4.7 | 273 → 273 | 169 → 179 | hero image | 1,199 → 547 |
| `/books` | 60 → 64 | 1.8 → 1.7 | 5.3 → 4.8 | **356 → 284** | 435 → 429 | first cover | 289 → 167 |
| record | 62 → 68 | 1.8 → 1.7 | 5.5 → 4.7 | 312 → 314 | **178 → 137** | cover | 234 → 55 |
| subject | — | 1.7 → 1.7 | 3.9 → 2.5 | 279 → 282 | 51 → 44 | (one run only) | — |
| path | 64 → 76 | 2.1 → 1.6 | 4.8 → 4.3 | 287 → 289 | 109 → 102 | header image | 326 → 91 |
| thesis | 60 → 70 | 1.8 → 1.6 | 4.7 → 3.9 | 299 → 301 | 56 → 49 | H1 | 954 → 548 |

- **The two byte fixes carried over to production.** `/books` script fell by
  72 KB (the Supabase client), and the record page's images by 41 KB (the
  cover at 448w instead of 828w).
- **LCP fell on every template**, 0.5–0.8 s. The thesis H1's render delay
  halved, as the Phase 1 change predicted.
- **Subject is incomplete.** Two of its three runs failed with Lighthouse's
  own `NO_NAVSTART` trace error, so its row is a single run and its score is
  not reported.
- **Caveat:** before and after are a day apart, so network and server load
  differ. The byte figures are exact; the timings are indicative.

