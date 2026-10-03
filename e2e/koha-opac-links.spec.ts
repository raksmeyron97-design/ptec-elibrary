import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Links from the Physical Library to the public Koha OPAC (lib/opac/links.ts):
 * the reader's library account, and each Koha record's own OPAC page.
 *
 * Seed (supabase/seed.sql): "Educational Statistics with Examples" carries
 * koha_biblio_id 1; "Teaching Practice Handbook" carries none.
 *
 * Koha itself is never contacted: every request to the OPAC is intercepted,
 * so these tests also say what happens when the OPAC does not answer — the
 * e-Library page a reader is on stays exactly as it was.
 */

const OPAC = "https://koha.ptec.edu.kh";
const ACCOUNT = `${OPAC}/cgi-bin/koha/opac-user.pl`;
const WITH_KOHA_ID = "/catalogs/educational-statistics-with-examples";
const WITHOUT_KOHA_ID = "/catalogs/teaching-practice-handbook";

async function stubOpac(page: Page, mode: "ok" | "down" = "ok") {
  await page.context().route(`${OPAC}/**`, (route) =>
    mode === "down"
      ? route.abort("connectionrefused")
      : route.fulfill({ status: 200, contentType: "text/html", body: "<title>Koha OPAC stub</title>" }),
  );
}

const accountIn = (page: Page) =>
  page.getByRole("main").getByRole("link", { name: /My Library Account/ });

test.describe("Physical Library → library account", () => {
  test("the landing view links to the account, as an external link", async ({ page }) => {
    await page.goto("/catalogs");
    await expect(page.getByText("Borrowing printed books?")).toBeVisible();
    const link = accountIn(page);
    await expect(link).toHaveAttribute("href", ACCOUNT);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(link).toHaveAccessibleName(/My Library Account.*Opens in a new tab/);
  });

  test("Khmer gets the same absolute address — never /km on the OPAC", async ({ page }) => {
    await page.goto("/km/catalogs");
    const link = page.getByRole("main").getByRole("link", { name: /គណនីបណ្ណាល័យរបស់ខ្ញុំ/ });
    await expect(link).toHaveAttribute("href", ACCOUNT);
    await expect(page.getByText(/ម៉ឺនុយរបស់វាជាភាសាអង់គ្លេស/)).toBeVisible();
  });

  test("a search or filter hides the strip; the footer still links to the account", async ({ page }) => {
    await page.goto("/catalogs?q=Teaching");
    await expect(page.getByText("Borrowing printed books?")).toHaveCount(0);
    // By address, not by role: below md the footer folds its link groups
    // behind "More links" (FooterMoreLinks), so the link is in the DOM but
    // hidden — and out of the accessibility tree — until that is opened.
    const footer = page.locator("footer");
    const footerLink = footer.locator(`a[href="${ACCOUNT}"]`);
    await expect(footerLink).toHaveCount(1);
    await expect(footerLink).toHaveAttribute("target", "_blank");
    await expect(footerLink).toHaveAttribute("rel", "noopener noreferrer");
    const more = footer.locator("details.footer-more summary");
    if (await more.isVisible()) await more.click();
    await expect(footerLink).toBeVisible();
    await expect(footerLink).toHaveAccessibleName(/My Library Account.*Opens in a new tab/);
  });

  test("the keyboard reaches the account link", async ({ page }) => {
    await page.goto("/catalogs");
    let reached = false;
    for (let i = 0; i < 60 && !reached; i++) {
      await page.keyboard.press("Tab");
      reached = await page.evaluate(
        (href) => (document.activeElement as HTMLAnchorElement | null)?.href === href,
        ACCOUNT,
      );
    }
    expect(reached).toBe(true);
  });

  test("it opens the OPAC in a new tab and leaves the catalogue where it was", async ({ page }) => {
    await stubOpac(page);
    await page.goto("/catalogs");
    const [popup] = await Promise.all([page.waitForEvent("popup"), accountIn(page).click()]);
    await expect(popup).toHaveURL(ACCOUNT);
    await expect(page).toHaveURL(/\/catalogs$/);
  });

  test("an OPAC that does not answer costs the e-Library nothing", async ({ page }) => {
    await stubOpac(page, "down");
    await page.goto("/catalogs");
    const [popup] = await Promise.all([page.waitForEvent("popup"), accountIn(page).click()]);
    await popup.waitForLoadState().catch(() => {});
    await expect(page.getByRole("heading", { level: 1, name: "Physical Library" })).toBeVisible();
    await expect(accountIn(page)).toBeVisible();
  });
});

test.describe("record page → its Koha record", () => {
  test("a record Koha knows links to /bib/<id>, nofollow, in a new tab", async ({ page }) => {
    await page.goto(WITH_KOHA_ID);
    const link = page.locator("#where").getByRole("link", { name: /View in the library catalogue/ });
    await expect(link).toHaveAttribute("href", `${OPAC}/bib/1`);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "nofollow noopener noreferrer");
    await expect(link).toHaveAccessibleName(/Opens in a new tab/);
  });

  test("a record without a Koha id gets no OPAC link at all", async ({ page }) => {
    await page.goto(WITHOUT_KOHA_ID);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("#where").getByRole("link", { name: /View in the library catalogue/ })).toHaveCount(0);
    await expect(page.locator(`#where a[href^="${OPAC}"]`)).toHaveCount(0);
  });

  test("the Khmer record page links to the same OPAC record", async ({ page }) => {
    await page.goto(`/km${WITH_KOHA_ID}`);
    const link = page.locator("#where").getByRole("link", { name: /មើលក្នុងកាតាឡុកបណ្ណាល័យ/ });
    await expect(link).toHaveAttribute("href", `${OPAC}/bib/1`);
  });

  test("passes axe (WCAG 2.1 A/AA)", async ({ page }) => {
    await page.goto(WITH_KOHA_ID);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});

test.describe("phone Explore sheet", () => {
  test("lists the library account beside the Physical Library, as external", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/catalogs");
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Explore" }).click();
    const sheet = page.getByRole("dialog", { name: "Browse the library" });
    await expect(sheet).toBeVisible();
    const link = sheet.getByRole("link", { name: /My Library Account/ });
    await expect(link).toHaveAttribute("href", ACCOUNT);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    // It sits right after the Physical Library row.
    const names = await sheet.getByRole("link").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(names[names.indexOf("/catalogs") + 1]).toBe(ACCOUNT);
    const box = await link.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});
