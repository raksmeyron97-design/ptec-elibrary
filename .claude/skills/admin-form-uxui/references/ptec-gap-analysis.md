# PTEC admin — UX/UI gap analysis

Audit date 2026-08-24, against `main` + working tree. Evidence is grep/read of
the actual source, not impressions.

## Headline finding

**PTEC's best forms are ahead of iCase; PTEC's worst are behind its legacy tier.
The defect is variance, not ceiling.**

`PublicationForm` (1325 lines) has step navigation, a truthful non-optimistic
`SaveBar`, debounced recovery autosave with its own failure state,
optimistic-concurrency revisions, and a server-validated publish gate. iCase has
none of those. But the same file writes **26 label/input pairs by hand** with no
error slot, no hint, no `aria-invalid` and no `aria-describedby` on any of them.

Measured drift across `app/(admin)` + `components/admin`:

| Signal | Count |
|---|---|
| Distinct label class strings | **8+** (`mb-1.5 block text-sm font-semibold text-text-body` ×25, `mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted` ×21, plus six more variants) |
| Competing input base classes | **3** — `form-styles.INPUT_CLASS` (`h-11 rounded-lg`), `UploadForm`'s own `INPUT_CLASS` (`h-11 rounded-xl focus-field`), the wizards' local `inputCls` (`rounded-xl py-2.5`) |
| `aria-invalid` occurrences | **22**, concentrated in 3 files, across ~30 forms |
| Files with hardcoded hex in admin | **15+**; `UploadForm` alone has 30, `EditForm` 23 |
| Forms with a `beforeunload` guard | 10 — good coverage, but each hand-rolled |
| Forms routing focus to the first invalid field | **0** |
| Local re-implementations of a field-error helper | 2 (`AddBookWizard`, `EditBookWizard` — identical `errProps`/`fieldError` pairs) |

Two competing label idioms are in active use — sentence-case semibold and
uppercase micro-caps — so the panel does not read as one product.

## Matrix

| Area | iCase pattern | PTEC current | Gap | Recommendation | Priority |
|---|---|---|---|---|---|
| **Form layout** | `max-w-6xl`, sticky header + tabs, optional `280px` preview aside; one `Panel`/`SectionHeading` primitive used everywhere | Good sectioning in Publications/Theses; ad-hoc elsewhere. No shared section primitive | No canonical page/section shape | `FormSection` in the kit; standardise `max-w-5xl`, `space-y-6`/`space-y-4` | **High** |
| **Typography** | One label style, one control size | 8+ label variants, 2 idioms, 3 input classes | Panel reads as several products | Single `Field` + one `INPUT_BASE`; migrate per form | **High** |
| **Field grouping** | Tabs own declared field lists; `TABS[].fields` maps error → tab | Publications/Theses have steps; the step→field map is implicit | Errors cannot be routed reliably | Declare `fields` per step, as iCase does | **High** |
| **Buttons** | One primary, one quiet cancel, destructive kept apart | Mostly consistent (`btn-brand-gradient`, `min-h-10`), but Cancel styling varies and some forms put Delete beside Save | Destructive adjacency | Standardise `FormActions`; move Delete out of the save cluster | **High** |
| **Validation** | On submit; clears on change; **routes to the offending tab** with count badges; sentence-form messages | Publications has a full review model; most forms show one banner or nothing per-field | No per-field errors in most forms; nothing focuses the problem anywhere | `Field` error slot + `focusFirstInvalid()` helper | **High** |
| **Loading** | `disabled={saving}` + spinner; label unchanged in tier 2 | `SaveBar` is *better* than iCase — truthful, non-optimistic, autosave-aware | Not shared: only Publications has it | Extract `SaveBar` → `kit/form/FormActions` | **High** |
| **File upload** | Drop+browse, `sr-only` input with real label, preview overlay, failure preserves old URL, `input.value=""` reset | `PdfDropzone`/`CoverDropzone` are solid and reused; `UploadForm` rolls its own with hex colours and a `div`+`onClick` picker | No client-side size/type gate stated up front; no retry; no progress % | Reuse the dropzones everywhere; add size/type hints and retry | **High** |
| **Responsive** | `sm:grid-cols-2`, scrollable tab nav, aside `hidden lg:block`, dialog `max-h` + `shrink-0` footer | `SaveBar` already handles `env(safe-area-inset-bottom)`; mobile cards exist for tables | Untested at 360px on most forms; some dialogs let the footer scroll | Audit per form during rollout | Medium |
| **Accessibility** | Labels good; **no focus trap, no scroll lock, no focus restore, no `aria-invalid`** anywhere | `ConfirmDialog` has trap + scroll lock + Escape (better than iCase); field-level ARIA nearly absent | Field layer, not the dialog layer | `Field` wires ARIA once; add focus restoration to `ConfirmDialog` | Medium→High |
| **Edit workflow** | One component, five explicit differences, discard-on-dirty | Publications/Theses/Team split modes cleanly; smaller forms often have no dirty concept at all | No shared dirty/guard hook | `useDirtyGuard()` in the kit | **High** |
| **Empty states** | Ad-hoc text lines | `EmptyState` kit component — **better than iCase** | none | Keep | — |
| **Toasts** | `sonner`, `<Toaster>` mounted per page ×6 | `ToastProvider` mounted once in the admin layout, typed API, live region — **better than iCase** | none | Keep; never introduce `sonner` | — |
| **Confirmations** | `ConfirmDelete` — generic "Are you sure you want to delete this item?", names nothing | `ConfirmDialog` — tone, busy state, hint slot, focus trap, i18n — **better than iCase** | Not used by every destructive path | Sweep for remaining `window.confirm` / bare deletes | Medium |

## Priority queue

**P0 — correctness and safety**
1. No form focuses or scrolls to an invalid field. On a 6-step publication form
   an error can be entirely off-screen. (all forms)
2. Double-submit is guarded only by `disabled` in most forms; no ref guard, and
   create paths that do not capture the new id can duplicate a record.
3. Save is not blocked while an upload is in flight outside the thesis/
   publication dropzones — a race stores a null URL.
4. Field-level errors are absent from most forms, so a rejected save reports a
   banner and leaves the user hunting.

**P1 — hierarchy and consistency**
5. 8+ label styles, 3 input classes, 2 label idioms.
6. Hardcoded hex in 15+ admin files, `UploadForm` worst at 30.
7. `beforeunload` hand-rolled 10 times; absent from smaller forms entirely.
8. `AddBookWizard`/`EditBookWizard` duplicate an error-props helper verbatim.
9. "(optional)" appended to labels in Publications rather than marking required.

**P2 — polish**
10. Upload hints do not state size caps or accepted types before picking.
11. No retry on a failed upload.
12. Some dialogs allow the footer to scroll away on mobile.

**P3**
13. ⌘S exists on 2 forms; could be standard on long ones.
14. No standing preview aside outside Publications' review step.

## Affected forms, worst first

| Form | Path | State |
|---|---|---|
| `UploadForm` (books) | `app/(admin)/…/books/UploadForm.tsx` | Own input classes, own `FieldLabel`, 30 hex literals, `div`+`onClick` file picker |
| `EditForm` (books) | `app/(admin)/…/edit/[id]/_components/EditForm.tsx` | 23 hex literals, no field errors |
| `BulkUploadForm` | `app/(admin)/…/books/BulkUploadForm.tsx` | 15 hex literals |
| `PathBuilderForm` | `app/(admin)/…/paths/_components/` | Has `beforeunload`; no field errors |
| `TeamForm` | `app/(admin)/…/team/_components/` | Best of the mid-tier — has `fieldErrors` + `aria-invalid`, but hand-rolled |
| `PhotoFormModal` | `app/(admin)/…/homepage-photos/_components/` | New, uncommitted; dialog form |
| `ManageCategoriesModal` / `ManageDepartmentsModal` | `components/admin/` | Minimal dialogs |
| `PostForm` | `components/admin/posts/` | Has `beforeunload`; mixed field markup |
| `ThesisForm` | `components/admin/theses/form/` | Strong workflow; field layer hand-written |
| `PublicationForm` | `app/(admin)/…/publications/_components/` | Best workflow in the repo; 26 hand-written field pairs — **pilot target** |

## What NOT to change

- `ToastProvider`, `ConfirmDialog`, `EmptyState`, `PageHeader` — already better
  than the reference. Extend, do not replace.
- `SaveBar`'s truthful state machine — generalise it, do not simplify it.
- `PdfDropzone` / `CoverDropzone` — reuse, do not re-invent.
- The publish-gate model in `lib/publish-readiness.ts` and
  `lib/publications/review.ts` — this is the thing iCase should copy.
