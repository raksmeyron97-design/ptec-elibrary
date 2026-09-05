import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, useEffect, useRef } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import enMessages from "@/messages/en.json";
import kmMessages from "@/messages/km.json";

/* ─────────────────────────────────────────────────────────────────────────
   react-pdf is mocked at the module boundary: <Document> calls back with a
   scripted document, <Page> paints a labelled box. Everything ELSE — the
   hooks, the virtualiser, the HUD, the dialogs, the keyboard handler, the
   persistence — is the real code.
   ───────────────────────────────────────────────────────────────────────── */

type FakePage = { getTextContent: () => Promise<{ items: { str: string }[] }> };
type FakePdf = {
  numPages: number;
  getOutline: () => Promise<unknown>;
  getDestination: (n: string) => Promise<unknown>;
  getPageIndex: (r: unknown) => Promise<number>;
  getPage: (n: number) => Promise<FakePage>;
  cleanup: (keepFonts?: boolean) => void;
  destroy: () => void;
};

/** What the mocked <Page> does per page number, so the specs can script a
 *  page whose bytes never arrive (a network outage) or one that never
 *  finishes rendering (the concurrency gate). */
const scripted: {
  pdf: FakePdf | null;
  error: Error | null;
  /** Pages whose LOAD fails, with the error react-pdf would report. */
  failLoad: Map<number, Error>;
  /** Pages that mount but never call back — neither painted nor failed. */
  stall: Set<number>;
  /** The page proxies handed to onLoadSuccess, so cleanup() can be asserted. */
  pageProxies: Map<number, { cleanup: ReturnType<typeof vi.fn> }>;
} = { pdf: null, error: null, failLoad: new Map(), stall: new Set(), pageProxies: new Map() };

function pageProxy(n: number) {
  let proxy = scripted.pageProxies.get(n);
  if (!proxy) {
    proxy = { cleanup: vi.fn(() => true) };
    scripted.pageProxies.set(n, proxy);
  }
  return proxy;
}

function makePdf(numPages: number, opts: { texts?: Record<number, string>; outline?: unknown } = {}): FakePdf {
  return {
    numPages,
    getOutline: () => Promise.resolve(opts.outline ?? null),
    getDestination: (n: string) => Promise.resolve([{ num: Number(n.replace("p", "")) }]),
    getPageIndex: (r: unknown) => Promise.resolve(((r as { num: number }).num ?? 1) - 1),
    getPage: (n: number) =>
      Promise.resolve({
        getTextContent: () => Promise.resolve({ items: [{ str: opts.texts?.[n] ?? `Page ${n} text` }] }),
      }),
    cleanup: vi.fn(),
    destroy: vi.fn(),
  };
}

vi.mock("react-pdf", () => {
  function Document(props: {
    file?: string;
    children?: React.ReactNode;
    loading?: React.ReactNode;
    error?: React.ReactNode;
    onLoadSuccess?: (pdf: FakePdf) => void;
    onLoadError?: (e: Error) => void;
  }) {
    const { file, onLoadSuccess, onLoadError } = props;
    const failing = !!file && !!scripted.error;
    // Like react-pdf: the load callback fires once per FILE, never again
    // because a callback prop was recreated on a later render.
    const latest = useRef({ onLoadSuccess, onLoadError });
    latest.current = { onLoadSuccess, onLoadError };
    useEffect(() => {
      if (!file) return;
      if (failing) {
        latest.current.onLoadError?.(scripted.error!);
        return;
      }
      if (scripted.pdf) latest.current.onLoadSuccess?.(scripted.pdf);
    }, [file, failing]);
    if (!file) return null;
    if (failing) return createElement("div", { "data-testid": "doc-error" }, props.error);
    if (!scripted.pdf) return createElement("div", { "data-testid": "doc-loading" }, props.loading);
    return createElement("div", { className: "react-pdf__Document" }, props.children);
  }
  function Page(props: {
    pageNumber: number;
    width?: number;
    onRenderSuccess?: () => void;
    onRenderError?: (e: Error) => void;
    onLoadError?: (e: Error) => void;
    onLoadSuccess?: (p: unknown) => void;
  }) {
    const { pageNumber, onRenderSuccess, onRenderError, onLoadError, onLoadSuccess, width } = props;
    // Like react-pdf: the callbacks are read at fire time, not depended on —
    // a parent that recreates them must not re-run the render.
    const latest = useRef({ onRenderSuccess, onRenderError, onLoadError, onLoadSuccess });
    latest.current = { onRenderSuccess, onRenderError, onLoadError, onLoadSuccess };
    useEffect(() => {
      const failure = scripted.failLoad.get(pageNumber);
      if (failure) {
        latest.current.onLoadError?.(failure);
        return;
      }
      if (scripted.stall.has(pageNumber)) return;
      const proxy = pageProxy(pageNumber);
      latest.current.onLoadSuccess?.(
        Object.assign(proxy, {
          originalWidth: 600,
          originalHeight: 800,
          width: width ?? 600,
          height: (width ?? 600) * (4 / 3),
          rotate: 0,
        }),
      );
      latest.current.onRenderSuccess?.();
    }, [pageNumber, width]);
    return createElement(
      "div",
      { className: "react-pdf__Page", "data-page-number": pageNumber },
      createElement("span", { className: "textLayer" }, `Page ${pageNumber} text`),
    );
  }
  return { Document, Page, pdfjs: { GlobalWorkerOptions: {} } };
});

const saveReadingProgress = vi.fn(async () => {});
vi.mock("@/app/actions/reading-progress", () => ({ saveReadingProgress: (...a: unknown[]) => saveReadingProgress(...(a as [])) }));
const getBookAnnotations = vi.fn(async () => [] as unknown[]);
const addAnnotation = vi.fn(async (bookId: string, page: number, text: string, note: string, color: string) => ({
  success: true,
  annotation: { id: "a1", page_number: page, selected_text: text, note_content: note, highlight_color: color, created_at: "" },
}));
const deleteAnnotation = vi.fn(async () => ({ success: true }));
vi.mock("@/app/actions/book-annotations", () => ({
  getBookAnnotations: (...a: unknown[]) => getBookAnnotations(...(a as [])),
  addAnnotation: (...a: unknown[]) => addAnnotation(...(a as [string, number, string, string, string])),
  deleteAnnotation: (...a: unknown[]) => deleteAnnotation(...(a as [])),
}));
const incrementDownloadCount = vi.fn(async () => {});
vi.mock("@/app/actions/download", () => ({ incrementDownloadCount: (...a: unknown[]) => incrementDownloadCount(...(a as [])) }));

import PDFViewer, { type PDFViewerProps } from "./PDFViewer";
import { READER_BUDGETS } from "@/lib/reader/budgets";

const sendBeacon = vi.fn(() => true);
/** The reading-position beacon (`POST /api/reader/progress`) goes through
 *  fetch with `keepalive`; nothing else in the reader calls fetch. */
const fetchMock = vi.fn(async () => ({ ok: true, status: 204 }));
let desktop = false;

beforeAll(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
    unobserve() {}
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 900 });
  Object.defineProperty(HTMLElement.prototype, "offsetParent", { configurable: true, get() { return this.parentElement; } });
  Element.prototype.scrollTo = function (this: Element, arg?: ScrollToOptions | number) {
    const top = typeof arg === "number" ? arg : arg?.top;
    if (typeof top === "number") this.scrollTop = top;
  } as Element["scrollTo"];
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: sendBeacon });
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("min-width: 768px") ? desktop : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })),
  });
});

beforeEach(() => {
  window.localStorage.clear();
  scripted.pdf = makePdf(3);
  scripted.error = null;
  scripted.failLoad = new Map();
  scripted.stall = new Set();
  scripted.pageProxies = new Map();
  desktop = false;
  saveReadingProgress.mockClear();
  getBookAnnotations.mockClear();
  addAnnotation.mockClear();
  deleteAnnotation.mockClear();
  incrementDownloadCount.mockClear();
  sendBeacon.mockClear();
  fetchMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

const BOOK = "33333333-3333-4333-8333-333333333301";

function renderViewer(props: Partial<PDFViewerProps> = {}, locale: "en" | "km" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "km" ? kmMessages : enMessages}>
      <PDFViewer title="Foundations of Education" pdfUrl={`/api/books/${BOOK}/file`} bookId={BOOK} totalPages={3} {...props} />
    </NextIntlClientProvider>,
  );
}

const indicator = () => screen.getAllByRole("button", { name: /^Page \d+ of \d+$/ })[0];
const pageIndicatorText = () => indicator().getAttribute("aria-label");
const topBar = () => document.querySelector('[data-reader-hud="top"]') as HTMLElement;
const bottomBar = () => document.querySelector('[data-reader-hud="bottom"]') as HTMLElement;
const root = () => document.querySelector("[data-reader-root]") as HTMLElement;
const key = (k: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(window, { key: k, ...init });

async function loaded() {
  await waitFor(() => expect(document.querySelector(".react-pdf__Page")).toBeTruthy());
}

/** Jump through the page navigator, the way a reader does. */
async function goToPage(n: number) {
  await act(async () => {
    indicator().click();
  });
  const dialog = screen.getByRole("dialog", { name: "Go to page" });
  const box = within(dialog).getByRole("textbox");
  fireEvent.change(box, { target: { value: String(n) } });
  await act(async () => {
    fireEvent.submit(box.closest("form")!);
    await new Promise((r) => setTimeout(r, 20));
  });
}

/* ═══════════════════════════════ A. preserved capabilities ═══════════════ */

describe("document lifecycle", () => {
  it("shows the no-PDF state without mounting a reader", () => {
    renderViewer({ pdfUrl: null });
    expect(screen.getByText("No PDF is available yet.")).toBeInTheDocument();
    expect(root()).toBeNull();
  });

  it("loads, paints page 1 and announces the position", async () => {
    renderViewer();
    await loaded();
    expect(pageIndicatorText()).toBe("Page 1 of 3");
    expect(screen.getAllByText("Page 1 of 3").length).toBeGreaterThan(0); // live region
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const body = JSON.parse(await (sendBeacon.mock.calls[0] as unknown as [string, Blob])[1].text());
    expect(body).toMatchObject({ type: "pdf_first_page", bookId: BOOK, file: `/api/books/${BOOK}/file`, source: "network" });
    expect(body).not.toHaveProperty("text");
  });

  it("destroys the pdf.js document on unmount and removes its window listeners", async () => {
    const added = vi.spyOn(window, "addEventListener");
    const removed = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderViewer();
    await loaded();
    unmount();
    expect(scripted.pdf!.destroy).toHaveBeenCalled();
    const names = (calls: typeof added.mock.calls) => calls.map((c) => c[0]).filter((n) => ["keydown", "resize", "online", "offline", "pagehide"].includes(n as string)).sort();
    expect(names(removed.mock.calls)).toEqual(names(added.mock.calls));
    added.mockRestore();
    removed.mockRestore();
  });

  it("never mounts a whole book: a 500-page document keeps ≤ 12 pages in the DOM", async () => {
    scripted.pdf = makePdf(500);
    renderViewer({ totalPages: 500 });
    await loaded();
    const mounted = document.querySelectorAll("[data-page]").length;
    expect(mounted).toBeGreaterThan(0);
    expect(mounted).toBeLessThanOrEqual(12);
    expect(pageIndicatorText()).toBe("Page 1 of 500");
  });

  it("classifies a missing file and offers retry + report, but no retry for a permission refusal", async () => {
    scripted.error = new Error("Unexpected server response (404)");
    renderViewer({ pdfUrl: `/api/books/${BOOK}/file?sig=SECRET`, reportEmail: "library@ptec.edu.kh", backHref: "/books/x" });
    expect(await screen.findByText("This book is currently unavailable.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    const report = screen.getByRole("link", { name: "Report broken file" });
    expect(report.getAttribute("href")).toContain(`File%3A%20%2Fapi%2Fbooks`);
    expect(report.getAttribute("href")).not.toContain("SECRET");
    expect(sendBeacon).toHaveBeenCalledTimes(1); // pdf_load_error
  });

  it("permission errors offer only a way back", async () => {
    scripted.error = new Error("Unexpected server response (403)");
    renderViewer({ backHref: "/books/x" });
    expect(await screen.findByText("You don't have permission to access this book.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(within(screen.getByRole("alert")).getByRole("link", { name: "Back to book" })).toHaveAttribute("href", "/books/x");
  });
});

describe("offline mode", () => {
  it("makes no server call of any kind, even when the caller says the reader is signed in", async () => {
    renderViewer({ offline: true, isLoggedIn: true, initialProgressPct: 0 });
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1700));
    });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pagehide"));
    expect(getBookAnnotations).not.toHaveBeenCalled();
    expect(saveReadingProgress).not.toHaveBeenCalled();
    expect(sendBeacon).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("download permission", () => {
  const openMore = () => fireEvent.click(screen.getByRole("button", { name: "More options" }));

  it("hides every download control when allowDownload is false", async () => {
    renderViewer({ allowDownload: false, isLoggedIn: true });
    await loaded();
    openMore();
    const menu = screen.getByRole("menu", { name: "More options" });
    expect(within(menu).queryByText("Download")).toBeNull();
    expect(within(menu).queryByText("Sign in to download")).toBeNull();
  });

  it("offers Download to a signed-in reader and a sign-in prompt to a guest", async () => {
    renderViewer({ allowDownload: true, isLoggedIn: true });
    await loaded();
    openMore();
    expect(within(screen.getByRole("menu")).getByText("Download")).toBeInTheDocument();
    key("Escape");
    // guest
    document.body.innerHTML = "";
    renderViewer({ allowDownload: true, isLoggedIn: false });
    await loaded();
    openMore();
    expect(within(screen.getByRole("menu")).getByText("Sign in to download")).toBeInTheDocument();
  });
});

describe("reading progress", () => {
  it("autosaves once after the debounce, not per navigation frame, and flushes when hidden", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderViewer({ isLoggedIn: true });
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(saveReadingProgress).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1600);
    });
    expect(saveReadingProgress).toHaveBeenCalledTimes(1);
    expect(saveReadingProgress).toHaveBeenCalledWith(BOOK, 100);
    // The device record keeps the exact page and notes what the server ACKNOWLEDGED.
    await act(async () => {});
    expect(JSON.parse(localStorage.getItem(`ebook:pos:${BOOK}`)!)).toMatchObject({ p: 3, pct: 100, s: 100 });
    // Back to page 1 and hide the tab before the debounce elapses → flushed
    // through the keepalive endpoint, NOT the Server Action (which the browser
    // would cancel as the document goes away).
    key("Home");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    fireEvent(document, new Event("visibilitychange"));
    expect(saveReadingProgress).toHaveBeenCalledTimes(1); // still just the autosave
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/reader/progress");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body as string)).toEqual({ bookId: BOOK, progressPct: 33 });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  it("flushes on pagehide with a keepalive request, and records the sync synchronously", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderViewer({ isLoggedIn: true });
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await act(async () => {
      vi.advanceTimersByTime(500); // local position written, autosave not yet due
    });
    window.dispatchEvent(new Event("pagehide"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/reader/progress");
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body as string)).toEqual({ bookId: BOOK, progressPct: 67 });
    // The record must be on disk BEFORE the document goes away — a `.then()`
    // would never run, so the marker is written synchronously in the handler.
    expect(JSON.parse(localStorage.getItem(`ebook:pos:${BOOK}`)!)).toMatchObject({ p: 2, s: 67 });
  });

  it("does not flush when nothing moved since the last save", async () => {
    // The server already holds this exact position (page 1 of 3 = 33%), so
    // teardown has nothing to report. Opening a book the server has never
    // seen DOES flush — that is unsaved progress, not a no-op.
    renderViewer({ isLoggedIn: true, initialProgressPct: 33 });
    await loaded();
    window.dispatchEvent(new Event("pagehide"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("survives a fetch that throws during teardown", async () => {
    fetchMock.mockImplementationOnce(() => {
      throw new Error("network shutting down");
    });
    renderViewer({ isLoggedIn: true });
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(() => window.dispatchEvent(new Event("pagehide"))).not.toThrow();
  });
});

describe("exact-page resume", () => {
  it("persists nothing — locally or to the server — before the document has loaded", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.setItem(`ebook:pos:${BOOK}`, JSON.stringify({ p: 3, pct: 25, t: Date.now() }));
    scripted.pdf = null; // the document never finishes loading in this test
    // Metadata says 120 pages and the server says 100%: the placeholder page is 120.
    renderViewer({ totalPages: 120, isLoggedIn: true, initialProgressPct: 100 });
    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
    expect(JSON.parse(localStorage.getItem(`ebook:pos:${BOOK}`)!)).toMatchObject({ p: 3, pct: 25 });
    expect(saveReadingProgress).not.toHaveBeenCalled();
  });

  it("lands on the device's exact page, then explains itself once", async () => {
    localStorage.setItem(`ebook:pos:${BOOK}`, JSON.stringify({ p: 3, pct: 100 }));
    renderViewer({ isLoggedIn: true, initialProgressPct: 99 });
    await loaded();
    expect(pageIndicatorText()).toBe("Page 3 of 3");
    const prompt = screen.getByRole("status", { name: "" });
    expect(within(prompt).getByText("Welcome back")).toBeInTheDocument();
    expect(within(prompt).getByText("Continuing from page 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start from beginning" }));
    expect(pageIndicatorText()).toBe("Page 1 of 3");
    expect(screen.queryByText("Welcome back")).toBeNull();
  });

  it("yields to a newer server position rather than overwriting it", async () => {
    localStorage.setItem(`ebook:pos:${BOOK}`, JSON.stringify({ p: 1, pct: 5, t: Date.now() - 60_000 }));
    renderViewer({ isLoggedIn: true, initialProgressPct: 66, initialProgressAt: new Date().toISOString() });
    await loaded();
    expect(pageIndicatorText()).toBe("Page 2 of 3");
  });

  it("keeps this device's page when it is newer than the server's (a save that never flushed)", async () => {
    localStorage.setItem(`ebook:pos:${BOOK}`, JSON.stringify({ p: 3, pct: 100, t: Date.now() }));
    renderViewer({ isLoggedIn: true, initialProgressPct: 33, initialProgressAt: new Date(Date.now() - 60_000).toISOString() });
    await loaded();
    expect(pageIndicatorText()).toBe("Page 3 of 3");
  });

  it("derives the resume page from the REAL page count, not the metadata count", async () => {
    // 12-page file recorded as 320 pages, read to 50%: page 6, not "page 160 → clamped to 12".
    scripted.pdf = makePdf(12);
    renderViewer({ totalPages: 320, isLoggedIn: true, initialProgressPct: 50 });
    await loaded();
    expect(pageIndicatorText()).toBe("Page 6 of 12");
  });

  it("does not prompt when the reader is starting at page 1", async () => {
    renderViewer();
    await loaded();
    expect(screen.queryByText("Welcome back")).toBeNull();
  });
});

describe("bookmarks", () => {
  it("toggle with B, persist without duplicates, and list with page numbers", async () => {
    renderViewer();
    await loaded();
    key("b");
    key("ArrowRight");
    key("b");
    key("b");
    key("b");
    expect(JSON.parse(localStorage.getItem(`ebook:bm:${BOOK}`)!)).toEqual([1, 2]);
    fireEvent.click(screen.getAllByRole("button", { name: "Reader navigation" })[0]);
    fireEvent.click(screen.getByRole("tab", { name: "Bookmarks" }));
    const list = screen.getByRole("tabpanel");
    expect(within(list).getAllByText(/^Page [12]$/)).toHaveLength(2);
  });
});

describe("search", () => {
  it("debounces typing, lists page hits, counts matches and cycles on Enter", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    scripted.pdf = makePdf(3, { texts: { 1: "intro", 2: "working memory matters", 3: "memory again and memory" } });
    renderViewer();
    await loaded();
    key("/");
    const input = await screen.findByRole("searchbox", { name: "Search this book" });
    fireEvent.change(input, { target: { value: "memory" } });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByText(/matches/)).toBeNull(); // still inside the debounce
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    await waitFor(() => expect(screen.getByText("1 of 3")).toBeInTheDocument());
    expect(pageIndicatorText()).toBe("Page 2 of 3"); // jumped to the first hit
    expect(screen.getByText("Page 3")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    expect(pageIndicatorText()).toBe("Page 3 of 3");
  });
});

describe("annotations", () => {
  it("shows Highlight · Note · Copy on a selection and saves once", async () => {
    renderViewer({ isLoggedIn: true });
    await loaded();
    const layer = document.querySelector(".textLayer")!;
    const selection = {
      toString: () => "working memory plays",
      rangeCount: 1,
      isCollapsed: false,
      anchorNode: layer.firstChild,
      getRangeAt: () => ({ getBoundingClientRect: () => ({ left: 100, top: 300, width: 80, bottom: 316, right: 180, height: 16 }) }),
      removeAllRanges: vi.fn(),
    };
    vi.spyOn(window, "getSelection").mockReturnValue(selection as unknown as Selection);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.pointerUp(layer);
    await act(async () => {
      vi.advanceTimersByTime(5);
    });
    const toolbar = await screen.findByRole("toolbar", { name: "Selected text actions" });
    expect(within(toolbar).getByRole("button", { name: "Highlight" })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "Note" })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "Copy" })).toBeInTheDocument();
    fireEvent.click(within(toolbar).getByRole("radio", { name: "Green highlight" }));
    fireEvent.click(within(toolbar).getByRole("button", { name: "Highlight" }));
    fireEvent.click(within(toolbar).getByRole("button", { name: "Highlight" })); // double click must not double-save
    await waitFor(() => expect(addAnnotation).toHaveBeenCalledTimes(1));
    expect(addAnnotation).toHaveBeenCalledWith(BOOK, 1, "working memory plays", "", "green");
    await waitFor(() => expect(screen.queryByRole("toolbar", { name: "Selected text actions" })).toBeNull());
  });
});

/* ═════════════════ A2. production performance & reliability ══════════════ */

describe("bounded mounting", () => {
  const mountedPages = () =>
    Array.from(document.querySelectorAll("[data-page]")).map((el) => Number(el.getAttribute("data-page")));

  it("a JUMP mounts a window around the destination, never the pages in between", async () => {
    // The regression this replaced: the mounted set was the union of the
    // immediate window and a lagging deferred one, so a jump from 1 to 250
    // mounted every page between them until the deferred value caught up.
    // Measured in a real browser before the fix: 500 pages, 502 canvases.
    scripted.pdf = makePdf(500);
    renderViewer({ totalPages: 500 });
    await loaded();
    await goToPage(250);
    const pages = mountedPages();
    expect(pages.length).toBeLessThanOrEqual(READER_BUDGETS.MAX_MOUNTED_PAGES);
    expect(pages.some((p) => p > 200)).toBe(true);
    expect(pages.filter((p) => p < 200)).toEqual([]);
  });

  it("mounts nothing beyond the visible window until the visible pages have painted", async () => {
    scripted.pdf = makePdf(500);
    scripted.stall = new Set([1, 2, 3]); // page 1 never finishes rendering
    renderViewer({ totalPages: 500 });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    // Only the visible rows are mounted; no neighbour competes with page 1.
    expect(mountedPages().every((p) => p <= 3)).toBe(true);
  });

  it("stops admitting neighbours while the reader is offline", async () => {
    scripted.pdf = makePdf(500);
    renderViewer({ totalPages: 500 });
    await loaded();
    const online = mountedPages().length;
    await act(async () => {
      Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
      window.dispatchEvent(new Event("offline"));
      await new Promise((r) => setTimeout(r, 30));
    });
    // Already-rendered pages stay; nothing new is fetched.
    expect(mountedPages().length).toBeLessThanOrEqual(online);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("releases a page's pdf.js retention when it leaves the window", async () => {
    scripted.pdf = makePdf(500);
    renderViewer({ totalPages: 500 });
    await loaded();
    const early = mountedPages();
    await act(async () => {
      key("End"); // jump to the last page — every early page unmounts
      await new Promise((r) => setTimeout(r, 30));
    });
    for (const p of early) {
      expect(scripted.pageProxies.get(p)?.cleanup, `page ${p} cleanup`).toHaveBeenCalled();
    }
  });

  it("releases the document's worker caches after an idle period, never while rendering", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderViewer();
    await loaded();
    const pdf = scripted.pdf!;
    await act(async () => {
      vi.advanceTimersByTime(READER_BUDGETS.IDLE_CLEANUP_MS - 1_000);
    });
    expect(pdf.cleanup).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    expect(pdf.cleanup).toHaveBeenCalledWith(true); // keepLoadedFonts
  });
});

describe("network interruption", () => {
  const badge = () => document.querySelector('[data-reader-hud="top"] [role="status"]');

  it("says so when a page's bytes cannot be fetched, and reports it once", async () => {
    scripted.pdf = makePdf(40);
    scripted.failLoad = new Map([[2, new Error("Unexpected server response (503)")]]);
    renderViewer({ totalPages: 40 });
    await loaded();
    await act(async () => {
      key("ArrowRight");
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(badge()?.textContent).toMatch(/Offline|Reconnecting/);
    // Reported as a page_load_error carrying the classified kind and a device
    // class — counts and enums, no document content, no URL with a query.
    const beacons = await Promise.all(
      sendBeacon.mock.calls.map(async (c) => JSON.parse(await (c as unknown as [string, Blob])[1].text())),
    );
    const failures = beacons.filter((b) => b.type === "page_load_error");
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ page: 2, kind: "server", bookId: BOOK, file: `/api/books/${BOOK}/file` });
    expect(failures[0]).not.toHaveProperty("text");
    // ...and exactly one offline_transition, however many pages fail.
    expect(beacons.filter((b) => b.type === "offline_transition")).toHaveLength(1);
  });

  it("recovers by reloading the document ONCE, keeping the page and the zoom", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    scripted.pdf = makePdf(40);
    renderViewer({ totalPages: 40 });
    await loaded();
    await act(async () => {
      key("+"); // zoom in, so the restored state is observable
      await new Promise((r) => setTimeout(r, 20));
    });
    const zoomNow = () =>
      document.querySelector('[data-reader-hud="bottom"] button[aria-label^="Zoom —"]')?.textContent;
    const zoomBefore = zoomNow();
    expect(zoomBefore).toBe("150%");
    // Jump to a page whose bytes have not been fetched, with the link down.
    scripted.failLoad = new Map([[20, new Error("Unexpected server response (429)")]]);
    await goToPage(20);
    expect(badge()?.textContent).toMatch(/Offline|Reconnecting/);
    expect(pageIndicatorText()).toBe("Page 20 of 40");

    // The link returns. The probe is a one-byte Range request on the backoff
    // schedule; only after it succeeds is the document reloaded.
    scripted.failLoad = new Map();
    const before = fetchMock.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(2_100);
      await new Promise((r) => setTimeout(r, 50));
    });
    const probes = (fetchMock.mock.calls.slice(before) as unknown as [string, RequestInit][]).filter(
      ([, init]) => (init?.headers as Record<string, string> | undefined)?.Range === "bytes=0-0",
    );
    expect(probes.length).toBeGreaterThanOrEqual(1);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    // Reader state survived the reload: same page, same zoom, no badge...
    expect(pageIndicatorText()).toBe("Page 20 of 40");
    expect(zoomNow()).toBe(zoomBefore);
    expect(badge()).toBeNull();
    // ...and no "Welcome back" card: this was a recovery, not a return visit.
    expect(screen.queryByText("Welcome back")).toBeNull();
    // Exactly one reload, reported once.
    const beacons = await Promise.all(
      sendBeacon.mock.calls.map(async (c) => JSON.parse(await (c as unknown as [string, Blob])[1].text())),
    );
    const recoveries = beacons.filter((b) => b.type === "network_recovery");
    expect(recoveries).toHaveLength(1);
    expect(recoveries[0].reloaded).toBe(true);
  });

  it("makes no probe at all while the browser says it is offline", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderViewer();
    await loaded();
    fetchMock.mockClear();
    await act(async () => {
      Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
      window.dispatchEvent(new Event("offline"));
      vi.advanceTimersByTime(30_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("the offline reader never probes, never reloads and never reports", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderViewer({ offline: true, pdfUrl: "blob:local" });
    await loaded();
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
      vi.advanceTimersByTime(60_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendBeacon).not.toHaveBeenCalled();
  });
});

describe("reading progress under a failing network", () => {
  it("retries a save the server refused instead of counting it as done", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    saveReadingProgress.mockRejectedValueOnce(new Error("offline"));
    renderViewer({ isLoggedIn: true });
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await act(async () => {
      vi.advanceTimersByTime(1_700);
    });
    expect(saveReadingProgress).toHaveBeenCalledTimes(1);
    // The rejection restores the marker, so the next page turn sends again —
    // including the position the failed call was carrying.
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await act(async () => {
      vi.advanceTimersByTime(1_700);
    });
    expect(saveReadingProgress).toHaveBeenCalledTimes(2);
    expect(saveReadingProgress).toHaveBeenLastCalledWith(BOOK, 100);
  });

  it("flushes a position the server never got as soon as the link returns", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    saveReadingProgress.mockRejectedValueOnce(new Error("offline"));
    renderViewer({ isLoggedIn: true });
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await act(async () => {
      vi.advanceTimersByTime(1_700);
    });
    saveReadingProgress.mockClear();
    // The event and the debounce it re-arms are two separate turns: the effect
    // that schedules the retry only runs when React commits the state change.
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await act(async () => {
      vi.advanceTimersByTime(1_700);
    });
    expect(saveReadingProgress).toHaveBeenCalledWith(BOOK, 67);
  });
});

/* ═══════════════════════════════ B. HUD & auto-hide ══════════════════════ */

describe("HUD auto-hide", () => {
  it("shows on open, hides after 3 s, is inert while hidden, and returns on movement", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderViewer();
    await loaded();
    expect(topBar()).not.toHaveAttribute("inert");
    await act(async () => {
      vi.advanceTimersByTime(3200);
    });
    expect(topBar()).toHaveAttribute("inert");
    expect(bottomBar()).toHaveAttribute("aria-hidden", "true");
    fireEvent.pointerMove(root());
    expect(topBar()).not.toHaveAttribute("inert");
  });

  it("stays visible while a panel is open and while a key is pressed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderViewer();
    await loaded();
    fireEvent.click(screen.getAllByRole("button", { name: "Reader navigation" })[0]);
    await act(async () => {
      vi.advanceTimersByTime(3500);
    });
    expect(topBar()).not.toHaveAttribute("inert");
    key("Escape"); // closes the panel
    await act(async () => {
      vi.advanceTimersByTime(3500);
    });
    expect(topBar()).toHaveAttribute("inert");
    key("ArrowRight");
    expect(topBar()).not.toHaveAttribute("inert");
  });

  it("does not animate for reduced-motion readers", () => {
    const css = readFileSync(path.resolve(__dirname, "../../../app/globals.css"), "utf8");
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce) {\n  .reader-hud"));
    expect(reduced).toContain(".reader-hud { transition: none; }");
  });
});

/* ═══════════════════════════════ D. navigation ═══════════════════════════ */

describe("navigation", () => {
  it("prev/next buttons and the keyboard move between pages and clamp", async () => {
    renderViewer();
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(pageIndicatorText()).toBe("Page 2 of 3");
    key("End");
    expect(pageIndicatorText()).toBe("Page 3 of 3");
    key("ArrowRight");
    expect(pageIndicatorText()).toBe("Page 3 of 3");
    key("Home");
    expect(pageIndicatorText()).toBe("Page 1 of 3");
    key("ArrowLeft");
    expect(pageIndicatorText()).toBe("Page 1 of 3");
  });

  it("the page indicator opens Go to page: Khmer digits, Enter, clamp, Escape", async () => {
    renderViewer({}, "km");
    await loaded();
    const ind = screen.getAllByRole("button", { name: "ទំព័រ ១ នៃ ៣" })[0];
    fireEvent.click(ind);
    const dialog = screen.getByRole("dialog", { name: "ទៅកាន់ទំព័រ" });
    const input = within(dialog).getByRole("textbox");
    fireEvent.change(input, { target: { value: "២" } });
    fireEvent.submit(input.closest("form")!);
    expect(screen.getAllByRole("button", { name: "ទំព័រ ២ នៃ ៣" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog")).toBeNull();
    // clamp
    fireEvent.click(screen.getAllByRole("button", { name: "ទំព័រ ២ នៃ ៣" })[0]);
    fireEvent.change(within(screen.getByRole("dialog")).getByRole("textbox"), { target: { value: "999" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "ទៅ" }));
    expect(screen.getAllByRole("button", { name: "ទំព័រ ៣ នៃ ៣" }).length).toBeGreaterThan(0);
    // escape
    fireEvent.click(screen.getAllByRole("button", { name: "ទំព័រ ៣ នៃ ៣" })[0]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not fire shortcuts while typing in a field", async () => {
    renderViewer();
    await loaded();
    key("/");
    const input = await screen.findByRole("searchbox");
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(pageIndicatorText()).toBe("Page 1 of 3");
  });
});

/* ═══════════════════════════════ E. zoom / focus / settings ══════════════ */

describe("zoom, focus mode and settings", () => {
  it("steps zoom with the keyboard and persists it", async () => {
    renderViewer();
    await loaded();
    key("+");
    expect(parseFloat(localStorage.getItem("ebook:reader:v2:zoom")!)).toBeGreaterThan(1);
    expect(localStorage.getItem("ebook:reader:v2:fitMode")).toBe("custom");
    key("0", { metaKey: true }); // ⌘0 only while the reader owns focus — it does not yet
    key("-");
    key("-");
    key("-");
    key("-");
    expect(parseFloat(localStorage.getItem("ebook:reader:v2:zoom")!)).toBe(0.5);
  });

  it("focus mode is a modal dialog: F enters, Escape exits and focus returns", async () => {
    renderViewer();
    await loaded();
    const next = screen.getByRole("button", { name: "Next page" });
    next.focus();
    key("f");
    expect(root()).toHaveAttribute("role", "dialog");
    expect(root()).toHaveAttribute("aria-modal", "true");
    // Genuinely fixed: no competing `relative` on the same element.
    expect(root().className).toMatch(/\bfixed\b/);
    expect(root().className).not.toMatch(/\brelative\b/);
    expect(document.body.style.overflow).toBe("hidden");
    key("Escape");
    expect(root()).not.toHaveAttribute("role");
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(next);
  });

  it("the settings dialog edits the persisted preferences, not a copy", async () => {
    renderViewer();
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(within(screen.getByRole("menu")).getByText("Reader settings"));
    const dialog = screen.getByRole("dialog", { name: "Reader settings" });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Dark" }));
    fireEvent.click(within(dialog).getByRole("radio", { name: "Single page" }));
    fireEvent.click(within(dialog).getByRole("radio", { name: "Off" }));
    expect(localStorage.getItem("ebook:reader:v2:theme")).toBe("dark");
    expect(localStorage.getItem("ebook:reader:v2:viewMode")).toBe("single");
    expect(localStorage.getItem("ebook:reader:v2:pageTransition")).toBe("off");
    expect(root()).toHaveClass("reader-dark");
  });

  it("? opens the shortcut help and lists only real bindings", async () => {
    renderViewer();
    await loaded();
    key("?");
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    expect(within(dialog).getByText("Focus reading")).toBeInTheDocument();
    expect(within(dialog).getByText("Add or remove bookmark")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

/* ═══════════════════════════════ F. panels ═══════════════════════════════ */

describe("panels", () => {
  it("is a bottom-sheet dialog on phones and an in-flow side panel on desktop", async () => {
    renderViewer();
    await loaded();
    fireEvent.click(screen.getAllByRole("button", { name: "Reader navigation" })[0]);
    expect(screen.getByRole("dialog", { name: "Reader navigation" })).toBeInTheDocument();
    key("Escape");
    expect(screen.queryByRole("dialog")).toBeNull();

    document.body.innerHTML = "";
    desktop = true;
    renderViewer();
    await loaded();
    fireEvent.click(screen.getAllByRole("button", { name: "Reader navigation" })[0]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("complementary", { name: "Reader navigation" })).toBeInTheDocument();
  });

  it("numbers the outline, marks the current section and labels bookmarks with it", async () => {
    scripted.pdf = makePdf(3, {
      outline: [
        { title: "Introduction", dest: "p1", items: [] },
        { title: "Methods", dest: "p2", items: [{ title: "Sampling", dest: "p3", items: [] }] },
      ],
    });
    renderViewer();
    await loaded();
    key("ArrowRight");
    fireEvent.click(screen.getAllByRole("button", { name: "Reader navigation" })[0]);
    fireEvent.click(screen.getByRole("tab", { name: "Contents" }));
    const nav = await screen.findByRole("navigation", { name: "Table of contents" });
    expect(within(nav).getByText("01")).toBeInTheDocument();
    expect(within(nav).getByText("02")).toBeInTheDocument();
    await waitFor(() => expect(within(nav).getByRole("button", { name: /Methods/ })).toHaveAttribute("aria-current", "true"));
    fireEvent.click(within(nav).getByRole("button", { name: /Sampling/ }));
    await waitFor(() => expect(pageIndicatorText()).toBe("Page 3 of 3"));
    // Bookmark page 3 → labelled "Sampling"
    key("b");
    fireEvent.click(screen.getAllByRole("button", { name: "Reader navigation" })[0]);
    fireEvent.click(screen.getByRole("tab", { name: "Bookmarks" }));
    expect(within(screen.getByRole("tabpanel")).getByText("Sampling")).toBeInTheDocument();
  });

  it("offers a citation only when metadata supports it, in three styles with a page reference", async () => {
    renderViewer({
      citation: {
        verified: true,
        work: { kind: "book", title: "Foundations of Education", authors: ["Sok San"], year: "2021", url: "https://library.ptec.edu.kh/books/x" },
      },
    });
    await loaded();
    key("ArrowRight");
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(within(screen.getByRole("menu")).getByText("Cite this book"));
    const dialog = screen.getByRole("dialog", { name: "Cite this book" });
    expect(within(dialog).getByText(/Sok San \(2021\)\. Foundations of Education\./)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("radio", { name: "MLA" }));
    expect(within(dialog).getByText(/Sok San\. Foundations of Education\. 2021\./)).toBeInTheDocument();
    expect(within(dialog).getByText(/\(Sok San, 2021, p\. 2\)/)).toBeInTheDocument();
  });

  it("has no Cite entry without citation metadata", async () => {
    renderViewer();
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    expect(within(screen.getByRole("menu")).queryByText("Cite this book")).toBeNull();
  });
});

/* ═══════════════════════════════ accessibility & i18n ════════════════════ */

describe("accessibility", () => {
  it("strips dangling aria-owns from pdf.js text layers", async () => {
    renderViewer();
    await loaded();
    const layer = document.querySelector(".textLayer")!;
    const span = document.createElement("span");
    span.setAttribute("aria-owns", "does-not-exist");
    span.setAttribute("aria-label", "-");
    await act(async () => {
      layer.appendChild(span);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(span).not.toHaveAttribute("aria-owns");
    expect(span).not.toHaveAttribute("aria-label");
  });

  it("renders every HUD control with an accessible name and Khmer digits under km", async () => {
    renderViewer({}, "km");
    await loaded();
    for (const bar of [topBar(), bottomBar()]) {
      for (const btn of Array.from(bar.querySelectorAll("button, a"))) {
        expect(btn.getAttribute("aria-label") || btn.textContent?.trim(), btn.outerHTML).toBeTruthy();
      }
    }
    expect(screen.getAllByText("១").length).toBeGreaterThan(0);
  });
});

describe("source invariants", () => {
  const dir = path.resolve(__dirname);
  // The abstract (thesis/publication) reader shares this folder; its files are
  // not part of the PDF reader and keep their own conventions.
  const ABSTRACT_READER = new Set(["ReaderDialog.tsx", "ReaderToolbar.tsx", "useReaderPreferences.ts"]);
  const files = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((f) => f.isFile() && /\.tsx?$/.test(f.name) && !/\.test\.tsx?$/.test(f.name) && !ABSTRACT_READER.has(f.name))
    .map((f) => path.join(f.parentPath ?? f.path, f.name));

  it("reader components never branch on the locale for a visible string", () => {
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      // A locale branch that yields a string not starting with "/" is a
      // hard-coded visible string; a path prefix ("/km") is allowed.
      expect(/locale === "km"\s*\?\s*"[^"/]/.test(src), path.relative(dir, file)).toBe(false);
    }
  });

  it("reader components carry no literal colours — the chrome comes from --reader-* tokens", () => {
    // reader-config.ts holds the pdf.js page palette (an API input, not chrome).
    for (const file of files.filter((f) => !f.endsWith("reader-config.ts"))) {
      const src = readFileSync(file, "utf8");
      expect(/#[0-9a-fA-F]{6}\b/.test(src), path.relative(dir, file)).toBe(false);
      expect(/\b(bg|text|border|ring)-(slate|cyan|gray|zinc)-\d{3}\b/.test(src), path.relative(dir, file)).toBe(false);
    }
  });
});
