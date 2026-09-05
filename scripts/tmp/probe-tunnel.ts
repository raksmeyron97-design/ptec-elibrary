import { chromium } from "@playwright/test";
import { makeLargeTestPdf } from "../../e2e/utils/pdf";
import { startPdfServer } from "../../e2e/utils/pdf-server";
import { installSeededReaderSession } from "../../e2e/utils/auth";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const pdf = makeLargeTestPdf({ pages: 200, bytesPerPage: 512 * 1024, label: "outage" });
  const server = await startPdfServer(pdf);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: "http://localhost:3100" });
  const page = await ctx.newPage();
  const beacons: unknown[] = [];
  page.on("console", (m) => { if (/error|fail|warn/i.test(m.text())) console.log("[console]", m.text().slice(0, 160)); });
  page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 160)));
  await page.route("**/api/reader-events", async (r) => { try { beacons.push(JSON.parse(r.request().postData() ?? "{}")); } catch {} await r.fulfill({ status: 204 }); });
  await installSeededReaderSession(page, { email: "student@ptec.local", origin: "http://localhost:3100" });
  await page.route("**/api/books/*/file*", (r) => r.continue({ url: server.url }));
  await page.goto("/books/foundations-of-education/read");
  await page.locator(".react-pdf__Page canvas").first().waitFor({ timeout: 60000 });
  const state = async (label: string) => {
    const s = await page.evaluate(() => ({
      pages: Array.from(document.querySelectorAll("[data-page]")).map((e) => e.getAttribute("data-page")).join(","),
      canvases: Array.from(document.querySelectorAll("[data-page] canvas")).map((c) => `${c.parentElement?.parentElement?.getAttribute("data-page")}:${(c as HTMLCanvasElement).style.visibility || "visible"}`).join(" "),
      badge: document.querySelector('[data-reader-hud="top"] [role="status"]')?.textContent ?? null,
      indicator: document.querySelector('[data-reader-hud] button[aria-label^="Page "]')?.getAttribute("aria-label"),
    }));
    console.log(`[${label}]`, JSON.stringify(s));
  };
  await page.keyboard.press("Shift");
  await page.evaluate(() => (document.querySelector('[data-reader-hud] button[aria-label^="Page "]') as HTMLElement)?.click());
  await page.getByRole("dialog", { name: /go to page/i }).getByRole("textbox").fill("5");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(3000);
  await state("on 5");
  await page.route("**/api/books/*/file*", (r) => r.abort("failed"));
  await page.keyboard.press("Shift");
  await page.evaluate(() => (document.querySelector('[data-reader-hud] button[aria-label^="Page "]') as HTMLElement)?.click());
  await page.getByRole("dialog", { name: /go to page/i }).getByRole("textbox").fill("150");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(6000);
  await state("file dead, on 150");
  await page.unroute("**/api/books/*/file*");
  await page.route("**/api/books/*/file*", (r) => r.continue({ url: server.url }));
  for (const t of [3000, 5000, 10000, 15000]) { await wait(t); await state(`recovering +${t}`); }
  console.log("beacons", JSON.stringify(beacons.map((b: any) => ({ t: b.type, k: b.kind, p: b.page, r: b.reloaded }))));
  console.log("server: ranges", server.rangeRequests().length, "MB", (server.totalBytes()/1048576).toFixed(1));
  await browser.close();
  await server.close();
})();
