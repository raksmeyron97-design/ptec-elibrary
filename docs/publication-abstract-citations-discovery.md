# Publication abstract and citation discovery

Verified on 2026-07-11 before implementation.

## Architecture and routes

- The application uses Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, `next-intl`, and Supabase (`package.json`).
- The individual public route is `app/[locale]/(public)/publications/[slug]/page.tsx`. English is served at `/publications/[slug]`; Khmer is served at `/km/publications/[slug]` through the `as-needed` locale strategy in `i18n/routing.ts` and middleware locale rewriting.
- Public publication reads use the `getPublicationBySlug` Server Action in `app/actions/publications.ts` and require `is_published = true`.
- Admin publication routes are:
  - list: `/admin/publications`
  - create: `/admin/publications/new`
  - edit: `/admin/publications/edit/[id]`
- Create and edit share the client-side `PublicationForm` in `app/(admin)/admin/(protected)/publications/_components/PublicationForm.tsx`. Mutations use Next.js Server Actions rather than a publication CRUD REST API.

## Publication content and data contract

- `publications.abstract` and `publications.abstract_km` are PostgreSQL `text` columns.
- `publications.references` is already `jsonb NOT NULL DEFAULT '[]'` and was designed for objects shaped as `{ index, text, doi?, url? }` (`supabase/migrations/00000000000000_initial_schema.sql`).
- There is no editable publication body/full-text column. Publication-owned editable prose is limited to the English and Khmer abstracts; the full article is an attached PDF.
- The browser-safe contract is hand-written in `lib/publications.ts`; there is no ORM or generated Supabase database type.
- A stable optional ID can be added to each existing JSONB reference object without a database migration. Visible reference numbers can continue to be derived from array order.

## Current authoring and rendering

- Publication abstracts are plain textareas, not HTML, Markdown, rich-text JSON, or an installed rich-text framework.
- References are currently authored as one line per item. Saving rebuilds each item as only `{ index, text }`, which discards stored DOI and URL metadata during an edit.
- The public abstract renderer outputs one React text paragraph. React escaping is safe, but paragraphs, inline formatting, subscript, superscript, and citations are not interpreted.
- The public page flattens structured references to strings. The shared thesis `ReferenceList` numbers by array position and does not provide fragment targets or backlinks.
- `ReferencesSection` currently slices references after item 10 out of the DOM. Citation navigation to item 11 or later therefore requires the publication-specific list to expand before focus/scroll.
- No inline-citation parser or publication preview exists.

## Editor and sanitization

- No ProseMirror, Tiptap, Slate, Lexical, or similar editor dependency is installed.
- Posts have a custom Markdown textarea and React-node renderer, but it is post-specific and does not support academic citations, subscript, or superscript.
- `lib/sanitize.ts` provides DOMPurify but is not used for publications. Publication content is currently safe because React renders it as text.
- The implementation should preserve that security model by parsing a constrained syntax into React nodes and never using `dangerouslySetInnerHTML` for abstracts or references.

## Design system and localization

- Semantic PTEC color, typography, focus, dark-mode, and spacing tokens live in `app/globals.css`.
- Khmer and English are provided through `next-intl` message files (`messages/km.json`, `messages/en.json`).
- Equivalent “Show more” and “Show less” translations exist under search facets, while publication-specific abstract controls do not yet have their own keys.
- `AbstractSection` is shared with thesis detail pages, so publication-only expansion and citation behavior must be opt-in to avoid changing thesis behavior unintentionally.

## Authentication and authorization

- Middleware and the protected admin layout require an authenticated admin-panel role; the protected layout also enforces MFA/AAL2.
- Draft reads require `publications:read`. Create, update, publish, and delete require `publications:write` through `requirePermission`.
- Public RLS exposes only published publication rows, while writes go through guarded service-role Server Actions.
- Default permissions grant publication write access to librarian, admin, and super-admin roles; staff is read-only.

## Migrations, tests, and live verification

- The active squashed database baseline is `supabase/migrations/00000000000000_initial_schema.sql`; `_archive` is retained for audit history. No publication seed data is present.
- Existing unit tests cover the publication row mapper and whole-work citation exports, but not inline citations, the admin publication form, Abstract expansion, References navigation, or Server Action reference validation.
- Baseline focused tests passed: 42 tests across `lib/publications.test.ts` and `lib/citations.test.ts`.
- The deployed target page returned HTTP 200 and matched the repository: its 1,164-word abstract was fully visible as one paragraph, with no expansion control or inline reference links. ACS returned a Cloudflare 403 to automated inspection, so only the user-specified numbered-link behavior is being used as inspiration.

## Implementation decision

No database migration or editor replacement is needed for this scope.

1. Extend reference JSON objects with a stable application-level `id`, while keeping `index`, `text`, optional DOI, and optional URL.
2. Store explicit citation tokens in the existing abstract text fields and resolve them to current array-order numbers. Stable IDs keep citations attached to the same source when references are reordered.
3. Use one pure normalization/validation/parser layer for admin and public rendering.
4. Build a publication-specific structured reference editor and constrained academic abstract renderer. Existing plain text remains backward compatible; supported formatting is rendered as React nodes.
5. Resolve citation tokens to readable numbers before abstracts are used by metadata, JSON-LD, exports, OAI, excerpts, or embeddings.
6. Add runtime Server Action validation so invalid URLs, malformed/duplicate references, and dangling citation targets cannot be published through a crafted client payload.

## Implementation record (2026-07-11)

Shipped per the decisions above; no database migration, no editor dependency.

- `lib/publications/citations.ts` — pure normalization/validation/token layer (unit-tested, 33 tests). Stable IDs are namespaced `ref-…`; visible numbers derive from array order; legacy numeric `[cite:2]` tokens resolve positionally and are upgraded to stable-ID tokens on admin load and on save.
- `components/ui/publications/AcademicText.tsx` — constrained renderer (paragraphs, `**bold**`, `*italic*`/`_italic_`, `<sub>`/`<sup>`, `[cite:id]` → numbered links) that emits React nodes only; never `dangerouslySetInnerHTML` (component-tested, 6 tests).
- Public page: `PublicationAbstractSection` (expand/collapse with overflow detection, bottom fade, `aria-expanded`/`aria-controls`, reduced-motion, print + noscript overrides, full text always in DOM) and a rewritten `ReferencesSection` (fragment targets `#reference-<id>`, per-occurrence backlinks `#citation-<source>-<id>-<n>`, DOI/source chips, copy, hash-triggered auto-expand of both the collapsed list tail and a collapsed abstract).
- Admin: `AcademicAbstractField` (bilingual toolbar editor + live preview) and `ReferenceEditor` (add/bulk-paste/edit/reorder/remove with token cleanup + confirm, live validation, cited-count badges, cite-from-row) wired into `PublicationForm`; Server Action re-validates everything.
- Abstract token resolution wired into: detail metadata/JSON-LD/Scholar tags, native search, home featured cards, listing-page match, OAI-PMH, citation exports, and the embedding backfill script.
- Verified end-to-end headlessly on the live-data dev server (temporary reversible row edit, restored byte-identical): 15 legacy-data checks, 15 citation-navigation checks (incl. backlink auto-expanding a clipped citation), 16 admin-form checks, and axe WCAG 2.1 AA clean in light/dark × en/km (fixed three pre-existing violations found along the way: metrics-strip `<dl>` misuse, TOC number contrast, ORCID badge contrast).
