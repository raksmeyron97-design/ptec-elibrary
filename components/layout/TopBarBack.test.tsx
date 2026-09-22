import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import enMessages from "@/messages/en.json";

const router = { back: vi.fn(), push: vi.fn() };
let pathname = "/about/team";
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => router,
}));

import TopBarBack from "./TopBarBack";

// jsdom has no IntersectionObserver. This one records what is observed and
// lets a test deliver entries by hand, which is the part under test: WHICH
// element the bar follows, and what it does with the report.
type Entry = { target: Element; isIntersecting: boolean; boundingClientRect: { bottom: number } };
class FakeIO {
  static all: FakeIO[] = [];
  targets: Element[] = [];
  disconnected = false;
  constructor(public cb: (entries: Entry[]) => void) {
    FakeIO.all.push(this);
  }
  observe(el: Element) {
    this.targets.push(el);
  }
  disconnect() {
    this.disconnected = true;
  }
  report(target: Element, isIntersecting: boolean, bottom: number) {
    this.cb([{ target, isIntersecting, boundingClientRect: { bottom } }]);
  }
}
const live = () => FakeIO.all.filter((io) => !io.disconnected);
const titled = () => "topbarTitle" in document.documentElement.dataset;

function page(h1Text: string | null) {
  const header = document.createElement("header");
  header.className = "site-header";
  Object.defineProperty(header, "offsetHeight", { value: 61 }); // jsdom lays nothing out
  const main = document.createElement("main");
  main.id = "main-content";
  if (h1Text !== null) {
    const h1 = document.createElement("h1");
    h1.textContent = h1Text;
    main.append(h1);
  }
  document.body.append(header, main);
  return main;
}

function mount() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <TopBarBack />
    </NextIntlClientProvider>,
  );
}

// requestAnimationFrame coalescing: flush one frame.
const frame = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));

beforeEach(() => {
  FakeIO.all = [];
  vi.stubGlobal("IntersectionObserver", FakeIO);
  // innerText is layout-dependent and jsdom does not implement it.
  Object.defineProperty(HTMLElement.prototype, "innerText", {
    configurable: true,
    get(this: HTMLElement) {
      return this.textContent ?? "";
    },
  });
  pathname = "/about/team";
  router.back.mockClear();
  router.push.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  delete document.documentElement.dataset.topbarTitle;
});

describe("TopBarBack", () => {
  it("draws nothing on a tab root", () => {
    pathname = "/books";
    page("Books");
    mount();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(live()).toHaveLength(0);
  });

  it("with no in-app history, Back goes UP to the collection", () => {
    page("Library Team");
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(router.push).toHaveBeenCalledWith("/about");
    expect(router.back).not.toHaveBeenCalled();
  });

  it("puts the heading's text in the bar only once it has gone ABOVE the bar", () => {
    const main = page("Library Team");
    mount();
    const h1 = main.querySelector("h1")!;
    const [io] = live();
    expect(io.targets).toEqual([h1]);
    io.report(h1, false, 900); // below the fold: not "gone"
    expect(titled()).toBe(false);
    io.report(h1, false, 20); // under the bar
    expect(titled()).toBe(true);
    expect(document.querySelector(".topbar-title")!.textContent).toBe("Library Team");
    io.report(h1, true, 200);
    expect(titled()).toBe(false);
  });

  it("follows a heading that streams in after the route commits", async () => {
    const main = page(null);
    mount();
    expect(live()).toHaveLength(0);
    const h1 = document.createElement("h1");
    h1.textContent = "Library Team";
    main.append(h1);
    await frame();
    expect(live()).toHaveLength(1);
    expect(live()[0].targets).toEqual([h1]);
  });

  it("re-attaches when the heading is REPLACED, and ignores reports about the removed one", async () => {
    const main = page("Loading…");
    mount();
    const skeleton = main.querySelector("h1")!;
    const first = live()[0];

    const real = document.createElement("h1");
    real.textContent = "Library Team";
    skeleton.replaceWith(real);
    await frame();

    // A removed target reads "not intersecting, empty rect" — exactly like a
    // heading scrolled away. It must not put the skeleton's text in the bar.
    first.report(skeleton, false, 0);
    expect(titled()).toBe(false);
    expect(first.disconnected).toBe(true);
    expect(live()).toHaveLength(1);
    expect(live()[0].targets).toEqual([real]);
    live()[0].report(real, false, 10);
    expect(document.querySelector(".topbar-title")!.textContent).toBe("Library Team");
  });

  it("takes the first line of a bilingual heading", () => {
    page("Library Team\nក្រុមការងារបណ្ណាល័យ");
    mount();
    expect(document.querySelector(".topbar-title")!.textContent).toBe("Library Team");
  });
});
