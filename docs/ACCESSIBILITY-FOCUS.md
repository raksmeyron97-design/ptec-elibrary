# Focus system

How keyboard focus is drawn across the whole site. One indicator per component,
keyboard-weighted, built from tokens.

Source of truth: the `FOCUS SYSTEM` block in `app/globals.css`.
Pinned by `lib/focus-system.test.ts` (the CSS contract) and
`e2e/focus-system.spec.ts` (what the browser actually computes).

---

## The bug this replaced

`app/globals.css` declared its `:focus-visible` fallback **unlayered**:

```css
:where(a, button, input, …):focus-visible { outline: 2px solid var(--ptec-focus-ring); outline-offset: 2px }
```

An unlayered normal declaration beats *everything* in Tailwind v4's
`@layer utilities`. So every `outline-none` and `focus-visible:outline-none` in
the app — 500+ of them — was silently inert, and:

- any control that painted its own `focus-visible:ring-*` **also** got this 2px
  outline at 2px offset: two indicators, one control;
- a search shell showed a pale ring on the wrapper **plus** a hard blue
  rectangle hugging the inner input, offset inside the rounded shell.

A `.focus-shell { outline: none }` patch had been added for one toolbar. That
treated the symptom on one component; the cascade was the cause.

**The fix** is one line of structure: the fallback now lives in `@layer base`,
which is the documented Tailwind contract and what all 500 call sites already
assumed. Utilities win again, so `outline-none` genuinely removes the outline.

> **Consequence to respect:** `outline-none` now really does remove the
> indicator. Any element carrying it must either supply its own, sit inside a
> `.focus-shell`, or be a non-visible focus target (a dialog panel, a skip-link
> landmark).

---

## Tokens

Defined on `:root`, theme-aware through `--ptec-focus-ring` / `--ptec-focus-halo`.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--focus-color` | `#3A5FC4` | `#8AA4E4` | Outline colour on the base fallback |
| `--focus-border-color` | `#3A5FC4` | `#8AA4E4` | Field border on keyboard focus |
| `--focus-border-color-soft` | `#D6DAE0` | `#3B4560` | Field border on pointer focus |
| `--focus-ring-color` | `rgba(58,95,196,.16)` | `rgba(138,164,228,.22)` | Halo tint |
| `--focus-ring-width` | `2px` | `2px` | Outline + halo width |
| `--focus-ring-offset` | `2px` | `2px` | Outline offset |
| `--focus-ring-shadow` | `0 0 0 2px <halo>` | ← | Composed halo |
| `--focus-transition-duration` | `150ms` | ← | Border/shadow transition |

The halo tint is pre-flattened rather than expressed as an alpha: a translucent
box-shadow over a book cover or a tinted hero picks up whatever is underneath
and stops reading as one consistent indicator.

Point a component at different colours by overriding the tokens, never by
writing new focus utilities:

```tsx
// AskWidget sits on a navy panel where brand blue has no contrast.
<div className="focus-shell [--focus-border-color:var(--color-gold-400)] [--focus-ring-color:rgba(228,187,48,0.22)]">
```

---

## The three primitives

### 1. Base fallback — anything focusable

Nothing to write. `@layer base` gives every `a`/`button`/`input`/`select`/
`textarea`/`summary`/`[tabindex]` a 2px `--focus-color` outline at 2px offset.
An outline follows the element's own border-radius and survives forced-colors
mode, which a `ring` does not — which is why `components/ui/core/Button.tsx`
declares no focus styling at all.

### 2. `.focus-field` — a standalone control

The control owns its own boundary. Pointer focus shifts the border; keyboard
focus gives the brand border plus one soft 2px halo.

```tsx
<input className="focus-field h-11 w-full rounded-xl border border-divider bg-bg-surface px-4" />
```

### 3. `.focus-shell` — a grouped control

A search shell, a tag input, an editor with a toolbar: several elements inside
one visual boundary. The **wrapper** owns the whole focus response and nothing
inside it draws its own.

```tsx
<div className="focus-shell flex items-center gap-2 rounded-xl border border-divider bg-bg-surface px-3.5 py-2.5 shadow-sm hover:border-border-strong">
  <Search aria-hidden="true" />
  <input className="w-full border-none bg-transparent outline-none" />
  <button className="… focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">×</button>
</div>
```

The trigger is `:has(:is(input, textarea, select, [contenteditable]):focus-visible)`,
**not** `focus-within`. Two reasons:

- `focus-within` fires on mouse click, so a click painted the same heavy ring as
  a Tab press;
- nested buttons are excluded from the trigger, so a focused clear button keeps
  its own compact ring and the wrapper stays quiet — still exactly one
  indicator either way.

#### Halo shape modifiers

An outset halo is clipped by an ancestor `overflow-hidden`, which reads as a
broken rectangle. Both modifiers retarget `--focus-ring-shadow` only, so they
compose with `.focus-shell` or `.focus-field`:

- `.focus-underline` — a crisp 2px brand underline inside the clip. For a row
  flush against a clipped panel (command palettes, dialog headers).
- `.focus-inset` — the indicator sits just inside the element's own edge. For
  something already framed by a gradient ring or a card tile.

---

## Layering, which is load-bearing

| What | Where | Why |
|---|---|---|
| `:root` tokens | unlayered | Custom properties; inheritance, not cascade conflict |
| `:focus-visible` fallback | `@layer base` | So `outline-none` and `focus-visible:*` utilities can override it — the fix |
| `.focus-shell` / `.focus-field` **transition** | `@layer components` | Cosmetic; a call site's own `transition-*` should win |
| `.focus-underline` / `.focus-inset` | `@layer components` | Token modifiers; overridable |
| `.focus-shell` / `.focus-field` **states** | **unlayered** | See below |
| `forced-colors` / `prefers-reduced-motion` | unlayered | Must beat everything |

The state rules have to be unlayered. A shell already carries `border-divider`
and `shadow-sm`, and those are utilities. Inside `@layer components` the focus
rules lost to them and the shell computed to its resting border and resting
shadow — it looked identical focused and unfocused. Verified in the browser
before the rules were moved out.

Token overrides at call sites are unaffected: a custom property declared on the
element always beats the one inherited from `:root`, whatever layer each sits in.

---

## Input modality

`:focus-visible` cannot separate a click from a Tab on a **text field** — the
spec has browsers always match it there, because a clicked field still takes
keyboard input. So mouse and keyboard rendered identically.

`THEME_INIT_SCRIPT` (`lib/csp.ts`) sets `data-focus-modality` on `<html>` from
`pointerdown` / traversal keydowns. It lives in the single pre-paint inline
script, not a hydrated component: an effect-based flag would flash the keyboard
treatment on the first click of every page load. Only `Tab`, `Escape` and arrow
keys promote to `keyboard`, so typing into an already-clicked field does not
summon the halo.

The CSS reads it as `:root:not([data-focus-modality="pointer"])`, never
`[… = "keyboard"]`. That fails **safe**: with the attribute absent — JS off, or
before the first interaction — the halo still shows.

It also disarms ~150 legacy fields that ring on plain `:focus`:

```css
:root[data-focus-modality="pointer"] :is(input, textarea, select):focus {
  --tw-ring-shadow: 0 0 #0000;
  --tw-ring-offset-shadow: 0 0 #0000;
}
```

One rule instead of ~150 call-site edits. Their `focus:border-*` change
survives as the click affordance; the ring returns the moment the user reaches
for Tab. Buttons are untouched — a button already does not match
`:focus-visible` on click.

---

## Forced colors and reduced motion

Forced-colors mode **drops box-shadow entirely**, so a halo cannot be the
indicator there. The `@media (forced-colors: active)` block replaces it with a
real `CanvasText` outline on the shell and suppresses the (now invisible) halo,
so the two can never both render — and the inner control still draws nothing.

`prefers-reduced-motion` removes the focus transition. Focus must appear
immediately; it is never faded in.

---

## Adding a component

1. A single control → `.focus-field`. A group inside one boundary →
   `.focus-shell` on the wrapper, `outline-none` on the inner control.
2. Anything else focusable → write nothing; the base fallback covers it.
3. Different colours → override the tokens, never write new focus utilities.
4. Clipped by an ancestor → add `.focus-underline` or `.focus-inset`.
5. Never pair `.focus-shell` with `focus-within:ring-*` on the same element —
   `lib/focus-system.test.ts` fails the build if you do.

## Known limitations

- **Cloudflare Turnstile** injects its own focusable `div`s on `/auth/signup`,
  `/auth/forgot-password` and `/admin/login`. They are inside `#cf-turnstile`
  and cannot be styled from here; the e2e probe skips them.
- **`<iframe>`** is not in the base fallback selector and browsers do not paint
  a focus ring on the frame itself. Focus is delegated inward, so the embedded
  document's own indicator applies.
