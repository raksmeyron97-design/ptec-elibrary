import { test, expect, type Page } from '@playwright/test';

// Focus-system regression gate.
//
// The bug: app/globals.css declared its `:focus-visible` fallback UNLAYERED, so
// it beat everything in Tailwind v4's `@layer utilities`. Every `outline-none`
// and `focus-visible:outline-none` in the app was silently inert, which meant
// any control painting its own ring ALSO got the global outline, and a search
// shell showed a ring on the wrapper plus a blue rectangle hugging the inner
// input. The unit test (lib/focus-system.test.ts) pins the CSS; this pins what
// the browser actually computes, which is the only place a cascade bug shows.
//
// The contract asserted here, per keyboard tab stop:
//   • exactly ONE surface changes appearance on focus — never two, never zero
//   • an inner control of a `.focus-shell` never draws its own indicator
//   • a pointer click gets the border shift but not the halo

test.use({ contextOptions: { reducedMotion: 'reduce' } });

/**
 * For the focused element, diff its computed style (and its nearest focus
 * container's) against the unfocused state, and report which surfaces changed.
 */
const PROBE = () => {
  const snap = (el: Element | null) => {
    if (!el) return null;
    const c = getComputedStyle(el);
    return [c.outlineStyle, c.outlineWidth, c.outlineColor, c.boxShadow, c.borderColor, c.backgroundColor].join('|');
  };
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body || el.tagName === 'IFRAME') return null;
  // Cloudflare Turnstile injects its own untouchable focusable divs.
  if (el.closest('#cf-turnstile')) return null;
  const container = el.closest('.focus-shell, .focus-field');
  const before = { el: snap(el), box: container && container !== el ? snap(container) : null };
  el.blur();
  const after = { el: snap(el), box: container && container !== el ? snap(container) : null };
  el.focus({ preventScroll: true });
  // Listing pages re-render cards while we walk them. A node React swapped out
  // mid-probe measures as "nothing changed" no matter what it renders, so drop
  // the sample rather than report a phantom missing indicator.
  if (!el.isConnected || document.activeElement !== el) return null;
  const changed: string[] = [];
  if (before.el !== after.el) changed.push('self');
  if (before.box && before.box !== after.box) changed.push('container');
  return {
    tag: el.tagName,
    label: (el.getAttribute('aria-label') || (el as HTMLInputElement).placeholder || el.innerText || '')
      .replace(/\s+/g, ' ')
      .slice(0, 40),
    changed,
  };
};

async function auditTabOrder(page: Page, stops = 45) {
  // The probe diffs computed style focused vs blurred within one task. Many
  // controls carry `transition-all`, and a transitioning property still reports
  // its OLD value for a frame after blur — which reads as "nothing changed" on
  // a control that is in fact indicating correctly. Freezing transitions makes
  // the diff measure the target state instead of the animation.
  await page.addStyleTag({
    content: '*, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; }',
  });
  const rows: NonNullable<ReturnType<typeof PROBE>>[] = [];
  await page.keyboard.press('Tab');
  for (let i = 0; i < stops; i++) {
    const row = await page.evaluate(PROBE).catch(() => null);
    if (row) rows.push(row);
    await page.keyboard.press('Tab').catch(() => {});
  }
  return rows;
}

const ROUTES = ['/', '/books', '/posts', '/theses', '/publications', '/search', '/km', '/km/books'];

test.describe('Focus system', () => {
  for (const route of ROUTES) {
    test(`every tab stop on ${route} has exactly one focus indicator`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      const rows = await auditTabOrder(page);
      expect(rows.length).toBeGreaterThan(5);

      // Two surfaces changing is the double-border defect this suite exists for.
      expect(rows.filter((r) => r.changed.length > 1)).toEqual([]);
      // Zero is worse: a keyboard user cannot see where they are (WCAG 2.4.7).
      expect(rows.filter((r) => r.changed.length === 0)).toEqual([]);
    });
  }

  test('a search shell owns the indicator; its input draws nothing', async ({ page }) => {
    await page.goto('/posts');
    const shell = page.locator('.focus-shell').first();
    await expect(shell).toBeVisible();
    const input = shell.locator('input').first();

    await input.focus();
    // :has() invalidation is not synchronous in Chromium — let style settle.
    await page.waitForTimeout(200);

    const state = await shell.evaluate((el) => {
      const inner = el.querySelector('input, textarea, select')!;
      return {
        shellBorder: getComputedStyle(el).borderTopColor,
        shellShadow: getComputedStyle(el).boxShadow,
        innerOutline: getComputedStyle(inner).outlineStyle,
        innerShadow: getComputedStyle(inner).boxShadow,
      };
    });

    // The wrapper carries a 2px halo…
    expect(state.shellShadow).toMatch(/0px 0px 0px 2px/);
    // …and the input inside it carries nothing at all.
    expect(state.innerOutline).toBe('none');
    expect(state.innerShadow).toBe('none');
  });

  test('a pointer click gets the border shift but not the keyboard halo', async ({ page }) => {
    await page.goto('/posts');
    const shell = page.locator('.focus-shell').first();
    await expect(shell).toBeVisible();

    await shell.locator('input').first().click();
    await page.waitForTimeout(200);
    const pointer = await shell.evaluate((el) => ({
      modality: document.documentElement.dataset.focusModality,
      shadow: getComputedStyle(el).boxShadow,
      border: getComputedStyle(el).borderTopColor,
    }));
    expect(pointer.modality).toBe('pointer');
    expect(pointer.shadow).not.toMatch(/0px 0px 0px 2px/);

    // Same element, reached by keyboard: now the halo appears.
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.keyboard.press('Tab');
    await shell.locator('input').first().focus();
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(200);
    const keyboard = await shell.evaluate((el) => ({
      modality: document.documentElement.dataset.focusModality,
      shadow: getComputedStyle(el).boxShadow,
      border: getComputedStyle(el).borderTopColor,
    }));
    expect(keyboard.modality).toBe('keyboard');
    expect(keyboard.shadow).toMatch(/0px 0px 0px 2px/);
    // The brand border is the constant across both, so focus is never invisible.
    expect(keyboard.border).toBe(pointer.border);
  });

  test('the focus halo survives forced-colors mode as a real outline', async ({ browser }) => {
    const ctx = await browser.newContext({ forcedColors: 'active', reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('/posts');
    const shell = page.locator('.focus-shell').first();
    await shell.locator('input').first().focus();
    await page.waitForTimeout(200);

    const state = await shell.evaluate((el) => ({
      // forced-colors drops box-shadow entirely, so the halo cannot be the
      // indicator there — a system-colour outline has to take over.
      outlineStyle: getComputedStyle(el).outlineStyle,
      outlineWidth: getComputedStyle(el).outlineWidth,
      innerOutline: getComputedStyle(el.querySelector('input')!).outlineStyle,
    }));
    expect(state.outlineStyle).toBe('solid');
    expect(state.outlineWidth).toBe('2px');
    // Still exactly one indicator: the inner input stays bare.
    expect(state.innerOutline).toBe('none');
    await ctx.close();
  });
});
