import { afterEach, describe, expect, it } from "vitest";
import {
  MAX_RECENT,
  RECENTLY_VIEWED_KEY,
  clearRecentlyViewed,
  readRecentlyViewed,
  recordRecentlyViewed,
} from "./recently-viewed";

describe("recently viewed books", () => {
  afterEach(() => clearRecentlyViewed());

  it("keeps the newest view first and never lists a book twice", () => {
    recordRecentlyViewed({ slug: "a", title: "A" }, 1);
    recordRecentlyViewed({ slug: "b", title: "B" }, 2);
    recordRecentlyViewed({ slug: "a", title: "A" }, 3);
    expect(readRecentlyViewed().map((b) => b.slug)).toEqual(["a", "b"]);
    expect(readRecentlyViewed()[0].viewedAt).toBe(3);
  });

  it(`caps the list at ${MAX_RECENT}`, () => {
    for (let i = 0; i < MAX_RECENT + 5; i++) recordRecentlyViewed({ slug: `s${i}`, title: `T${i}` }, i);
    const list = readRecentlyViewed();
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0].slug).toBe(`s${MAX_RECENT + 4}`);
  });

  it("ignores an entry without a slug or title", () => {
    recordRecentlyViewed({ slug: "", title: "No slug" });
    recordRecentlyViewed({ slug: "x", title: "" });
    expect(readRecentlyViewed()).toEqual([]);
  });

  it("survives corrupt or foreign storage rather than throwing", () => {
    window.localStorage.setItem(RECENTLY_VIEWED_KEY, "{not json");
    expect(readRecentlyViewed()).toEqual([]);
    window.localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify([{ slug: 1 }, { slug: "ok", title: "Ok", viewedAt: 1 }]));
    expect(readRecentlyViewed().map((b) => b.slug)).toEqual(["ok"]);
  });
});
