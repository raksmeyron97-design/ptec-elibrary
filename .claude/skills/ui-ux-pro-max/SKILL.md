---
name: ui-ux-pro-max
description: "UI/UX design intelligence. 67 styles, 96 palettes, 56 font pairings, 100 icons, 25 charts, 13 stacks (React, Next.js, Vue, Nuxt, Svelte, Astro, SwiftUI, React Native, Flutter, Jetpack Compose, Tailwind, shadcn/ui). Actions: plan, build, create, design, implement, review, fix, improve, optimize, enhance, refactor, check UI/UX code. Projects: website, landing page, dashboard, admin panel, e-commerce, SaaS, portfolio, blog, mobile app, .html, .tsx, .vue, .svelte. Elements: button, modal, navbar, sidebar, card, table, form, chart, icon. Styles: glassmorphism, claymorphism, minimalism, brutalism, neumorphism, bento grid, dark mode, responsive, skeuomorphism, flat design. Topics: color palette, accessibility, animation, layout, typography, font pairing, spacing, hover, shadow, gradient."
---

# UI/UX Pro Max - Design Intelligence

Comprehensive design guide for web and mobile applications: 67 styles, 96 color palettes, 56 font pairings, 98 UX guidelines, 100 icon mappings, and 25 chart types across 13 technology stacks, searchable via a local BM25 CLI with priority-based recommendations.

## Running the CLI

All commands below use `$SKILL_DIR` to mean this skill's base directory (shown when the skill is invoked, e.g. `.claude/skills/ui-ux-pro-max` or `~/.claude/skills/ui-ux-pro-max`). Substitute the real path — the scripts are not on `PATH`, and relative paths only work from the project root.

```bash
python3 "$SKILL_DIR/scripts/search.py" "<query>" [--domain <domain>] [--stack <stack>] [-n <max>] [--json]
```

The scripts use only the Python standard library — no installs needed. If `python3 --version` fails, ask the user to install Python 3 before continuing.

## Workflow

When the user requests UI/UX work (design, build, review, fix, improve), follow these steps:

### Step 0: Respect the Existing Design System

If you are working inside an existing codebase (not a greenfield page), first discover what design decisions already exist, and treat the searchable database as advisory — never impose a new palette or font on an app that already has one:

- Check for a persisted `design-system/MASTER.md` (and `design-system/pages/<page>.md`) from a previous session — if present, it is the source of truth; skip Step 1–2 and go to Step 3.
- Otherwise read the project's theme sources: Tailwind config / CSS variables, font loading (e.g. `app/fonts.ts`, `@font-face`), dark-mode mechanism, existing component patterns.
- Constraints found there override database recommendations. Two that are easy to miss:
  - **Language coverage**: font pairings in the database are Latin-centric. If the product is multilingual (CJK, Khmer, Arabic, Thai…), keep or pair with fonts that cover those scripts.
  - **Dark mode**: palettes in the `color` domain are light-mode palettes. If the app has a dark mode, derive dark variants and verify contrast in both modes.

### Step 1: Analyze User Requirements

Extract from the request:
- **Product type**: SaaS, e-commerce, portfolio, dashboard, landing page, etc.
- **Style keywords**: minimal, playful, professional, elegant, dark mode, etc.
- **Industry**: healthcare, fintech, gaming, education, etc.
- **Stack**: React, Vue, Next.js, or default to `html-tailwind`
- **Scope**: whole page/site vs. a single component. For a small component fix or code review, skip Step 2 and go straight to targeted domain/stack searches (Step 3–4) — generating a full design system for a button tweak is noise.

### Step 2: Generate Design System (new pages/projects)

Start page- or project-level design work with `--design-system` to get a coherent, reasoned recommendation:

```bash
python3 "$SKILL_DIR/scripts/search.py" "<product_type> <industry> <keywords>" --design-system [-p "Project Name"]
```

This searches 5 domains (product, style, color, landing, typography), applies reasoning rules from `ui-reasoning.csv`, and returns a complete design system — pattern, style, colors, typography, effects, and anti-patterns to avoid.

**Example:**
```bash
python3 "$SKILL_DIR/scripts/search.py" "beauty spa wellness service" --design-system -p "Serenity Spa"
```

### Step 2b: Persist Design System (Master + Overrides Pattern)

To save the design system for retrieval across sessions, add `--persist` (writes to the current directory unless `-o <dir>` is given):

```bash
python3 "$SKILL_DIR/scripts/search.py" "<query>" --design-system --persist -p "Project Name" [--page "dashboard"] [-o <dir>]
```

This creates:
- `design-system/MASTER.md` — global source of truth with all design rules
- `design-system/pages/` — folder for page-specific overrides (`--page` adds e.g. `pages/dashboard.md`)

**Hierarchical retrieval:** when building a specific page, check `design-system/pages/<page>.md` first; its rules **override** MASTER.md. If absent, use MASTER.md exclusively.

### Step 3: Supplement with Detailed Searches (as needed)

```bash
python3 "$SKILL_DIR/scripts/search.py" "<keywords>" --domain <domain> [-n <max_results>]
```

If `--domain` is omitted, the CLI auto-detects the domain from query keywords — fine for exploratory searches; pass it explicitly when you know what you need.

| Need | Domain | Example |
|------|--------|---------|
| More style options | `style` | `--domain style "glassmorphism dark"` |
| Chart recommendations | `chart` | `--domain chart "real-time dashboard"` |
| UX best practices | `ux` | `--domain ux "animation accessibility"` |
| Alternative fonts | `typography` | `--domain typography "elegant luxury"` |
| Landing structure | `landing` | `--domain landing "hero social-proof"` |
| Icon choices | `icons` | `--domain icons "settings navigation"` |

### Step 4: Stack Guidelines

Get implementation-specific best practices. If the user doesn't specify a stack, **default to `html-tailwind`**:

```bash
python3 "$SKILL_DIR/scripts/search.py" "<keywords>" --stack html-tailwind
```

**Then:** synthesize the design system + detailed searches and implement the design. Before delivering, run through the Pre-Delivery Checklist at the end of this file.

---

## Search Reference

### Available Domains (`--domain`)

| Domain | Use For | Example Keywords |
|--------|---------|------------------|
| `product` | Product type recommendations | SaaS, e-commerce, portfolio, healthcare, beauty, service |
| `style` | UI styles, colors, effects, CSS/AI prompt keywords | glassmorphism, minimalism, dark mode, brutalism |
| `typography` | Font pairings, Google Fonts | elegant, playful, professional, modern |
| `color` | Color palettes by product type | saas, ecommerce, healthcare, beauty, fintech, service |
| `landing` | Page structure, CTA strategies | hero, hero-centric, testimonial, pricing, social-proof |
| `chart` | Chart types, library recommendations | trend, comparison, timeline, funnel, pie |
| `ux` | Best practices, anti-patterns | animation, accessibility, z-index, loading |
| `icons` | Icon names + Lucide imports | menu, settings, arrow, search, notification |
| `react` | React/Next.js performance | waterfall, bundle, suspense, memo, rerender, cache |
| `web` | Web interface guidelines | aria, focus, keyboard, semantic, virtualize |

### Available Stacks (`--stack`)

| Stack | Focus |
|-------|-------|
| `html-tailwind` | Tailwind utilities, responsive, a11y (DEFAULT) |
| `react` | State, hooks, performance, patterns |
| `nextjs` | SSR, routing, images, API routes |
| `astro` | Islands, content collections, partial hydration |
| `vue` | Composition API, Pinia, Vue Router |
| `nuxtjs` | Nuxt conventions, SSR, modules |
| `nuxt-ui` | Nuxt UI components and theming |
| `svelte` | Runes, stores, SvelteKit |
| `swiftui` | Views, State, Navigation, Animation |
| `react-native` | Components, Navigation, Lists |
| `flutter` | Widgets, State, Layout, Theming |
| `shadcn` | shadcn/ui components, theming, forms, patterns |
| `jetpack-compose` | Composables, Modifiers, State Hoisting, Recomposition |

### Output Formats

```bash
# ASCII box (default) - best for terminal display
python3 "$SKILL_DIR/scripts/search.py" "fintech crypto" --design-system

# Markdown - best for documentation / persisted files
python3 "$SKILL_DIR/scripts/search.py" "fintech crypto" --design-system -f markdown

# JSON - for programmatic use of domain/stack searches
python3 "$SKILL_DIR/scripts/search.py" "hero cta" --domain landing --json
```

---

## Example Workflow

**User request:** "Làm landing page cho dịch vụ chăm sóc da chuyên nghiệp" (build a landing page for a professional skincare service)

1. **Analyze**: Beauty/Spa service · elegant, professional, soft · html-tailwind (default) · whole-page scope → design system needed.
2. **Generate design system**:
   ```bash
   python3 "$SKILL_DIR/scripts/search.py" "beauty spa wellness service elegant" --design-system -p "Serenity Spa"
   ```
3. **Supplement**:
   ```bash
   python3 "$SKILL_DIR/scripts/search.py" "animation accessibility" --domain ux
   python3 "$SKILL_DIR/scripts/search.py" "elegant luxury serif" --domain typography
   ```
4. **Stack guidelines**:
   ```bash
   python3 "$SKILL_DIR/scripts/search.py" "layout responsive form" --stack html-tailwind
   ```
5. Synthesize and implement; verify against the Pre-Delivery Checklist.

## Tips for Better Results

1. **Be specific with keywords** - "healthcare SaaS dashboard" > "app"
2. **Search multiple times** - Different keywords reveal different insights
3. **Combine domains** - Style + Typography + Color = Complete design system
4. **Always check UX** - Search "animation", "z-index", "accessibility" for common issues
5. **Use the stack flag** - Get implementation-specific best practices
6. **Iterate** - If the first search doesn't match, try different keywords

---

## Rule Categories by Priority

| Priority | Category | Impact | Domain |
|----------|----------|--------|--------|
| 1 | Accessibility | CRITICAL | `ux` |
| 2 | Touch & Interaction | CRITICAL | `ux` |
| 3 | Performance | HIGH | `ux` |
| 4 | Layout & Responsive | HIGH | `ux` |
| 5 | Typography & Color | MEDIUM | `typography`, `color` |
| 6 | Animation | MEDIUM | `ux` |
| 7 | Style Selection | MEDIUM | `style`, `product` |
| 8 | Charts & Data | LOW | `chart` |

### 1. Accessibility (CRITICAL)

- `color-contrast` - Minimum 4.5:1 ratio for normal text
- `focus-states` - Visible focus rings on interactive elements
- `alt-text` - Descriptive alt text for meaningful images
- `aria-labels` - aria-label for icon-only buttons
- `keyboard-nav` - Tab order matches visual order
- `form-labels` - Use label with for attribute

### 2. Touch & Interaction (CRITICAL)

- `touch-target-size` - Minimum 44x44px touch targets
- `hover-vs-tap` - Use click/tap for primary interactions
- `loading-buttons` - Disable button during async operations
- `error-feedback` - Clear error messages near problem
- `cursor-pointer` - Add cursor-pointer to clickable elements

### 3. Performance (HIGH)

- `image-optimization` - Use WebP, srcset, lazy loading
- `reduced-motion` - Check prefers-reduced-motion
- `content-jumping` - Reserve space for async content

### 4. Layout & Responsive (HIGH)

- `viewport-meta` - width=device-width initial-scale=1
- `readable-font-size` - Minimum 16px body text on mobile
- `horizontal-scroll` - Ensure content fits viewport width
- `z-index-management` - Define z-index scale (10, 20, 30, 50)

### 5. Typography & Color (MEDIUM)

- `line-height` - Use 1.5-1.75 for body text
- `line-length` - Limit to 65-75 characters per line
- `font-pairing` - Match heading/body font personalities

### 6. Animation (MEDIUM)

- `duration-timing` - Use 150-300ms for micro-interactions
- `transform-performance` - Use transform/opacity, not width/height
- `loading-states` - Skeleton screens or spinners

### 7. Style Selection (MEDIUM)

- `style-match` - Match style to product type
- `consistency` - Use same style across all pages
- `no-emoji-icons` - Use SVG icons, not emojis

### 8. Charts & Data (LOW)

- `chart-type` - Match chart type to data type
- `color-guidance` - Use accessible color palettes
- `data-table` - Provide table alternative for accessibility

---

## Common Rules for Professional UI

These are frequently overlooked issues that make UI look unprofessional:

### Icons & Visual Elements

| Rule | Do | Don't |
|------|----|----- |
| **No emoji icons** | Use SVG icons (Heroicons, Lucide, Simple Icons) | Use emojis like 🎨 🚀 ⚙️ as UI icons |
| **Stable hover states** | Use color/opacity transitions on hover | Use scale transforms that shift layout |
| **Correct brand logos** | Research official SVG from Simple Icons | Guess or use incorrect logo paths |
| **Consistent icon sizing** | Use fixed viewBox (24x24) with w-6 h-6 | Mix different icon sizes randomly |

### Interaction & Cursor

| Rule | Do | Don't |
|------|----|----- |
| **Cursor pointer** | Add `cursor-pointer` to all clickable/hoverable cards | Leave default cursor on interactive elements |
| **Hover feedback** | Provide visual feedback (color, shadow, border) | No indication element is interactive |
| **Smooth transitions** | Use `transition-colors duration-200` | Instant state changes or too slow (>500ms) |

### Light/Dark Mode Contrast

| Rule | Do | Don't |
|------|----|----- |
| **Glass card light mode** | Use `bg-white/80` or higher opacity | Use `bg-white/10` (too transparent) |
| **Text contrast light** | Use `#0F172A` (slate-900) for text | Use `#94A3B8` (slate-400) for body text |
| **Muted text light** | Use `#475569` (slate-600) minimum | Use gray-400 or lighter |
| **Border visibility** | Use `border-gray-200` in light mode | Use `border-white/10` (invisible) |

### Layout & Spacing

| Rule | Do | Don't |
|------|----|----- |
| **Floating navbar** | Add `top-4 left-4 right-4` spacing | Stick navbar to `top-0 left-0 right-0` |
| **Content padding** | Account for fixed navbar height | Let content hide behind fixed elements |
| **Consistent max-width** | Use same `max-w-6xl` or `max-w-7xl` | Mix different container widths |

---

## Pre-Delivery Checklist

Before delivering UI code, verify these items:

### Visual Quality
- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] Brand logos are correct (verified from Simple Icons)
- [ ] Hover states don't cause layout shift
- [ ] Use theme colors directly (bg-primary) not var() wrapper

### Interaction
- [ ] All clickable elements have `cursor-pointer`
- [ ] Hover states provide clear visual feedback
- [ ] Transitions are smooth (150-300ms)
- [ ] Focus states visible for keyboard navigation

### Light/Dark Mode
- [ ] Light mode text has sufficient contrast (4.5:1 minimum)
- [ ] Glass/transparent elements visible in light mode
- [ ] Borders visible in both modes
- [ ] Test both modes before delivery

### Layout
- [ ] Floating elements have proper spacing from edges
- [ ] No content hidden behind fixed navbars
- [ ] Responsive at 375px, 768px, 1024px, 1440px
- [ ] No horizontal scroll on mobile

### Accessibility
- [ ] All images have alt text
- [ ] Form inputs have labels
- [ ] Color is not the only indicator
- [ ] `prefers-reduced-motion` respected
