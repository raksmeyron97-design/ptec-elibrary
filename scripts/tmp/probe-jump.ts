import { chromium, devices } from "@playwright/test";
import { makeLargeTestPdf } from "../../e2e/utils/pdf";
import { startPdfServer } from "../../e2e/utils/pdf-server";
import { installSeededReaderSession } from "../../e2e/utils/auth";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

(async () => {
  const pdf = makeLargeTestPdf({ pages: 500, bytesPerPage: 8 * 1024, label: "jump" });
  const server = await startPdfServer(pdf);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["Pixel 5"], baseURL: "http://localhost:3100" });
  const page = await ctx.newPage();
  await page.addInitScript(`try { for (const k of Object.keys(localStorage)) if (k.startsWith("ebook:")) localStorage.removeItem(k); } catch {}`);
  await installSeededReaderSession(page, { email: "staff@ptec.local", origin: "http://localhost:3100" });
  await page.route("**/api/books/*/file*", (r) => r.continue({ url: server.url }));
  await page.goto("/books/foundations-of-education/read");
  await page.locator(".react-pdf__Page canvas").first().waitFor({ timeout: 60000 });
  await page.keyboard.press("Escape");
  const geom = () => page.evaluate(() => {
    const el = document.querySelector(".reader-viewport") as HTMLElement;
    const row = document.querySelector("[data-page]") as HTMLElement;
    return { top: el.scrollTop, h: el.scrollHeight, c: el.clientHeight, rowH: row?.getBoundingClientRect().height,
      first: document.querySelector("[data-page]")?.getAttribute("data-page"),
      ind: document.querySelector('[data-reader-hud] button[aria-label^="Page "]')?.getAttribute("aria-label") };
  });
  for (const target of [200, 431, 100]) {
    await page.keyboard.press("Shift");
    await page.evaluate(() => (document.querySelector('[data-reader-hud] button[aria-label^="Page "]') as HTMLElement)?.click());
    await page.getByRole("dialog", { name: /go to page/i }).getByRole("textbox").fill(String(target));
    await page.keyboard.press("Enter");
    for (const t of [300, 1200, 3000]) {
      await new Promise((r) => setTimeout(r, t));
      const g = await geom();
      const expectedTop = 52 + (target - 1) * (g.rowH ?? 0);
      console.log(`target ${target} @+${t}ms: top=${Math.round(g.top)} expected≈${Math.round(expectedTop)} delta=${Math.round(g.top - expectedTop)} rowH=${g.rowH?.toFixed(1)} ind=${g.ind}`);
    }
  }
  await browser.close();
  await server.close();
})();
