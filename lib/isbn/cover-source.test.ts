import { describe, it, expect } from "vitest";
import { fetchCoverSource, isAllowedCoverSource, openLibraryCoverSource, MAX_HOPS } from "./cover-source";
import type { FetchLike } from "./types";

const SRC = "https://covers.openlibrary.org/b/id/12420356-L.jpg";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1]);

const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });
const image = (bytes = JPEG, headers: Record<string, string> = {}) => new Response(bytes, { status: 200, headers });

/** Answers each URL in turn; records what was asked and with which redirect mode. */
function scripted(answers: Record<string, () => Response>) {
  const asked: { url: string; redirect?: RequestRedirect }[] = [];
  const fetch: FetchLike = async (url, init) => {
    asked.push({ url, redirect: init?.redirect });
    const a = answers[url];
    if (!a) throw new TypeError(`unexpected ${url}`);
    return a();
  };
  return { fetch, asked };
}

describe("isAllowedCoverSource — the only URLs the server will fetch", () => {
  it("accepts Open Library's large cover by numeric id", () => {
    expect(isAllowedCoverSource(SRC)).toBe(true);
    expect(openLibraryCoverSource(12420356)).toBe(SRC);
  });
  it.each([
    "http://covers.openlibrary.org/b/id/12420356-L.jpg",
    "https://covers.openlibrary.org/b/id/12420356-M.jpg",
    "https://covers.openlibrary.org/b/isbn/9780134685991-L.jpg",
    "https://covers.openlibrary.org/b/id/0-L.jpg",
    "https://covers.openlibrary.org/b/id/12420356-L.jpg?x=1",
    "https://covers.openlibrary.org.evil.example/b/id/1-L.jpg",
    "https://evil.example/b/id/1-L.jpg",
    "https://covers.openlibrary.org/b/id/../../x-L.jpg",
    "",
    null,
  ])("refuses %s", (u) => expect(isAllowedCoverSource(u)).toBe(false));
  it("refuses a non-positive or unsafe id", () => {
    expect(openLibraryCoverSource(0)).toBeNull();
    expect(openLibraryCoverSource(-1)).toBeNull();
    expect(openLibraryCoverSource(Number.MAX_SAFE_INTEGER + 1)).toBeNull();
  });
});

describe("fetchCoverSource", () => {
  it("follows Open Library's redirect to archive.org by hand, and returns the image", async () => {
    const { fetch, asked } = scripted({
      [SRC]: () => redirect("https://archive.org/download/l_covers_0012/l_covers_0012_42.zip/0012420356-L.jpg"),
      "https://archive.org/download/l_covers_0012/l_covers_0012_42.zip/0012420356-L.jpg": () => redirect("https://ia800100.us.archive.org/view_archive.php?archive=/x.zip&file=0012420356-L.jpg"),
      "https://ia800100.us.archive.org/view_archive.php?archive=/x.zip&file=0012420356-L.jpg": () => image(),
    });
    const r = await fetchCoverSource(SRC, { fetch });
    expect(r.ok).toBe(true);
    expect(asked.every((a) => a.redirect === "manual")).toBe(true);
  });

  it("refuses a redirect off the allow-list — and does not follow it", async () => {
    const { fetch, asked } = scripted({ [SRC]: () => redirect("http://169.254.169.254/latest/meta-data/") });
    expect(await fetchCoverSource(SRC, { fetch })).toEqual({ ok: false, reason: "redirect_not_allowed" });
    expect(asked).toHaveLength(1);
  });

  it.each(["http://archive.org/x.jpg", "https://archive.org:8443/x.jpg", "https://user@archive.org/x.jpg", "https://archive.org.evil.example/x.jpg"])(
    "refuses the hop %s",
    async (to) => {
      const { fetch } = scripted({ [SRC]: () => redirect(to) });
      expect(await fetchCoverSource(SRC, { fetch })).toMatchObject({ ok: false, reason: "redirect_not_allowed" });
    },
  );

  it("stops after MAX_HOPS redirects", async () => {
    let n = 0;
    const fetch: FetchLike = async () => redirect(`https://archive.org/loop/${++n}`);
    expect(await fetchCoverSource(SRC, { fetch })).toEqual({ ok: false, reason: "too_many_redirects" });
    expect(n).toBe(MAX_HOPS);
  });

  it("never fetches a source that is not allowed", async () => {
    let called = false;
    const fetch: FetchLike = async () => { called = true; return image(); };
    expect(await fetchCoverSource("https://evil.example/a.jpg", { fetch })).toEqual({ ok: false, reason: "not_allowed" });
    expect(called).toBe(false);
  });

  it("stops reading at the size cap, whatever the headers said", async () => {
    const big = new Uint8Array(64);
    big.set(JPEG);
    const { fetch } = scripted({ [SRC]: () => image(big) });
    expect(await fetchCoverSource(SRC, { fetch, maxBytes: 32 })).toEqual({ ok: false, reason: "too_large" });
    const declared = scripted({ [SRC]: () => image(JPEG, { "content-length": "999999999" }) });
    expect(await fetchCoverSource(SRC, { fetch: declared.fetch })).toEqual({ ok: false, reason: "too_large" });
  });

  it("refuses bytes that are not an image, and non-2xx answers", async () => {
    const html = scripted({ [SRC]: () => new Response("<html>not a cover</html>", { status: 200 }) });
    expect(await fetchCoverSource(SRC, { fetch: html.fetch })).toEqual({ ok: false, reason: "not_an_image" });
    const gone = scripted({ [SRC]: () => new Response(null, { status: 404 }) });
    expect(await fetchCoverSource(SRC, { fetch: gone.fetch })).toEqual({ ok: false, reason: "http" });
  });

  it("an unreachable source is reported, not thrown", async () => {
    const fetch: FetchLike = async () => { throw new TypeError("fetch failed"); };
    expect(await fetchCoverSource(SRC, { fetch })).toEqual({ ok: false, reason: "unreachable" });
  });
});
