import { chromium } from "@playwright/test";
import { makeLargeTestPdf } from "../../e2e/utils/pdf";
import { startPdfServer } from "../../e2e/utils/pdf-server";
import { installSeededReaderSession } from "../../e2e/utils/auth";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

(async () => {
  const layout = (process.argv[2] as "clustered" | "interleaved") ?? "clustered";
  const pdf = makeLargeTestPdf({ pages: 20, bytesPerPage: 512 * 1024, label: "probe", layout });
  const server = await startPdfServer(pdf);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: "http://localhost:3100" });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    const t = m.text();
    if (/warn|xref|index|repair|missing|stream|range/i.test(t)) console.log("[console]", m.type(), t.slice(0, 200));
  });
  await installSeededReaderSession(page, { email: "student@ptec.local", origin: "http://localhost:3100" });
  await page.route("**/api/books/*/file*", (r) => r.continue({ url: server.url }));
  await page.goto("/books/foundations-of-education/read");
  await page.locator(".react-pdf__Page canvas").first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(5000);
  console.log(layout, "| requests", server.requests.length, "ranges", server.rangeRequests().length,
    "MB", (server.totalBytes() / 1048576).toFixed(1), "of", (pdf.length / 1048576).toFixed(1));
  const chunk = 512 * 1024;
  console.log("chunks:", server.rangeRequests().map((r) => Math.floor(Number(/bytes=(\d+)/.exec(r.range!)?.[1] ?? 0) / chunk)).join(","));
  console.log("full GET bytes pushed:", server.fullRequests().map((r) => `${(r.bytes / 1048576).toFixed(2)}MB ${r.aborted ? "aborted" : "complete"}`).join(","));
  console.log("mounted pages:", await page.$$eval("[data-page]", (els) => els.map((e) => e.getAttribute("data-page")).join(",")));
  await browser.close();
  await server.close();
})();
