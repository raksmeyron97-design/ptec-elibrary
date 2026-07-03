#!/usr/bin/env node
/**
 * driver.mjs — headless Playwright driver for e-library-ptec
 *
 * Usage:
 *   node .claude/skills/run-e-library-ptec/driver.mjs [command] [args]
 *
 * Commands:
 *   screenshot [path] [url]   - Take a screenshot of a page (default: /)
 *   smoke                     - Run a smoke test across key pages
 *   check-errors [url]        - Check for console errors on a page
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SHOTS_DIR = '/tmp/ptec-shots';

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function withPage(fn) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  try {
    const result = await fn(page, errors);
    return result;
  } finally {
    await browser.close();
  }
}

async function screenshot(url = '/', outputPath) {
  await ensureDir(SHOTS_DIR);
  const slug = url.replace(/\//g, '_').replace(/^_/, '') || 'home';
  const dest = outputPath || `${SHOTS_DIR}/${slug}.png`;
  await withPage(async (page, errors) => {
    await page.goto(`${BASE_URL}${url}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Extra wait for JS-heavy pages (React hydration)
    await page.waitForTimeout(1500);
    await page.screenshot({ path: dest, fullPage: false });
    console.log(`Screenshot saved: ${dest}`);
    if (errors.length > 0) {
      console.warn('Console errors:', errors.join('\n'));
    }
  });
  return dest;
}

async function smoke() {
  const routes = [
    '/',
    '/books',
    '/catalogs',
    '/posts',
    '/theses',
  ];

  console.log(`Running smoke test against ${BASE_URL}`);
  await ensureDir(SHOTS_DIR);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const results = [];

  for (const route of routes) {
    const page = await context.newPage();
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    try {
      const res = await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);
      const status = res?.status() || 0;
      const slug = route.replace(/\//g, '_').replace(/^_/, '') || 'home';
      const shotPath = `${SHOTS_DIR}/${slug}.png`;
      await page.screenshot({ path: shotPath });
      results.push({ route, status, errors, shot: shotPath, ok: status < 400 });
      console.log(`[${status}] ${route} → ${shotPath}${errors.length ? ` (${errors.length} errors)` : ''}`);
    } catch (err) {
      results.push({ route, status: 0, errors: [err.message], shot: null, ok: false });
      console.error(`[FAIL] ${route}: ${err.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();

  const failed = results.filter(r => !r.ok);
  if (failed.length > 0) {
    console.error(`\n${failed.length} route(s) failed.`);
    process.exit(1);
  } else {
    console.log(`\nAll ${results.length} routes OK. Screenshots in ${SHOTS_DIR}/`);
  }
}

async function checkErrors(url = '/') {
  const errors = [];
  await withPage(async (page, errs) => {
    await page.goto(`${BASE_URL}${url}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    errors.push(...errs);
  });
  if (errors.length > 0) {
    console.error('Console errors found:');
    errors.forEach(e => console.error(' -', e));
    process.exit(1);
  } else {
    console.log('No console errors.');
  }
}

const [,, cmd, ...args] = process.argv;
switch (cmd) {
  case 'screenshot':
    await screenshot(args[0] || '/', args[1]);
    break;
  case 'smoke':
    await smoke();
    break;
  case 'check-errors':
    await checkErrors(args[0] || '/');
    break;
  default:
    // default: smoke test
    await smoke();
}
