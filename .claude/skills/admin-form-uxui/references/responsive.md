# Responsive behaviour

The admin panel is used on desktop, on tablets in the library, and on phones by
staff away from a desk. A form that only works at 1440px is not finished.

## Breakpoints (Tailwind defaults, as used in this repo)

| | Width | What happens |
|---|---|---|
| Base | < 640px | One column. Sticky action bar with safe-area padding. Aside/preview hidden. Step nav scrolls horizontally |
| `sm` | ≥ 640px | Two-column field grids activate. Buttons stop being full-width |
| `md` | ≥ 768px | Keyboard hints (`⌘S saves`) appear. Table layouts become viable |
| `lg` | ≥ 1024px | Two-pane layouts (form + preview aside) activate. Step nav can become a vertical rail |
| `xl` | ≥ 1280px | Nothing new. Do not add a third field column here |

## Column collapse

- `grid gap-4 sm:grid-cols-2` — the only field grid you need.
- A field that is short on desktop is not short on a 360px phone. Anything with
  a placeholder longer than ~20 characters should be full width at every size.
- Never collapse at `lg` only. Tablets in portrait (768px) must already have
  usable field widths.

## Sticky actions

- The action bar is `sticky bottom-0` at **every** size, not just mobile. On
  desktop it keeps Save reachable in a long form; on mobile it is the only thing
  making the form completable.
- `pb-[max(0.75rem,env(safe-area-inset-bottom))]` — required on iOS.
- `-mx-4 sm:-mx-6` with matching padding so the bar spans the full form width
  and its top border reads as a divider, not a floating box.
- Keep it to one row. Below `sm`, hide secondary button *labels* and keep their
  icons with `aria-label`, rather than wrapping to two rows.
- A wizard's step nav may be `sticky top-0` as well — but not both a sticky
  header, a sticky step nav and a sticky footer on a 640px-tall phone viewport.
  On mobile, drop the sticky header and keep the step nav plus the action bar.

## Button stacking

- Below `sm`: primary full width, secondary full width beneath it, Cancel as a
  text button. Reverse visual order so the primary is on top and reachable with
  a thumb.
- At `sm` and up: horizontal row, right-aligned, primary rightmost.
- Minimum touch target `min-h-10` (40px) — the repo already standardises on
  this. `44px` for anything that deletes.

## Dialogs and drawers

| | Mobile | Desktop |
|---|---|---|
| **Dialog** | Full-bleed sheet, `max-h-[92vh]`, internal scroll, `shrink-0` footer pinned | Centred, `max-w-lg`–`max-w-2xl`, `max-h-[88vh]` |
| **Drawer** | Full-screen | `w-[420px]`–`w-[560px]` from the right |
| **Wizard/editor overlay** | Stacked: settings, then preview below | Side by side; settings pane fixed width, preview flexes |

Rules that apply to all three:

- The header and footer must be `shrink-0`; only the body scrolls. A dialog
  whose footer scrolls out of reach is unusable on a phone with the keyboard up.
- The preview pane stacks below the settings pane rather than shrinking beside
  it — a 200px-wide preview is worse than no preview.
- On mobile, an on-screen keyboard eats ~45% of the viewport. Anything that must
  stay reachable has to be sticky, not merely "near the bottom".

## Two-pane forms

```
grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]
```

- `minmax(0,1fr)` not `1fr` — without the `minmax`, a long unbroken string in
  the form column blows out the grid.
- The aside is `hidden lg:block` and `sticky top-24`.
- **Nothing essential may live only in the aside.** Status, error counts and the
  primary action stay in the header or the action bar, which are visible at
  every size.

## Long forms

- A step nav must scroll horizontally on mobile (`overflow-x-auto`) with the
  active step scrolled into view on change — not wrap to three rows.
- Consider collapsing optional sections into `<details>` on mobile only. Do not
  collapse a section that contains a required field.
- Keep the field count per step low enough that a phone user is not scrolling
  through fifteen inputs to reach Next.

## Tables inside forms

Copies panels, reference lists, author rows. Below `md`, switch to stacked cards
with the column name as a label — do not leave a horizontally scrolling table as
the only option. `EbookMobileCard` is the pattern already in the repo.

## Verifying

Check at **360×640, 768×1024 and 1440×900** at minimum. Specifically:

- No horizontal page scroll at 360px.
- The primary action reachable without scrolling, at every step.
- No field narrower than ~160px.
- Sticky bar not overlapping the last field (add bottom padding equal to the
  bar's height on the form body).
- Dialog footer visible with a text field focused and the keyboard open.
