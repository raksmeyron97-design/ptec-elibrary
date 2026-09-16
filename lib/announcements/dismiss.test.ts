// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ANNOUNCEMENT_DISMISS_SCRIPT,
  ANNOUNCEMENT_ID_ATTR,
  DISMISS_STORAGE_KEY,
} from "./dismiss";

/**
 * The script is evaluated, never re-implemented. A second copy of the rule in
 * the test is a second thing to drift, and it is the shipped string that has
 * to behave — this is the same reason `lib/indexing/reconcile.test.ts` pins the
 * SQL digest against the TypeScript one rather than trusting both.
 */
function run(): void {
  new Function(ANNOUNCEMENT_DISMISS_SCRIPT)();
}

const injected = () => document.getElementById("announcement-dismiss")?.textContent ?? null;

beforeEach(() => {
  document.head.innerHTML = "";
  window.localStorage.clear();
});

afterEach(() => {
  document.head.innerHTML = "";
  window.localStorage.clear();
});

describe("the pre-paint dismissal script", () => {
  it("hides exactly the ids this browser has dismissed", () => {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(["abc-123", "DEF_456"]));
    run();
    expect(injected()).toBe(
      `[${ANNOUNCEMENT_ID_ATTR}="abc-123"],[${ANNOUNCEMENT_ID_ATTR}="DEF_456"]{display:none!important}`,
    );
  });

  it("really does hide the row, not merely emit a rule", () => {
    document.body.innerHTML = `<div ${ANNOUNCEMENT_ID_ATTR}="abc-123">gone</div><div ${ANNOUNCEMENT_ID_ATTR}="keep-me">here</div>`;
    window.localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(["abc-123"]));
    run();
    const hidden = document.querySelector(`[${ANNOUNCEMENT_ID_ATTR}="abc-123"]`)!;
    const shown = document.querySelector(`[${ANNOUNCEMENT_ID_ATTR}="keep-me"]`)!;
    expect(getComputedStyle(hidden).display).toBe("none");
    expect(getComputedStyle(shown).display).not.toBe("none");
    document.body.innerHTML = "";
  });

  it("writes nothing at all when there is nothing to hide", () => {
    run();
    expect(injected()).toBeNull();

    window.localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify([]));
    run();
    expect(injected()).toBeNull();
  });

  // A dismissal list is the reader's own storage, not a remote attacker's —
  // but it is the one value that becomes CSS SOURCE TEXT, and a value that
  // becomes syntax is validated whoever wrote it.
  it("drops any id that is not a plain identifier, rather than escaping it", () => {
    window.localStorage.setItem(
      DISMISS_STORAGE_KEY,
      JSON.stringify(['"]{}*{color:red}', "a b", "évil", "x".repeat(65), "", null, 7, "good-1"]),
    );
    run();
    expect(injected()).toBe(`[${ANNOUNCEMENT_ID_ATTR}="good-1"]{display:none!important}`);
  });

  it("survives unreadable or nonsense storage instead of taking the page down", () => {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, "{not json");
    expect(run).not.toThrow();
    expect(injected()).toBeNull();

    window.localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify({ a: 1 }));
    expect(run).not.toThrow();
    expect(injected()).toBeNull();
  });

  it("caps the selector so a long-lived profile cannot write an unbounded stylesheet", () => {
    const ids = Array.from({ length: 200 }, (_, i) => `id-${i}`);
    window.localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(ids));
    run();
    expect(injected()!.split(",").length).toBe(50);
  });

  it("is self-contained: no imports, no framework, safe to inline", () => {
    expect(ANNOUNCEMENT_DISMISS_SCRIPT).not.toMatch(/\bimport\b|\brequire\(/);
    expect(ANNOUNCEMENT_DISMISS_SCRIPT).toContain("try");
    // </script> in an inlined string would close the tag it lives in.
    expect(ANNOUNCEMENT_DISMISS_SCRIPT).not.toContain("</script");
  });
});
