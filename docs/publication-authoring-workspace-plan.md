# Publication authoring workspace: repository findings and implementation plan

Verified on 2026-07-11 before this redesign.

> **Status (2026-07-11): implemented.** All six slices shipped. Migration
> `0085_publication_authoring_workspace.sql` is additive and pending apply;
> until it is applied, saves fall back to the legacy non-transactional path
> (no revision guard) and autosave reports itself unavailable. After applying,
> the fallbacks in `app/actions/publication-workspace.ts` can be removed.

## Existing architecture

- Admin routes are `/admin/publications`, `/admin/publications/new`, and
  `/admin/publications/edit/[id]`. Create and edit share the client-side
  `PublicationForm`; mutations use permission-guarded Next.js Server Actions.
- English and Khmer abstracts are PostgreSQL `text`. References are an ordered
  JSONB array. The current runtime shape is `{ id, index, text, doi?, url? }`.
- Canonical inline citations use `[cite:ref-stable-id]`. Visible numbers are
  derived from reference order. Legacy positional tokens such as `[cite:2]`
  remain readable and are upgraded only when an administrator saves.
- Public abstracts are parsed into constrained React nodes (paragraphs, bold,
  italic, subscript, superscript, citations). Arbitrary stored HTML is never
  injected, and unsupported markup remains escaped text.
- Protected admin layout, MFA/AAL2, `publications:read|write` permissions,
  service-role Server Actions, audit logging, and published-only public RLS are
  already in place.
- Production-compatible data must remain readable: published rows may contain
  references with only `{ index, text }` and no citation tokens.

## Problems grounded in the current code

- Abstract and References are separate form tabs. Both language editors and
  both permanent previews are stacked, producing a long writing surface.
- Citation selection is a truncated native select. A never-focused textarea is
  still treated as an insertion point, and raw tokens are directly editable.
- Reference cards only expose formatted text, DOI, and URL. The normalizer
  currently discards any additional metadata.
- Completion markers are green/gray color-only dots. Publish bypasses content
  validation, generic updates can accept `is_published`, and saves have no
  optimistic concurrency guard.
- Publication, authorship, and supporting-file writes are separate operations;
  a later failure can leave a partially updated record.
- There is no separate publication draft snapshot, autosave status, recovery,
  review summary, DOI lookup, or staged paste-review workflow.
- Public locale selection does not choose a single matching abstract; both are
  rendered in a fixed English-first order.

## Design direction

The subject is an academic manuscript desk for PTEC librarians. Its single job
is to let an administrator write a reliable bilingual abstract while keeping
the evidence margin within reach.

- **Palette:** PTEC Navy `#1E3A8A`, College Gold `#DDB022`, Ink `#0B1530`,
  Paper `#F3F4F6`, Surface `#FFFFFF`, and semantic success/warning/danger from
  the existing design tokens.
- **Type:** the existing sans face for controls, Crimson Pro/serif for the
  publication preview, Hanuman for Khmer, and the existing mono utility face
  for DOI and citation data.
- **Layout:** a six-step rail frames one connected Content workspace. On wide
  screens the manuscript occupies roughly two-thirds and a searchable citation
  margin occupies one-third; tablet/mobile use an accessible drawer.
- **Signature:** a restrained gold evidence-margin rule connects the active
  insertion target to the citation panel. It is structural, not decorative.

```text
desktop
+-----------+--------------------------------------+--------------------+
| six steps | language + Write / Split / Preview  | insertion target   |
|           +--------------------------------------+--------------------+
|           | manuscript editor / optional preview| search + references|
|           |                                      | add / edit / cite  |
+-----------+--------------------------------------+--------------------+
| saved state                 Save draft | Preview | Review and publish |
+-----------------------------------------------------------------------+

mobile/tablet
+-----------------------------------------------------------------------+
| step tabs | language | mode | Citations                              |
+-----------------------------------------------------------------------+
| manuscript / preview                                               |
+-----------------------------------------------------------------------+
| sticky save and review actions                                     |
| citation manager opens as a focus-managed full-height drawer       |
+-----------------------------------------------------------------------+
```

The direction deliberately avoids a generic dashboard of colorful cards. The
only visual risk is the academic evidence margin; everything else stays quiet,
compact, and consistent with the PTEC admin system.

## Compatibility and implementation slices

1. Extend reference JSON with optional structured metadata while preserving
   `text` and an optional original/formatted override. Add grouped stable-ID
   tokens without invalidating singular or positional legacy tokens.
2. Add pure utilities and tests for parsing, DOI normalization, citation
   grouping/ranges, language mismatch, per-language counts, reorder behavior,
   URL safety, and publish review.
3. Build one-language-at-a-time Write/Split/Preview modes, a constrained rich
   editor with atomic visual citation tokens, fullscreen writing, and a
   searchable responsive citation manager.
4. Add a separate autosave-draft table and content revision, then save the
   publication row, authorships, and file links through one service-role-only
   transaction. Publishing re-reads and validates canonical server data.
5. Make public rendering locale-aware, support grouped citation links, and
   preserve reduced-motion focus/highlight behavior.
6. Verify with focused unit/component tests, lint, type checking, production
   build, React Doctor, keyboard checks, and screenshots at desktop, tablet,
   and mobile widths.

## Rollout and rollback principle

All database changes are additive. Apply the migration before deploying the
application revision. To roll back, first deploy the previous application,
then drop the new RPC, draft table, and revision column. Stable IDs and
additional reference JSON keys can remain because older readers ignore them.
