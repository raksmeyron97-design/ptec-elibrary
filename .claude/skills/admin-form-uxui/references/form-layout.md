# Form layout

## Choosing a shape

Pick by field count and by whether the user needs the surrounding page.

| Shape | Use when | PTEC example |
|---|---|---|
| **Dialog** | ≤ 4 fields, one concept, the list behind it is the context | `ManageCategoriesModal`, `PhotoFormModal` |
| **Single-panel page** | 5–12 fields, one concept, no sub-workflows | `books/UploadForm` |
| **Sectioned page** | 12–25 fields that group into 2–5 named ideas | `TeamForm`, `PathBuilderForm` |
| **Stepper / wizard** | > 25 fields, or the work has a real order, or a publish gate | `PublicationForm`, `ThesisForm`, `AddBookWizard` |
| **Drawer / side panel** | Editing one row while the list stays visible and comparable | `MetricDetailsDrawer` |

Do not use a dialog for anything with an upload plus more than two other fields —
the height fight against `max-h` makes both worse. Promote it to a page.

Do not add a stepper to a form that fits on one screen. Steps buy comprehension
at the cost of an extra click per section; below ~15 fields you are paying and
not buying.

## Anatomy

```
Page
├── PageHeader              breadcrumb · h1 · one-line description · actions slot
├── [StepNav]               wizard only — owns fields, shows per-step error counts
├── <form>
│   ├── FormSection         title · optional explanation · related fields only
│   │   ├── Field           label · required · control · error | hint
│   │   └── Field
│   └── FormSection
└── FormActions             sticky bottom · truthful status · Cancel · [secondary] · Primary
```

## Measurements

These are the PTEC values. They are close to iCase's but expressed in PTEC
tokens and one step tighter, matching the existing admin panel.

| Thing | Value |
|---|---|
| Form page max width | `max-w-5xl` (`max-w-3xl` for a short single-panel form) |
| Page gutters | `px-4 sm:px-6` |
| Two-pane split | `lg:grid-cols-[minmax(0,1fr)_320px]`, aside `sticky top-24` |
| Between sections | `space-y-6` |
| Between fields | `space-y-4` |
| Field grid | `grid gap-4 sm:grid-cols-2` |
| Label → control | `mb-1.5` |
| Control → error/hint | `mt-1.5` |
| Section panel | `rounded-2xl border border-divider bg-bg-surface p-5 sm:p-6` |
| Control | `h-11 rounded-lg px-4 text-sm` (textarea: `h-auto py-3`) |
| Button | `min-h-10 rounded-lg px-4 text-[13px] font-semibold` |
| Section title | `text-sm font-semibold text-text-heading` |
| Section description | `text-xs text-text-muted` |
| Label | `text-sm font-semibold text-text-body` |
| Hint / error | `text-xs` |

## Grid rules

- **Two columns maximum.** Three columns of inputs on a 1280px admin panel gives
  each field ~330px, which is narrower than the text most of them hold.
- Full width always: title, slug, abstract, description, rich text, tag inputs,
  file fields, anything with a long placeholder.
- Two columns are for **short, related, comparable** pairs — start/end page,
  first/last name, volume/issue, from/to dates. Pairing unrelated fields just to
  fill the row is worse than a taller column.
- Collapse to one column below `sm`. Never below `lg` only — tablets are the
  most common admin device after desktop here.

## Grouping

A section is a **question the user can answer**, not a database table.

Good: *Basic info · Authors · Content · Files · Review & publish*
Bad: *Fields 1–8 · Fields 9–16*, or *Metadata* (what metadata?)

- 3–8 fields per section. One field in its own section is noise; twelve is a
  wall.
- Give a section a one-line explanation only when the title does not carry it.
  "Files" needs no explanation. "Classification" does.
- Optional-heavy sections should say so once in the description
  ("Everything here is optional — leave blank to hide it on the public page")
  rather than tagging every label with "(optional)".
- Order sections by what the user knows first, not by schema order.

## Why this structure works

- **The header answers "where am I and how do I leave"** and never scrolls away
  on wizards; the user can always abandon safely.
- **Sections cut recall cost.** A 40-field flat form forces the user to hold the
  whole record in mind. Five named groups let them hold one.
- **The actions bar is the only place a save can happen**, so there is never a
  question of which button commits.
- **Error slot reserved beneath every control** means correcting a mistake never
  reflows the form under the user's cursor.
- **A standing preview or review step** restores the whole-record view that
  sectioning destroys — the more you split, the more you need it.

## Restraint

The failure mode of admin redesigns is decoration. Specifically forbidden:

- A card inside a card inside a card. One panel per section, full stop.
- A border *and* a shadow *and* a background tint on the same element.
- Gradients on form surfaces (`btn-brand-gradient` on the primary button is the
  one sanctioned exception, and it already exists).
- An icon on every label. Icons disambiguate; a decorative one costs scan time.
- More than the tokened status colours. No new hues.
- Animation on field state changes. The error appearing is the feedback.
