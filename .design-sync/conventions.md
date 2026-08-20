# PTEC Digital Library — build conventions

Bilingual (English/Khmer) public library UI for Phnom Penh Teacher Education College. Identity: deep navy brand + gold accent on warm paper surfaces, serif display headings, generous Khmer typography.

## Setup

- No global provider is required. The one exception is `ThemeToggle`: it reads an i18n context and throws without it — wrap it in the exported `PreviewIntlProvider`:
  ```jsx
  <PreviewIntlProvider><ThemeToggle /></PreviewIntlProvider>
  ```
- Fonts load via the remote Google Fonts `@import` already inside `styles.css` — nothing to add. Khmer text automatically uses Hanuman; display headings use Crimson Pro (Latin) / the Khmer serif stack via `font-khmer-serif`.

## Styling idiom

This is a **Tailwind utility-class system with PTEC semantic tokens** — but the stylesheet is *statically compiled*: only class names that exist in `_ds_bundle.css` do anything. Stick to the semantic vocabulary below for color/typography, and use inline `style` with `var(--color-*)` for one-off layout glue (all tokens resolve as CSS custom properties).

| Family | Real class names |
|---|---|
| Surfaces | `bg-bg-app` (page), `bg-bg-surface` (cards/panels), `bg-paper` (soft chips) |
| Text | `text-text-heading`, `text-text-body`, `text-text-muted` |
| Brand | `bg-brand` (navy), `text-brand-contrast`, `bg-accent` (gold) |
| Borders | `border-divider` |
| Status | `text-success`, `text-warning`, `text-danger`, `text-info` |
| Type | `font-khmer-serif` (display headings — what `SectionTitle` uses) |
| Loading | `skeleton` (shimmer — what all Skeleton components use) |
| Focus | `focus-field` (standalone control), `focus-shell` (wrapper of a grouped control) — see `guidelines/docs/ACCESSIBILITY-FOCUS.md` |

Tokens also exist as custom properties (e.g. `var(--color-brand)`, `var(--color-divider)`, `var(--color-text-muted)`) for inline styles.

## Where the truth lives

- `styles.css` → `_ds_bundle.css`: the full compiled stylesheet + tokens — read it before inventing a class name.
- `guidelines/docs/ACCESSIBILITY-FOCUS.md`: the focus-indicator system (one indicator per component; never hand-draw outlines).
- Each component's `.prompt.md`: its API and composition patterns.

## Idiomatic composition

```jsx
const { Card, CardHeader, CardContent, BookCover, Badge, RatingStars, Button } = window.PTECLibrary;

<Card interactive className="max-w-xs">
  <div style={{ padding: 16 }}>
    <BookCover title="វិធីសាស្ត្របង្រៀនគណិតវិទ្យា" author="លោកគ្រូ វិសាល" label="Mathematics" />
  </div>
  <CardHeader>
    <h3 className="text-text-heading font-semibold">Teaching Mathematics</h3>
    <Badge variant="success">Available</Badge>
  </CardHeader>
  <CardContent>
    <RatingStars rating={4.5} compact />
    <Button variant="primary" size="md">Download PDF</Button>
  </CardContent>
</Card>
```

Buttons: `primary` (navy) for the main action, `gold` for high-emphasis calls-to-action, `secondary`/`ghost` elsewhere. Badges: `brand`/`success`/`warning`/`danger`/`info`/`neutral`. Always design with Khmer text alongside English — real Khmer strings, not lorem.
