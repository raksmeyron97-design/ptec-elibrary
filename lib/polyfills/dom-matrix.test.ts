/* lib/polyfills/dom-matrix.test.ts
 *
 * The container's PDF text extractor has no `DOMMatrix`, and pdfjs constructs
 * one during module evaluation. See lib/polyfills/dom-matrix.ts for the full
 * account; this file pins the arithmetic and the mounting.
 *
 * The expected values below are not derived from the implementation — they
 * were produced by a real spec implementation (`@napi-rs/canvas`'s DOMMatrix)
 * and pasted in, so this test would still catch a polyfill that is
 * self-consistently wrong.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DomMatrix2D, installDomMatrixPolyfill } from "./dom-matrix";

const six = (m: DomMatrix2D) => [m.a, m.b, m.c, m.d, m.e, m.f].map((n) => Math.round(n * 1e12) / 1e12);

describe("DomMatrix2D", () => {
  it("defaults to the identity", () => {
    const m = new DomMatrix2D();
    expect(six(m)).toEqual([1, 0, 0, 1, 0, 0]);
    expect(m.isIdentity).toBe(true);
    expect(m.is2D).toBe(true);
  });

  it("computes the exact expression pdfjs's Type 3 glyph compiler evaluates", () => {
    // pdf.worker.mjs:
    //   new DOMMatrix().scaleSelf(1 / width, -1 / height).translateSelf(0, -height)
    const width = 100;
    const height = 200;
    const m = new DomMatrix2D().scaleSelf(1 / width, -1 / height).translateSelf(0, -height);

    expect(six(m)).toEqual([0.01, 0, 0, -0.005, 0, 1]);
    for (const v of six(m)) expect(Number.isFinite(v)).toBe(true);
  });

  it("maps a glyph bitmap's corners into flipped unit space", () => {
    // The behavioural statement behind the numbers above: pixel (0,0) is the
    // TOP-left of the bitmap and must come out at the TOP (y=1) of unit space.
    const [w, h] = [8, 8];
    const { a, b, c, d, e, f } = new DomMatrix2D().scaleSelf(1 / w, -1 / h).translateSelf(0, -h);
    const apply = (x: number, y: number) => [a * x + c * y + e, b * x + d * y + f];

    expect(apply(0, 0)).toEqual([0, 1]);
    expect(apply(w, h)).toEqual([1, 0]);
  });

  it("defaults scaleY to scaleX, not to 1", () => {
    expect(six(new DomMatrix2D().scaleSelf(3))).toEqual([3, 0, 0, 3, 0, 0]);
  });

  it("post-multiplies, so order matters", () => {
    expect(six(new DomMatrix2D().translateSelf(7, -3).scaleSelf(2, 4))).toEqual([2, 0, 0, 4, 7, -3]);
    expect(six(new DomMatrix2D().scaleSelf(2, 4).translateSelf(7, -3))).toEqual([2, 0, 0, 4, 14, -12]);
  });

  it("honours a scale origin", () => {
    expect(six(new DomMatrix2D().scaleSelf(2, 3, 1, 10, 20))).toEqual([2, 0, 0, 3, -10, -40]);
  });

  it("applies operations on top of a seeded matrix", () => {
    const seed = [2, 0.5, -1, 3, 10, -20];
    expect(six(new DomMatrix2D(seed).scaleSelf(1 / 100, -1 / 200).translateSelf(0, -200))).toEqual([
      0.02, 0.005, 0.005, -0.015, 9, -17,
    ]);
    expect(six(new DomMatrix2D(seed).scaleSelf(2, 3, 1, 10, 20))).toEqual([4, 1, -3, 9, 30, -145]);
  });

  it("scale()/translate() return a new matrix and leave the receiver alone", () => {
    const m = new DomMatrix2D([1, 2, 3, 4, 5, 6]);
    const out = m.scale(2, 3).translate(4, 5);

    expect(six(m)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(out).not.toBe(m);
    expect(six(out)).toEqual([2, 4, 9, 12, 58, 82]);
  });

  it("initialises from an array, from a matrix-like object, and from itself", () => {
    const seed = [2, 0.5, -1, 3, 10, -20];
    expect(six(new DomMatrix2D(seed))).toEqual(seed);
    expect(six(new DomMatrix2D({ a: 2, b: 0.5, c: -1, d: 3, e: 10, f: -20 }))).toEqual(seed);
    expect(six(new DomMatrix2D(new DomMatrix2D(seed)))).toEqual(seed);
  });

  it("exposes m11..m44 over the same storage, with a/d writable", () => {
    const m = new DomMatrix2D([1, 2, 3, 4, 5, 6]);
    expect([m.m11, m.m12, m.m21, m.m22, m.m41, m.m42]).toEqual([1, 2, 3, 4, 5, 6]);
    expect([m.m13, m.m14, m.m23, m.m24, m.m31, m.m32, m.m33, m.m34, m.m43, m.m44]).toEqual([
      0, 0, 0, 0, 0, 0, 1, 0, 0, 1,
    ]);

    // pdfjs keeps a module-level SCALE_MATRIX and assigns .a/.d on it.
    const scale = new DomMatrix2D();
    scale.a = 1 / 4;
    scale.d = 1 / 8;
    expect(six(scale)).toEqual([0.25, 0, 0, 0.125, 0, 0]);
  });

  it("refuses a 3D operation rather than answering in 2D", () => {
    // Silently dropping a z component is the failure mode this polyfill's
    // narrowness is supposed to make impossible.
    expect(() => new DomMatrix2D().scaleSelf(1, 1, 2)).toThrow(TypeError);
    expect(() => new DomMatrix2D().translateSelf(1, 1, 2)).toThrow(TypeError);
    expect(() => new DomMatrix2D(new Array(16).fill(0))).toThrow(TypeError);
    expect(() => new DomMatrix2D("matrix(1,0,0,1,0,0)" as unknown as number[])).toThrow(TypeError);
  });
});

describe("installDomMatrixPolyfill", () => {
  const target = globalThis as { DOMMatrix?: unknown };
  let original: unknown;

  beforeEach(() => {
    original = target.DOMMatrix;
    delete target.DOMMatrix;
  });

  afterEach(() => {
    if (original === undefined) delete target.DOMMatrix;
    else target.DOMMatrix = original;
  });

  it("mounts the polyfill when the runtime has none", () => {
    expect(installDomMatrixPolyfill()).toBe(true);
    expect(target.DOMMatrix).toBe(DomMatrix2D);
  });

  it("is idempotent and never displaces a real implementation", () => {
    // pdfjs's own `@napi-rs/canvas` fallback is guarded by the same check, so
    // whichever runs first wins — and a browser/canvas DOMMatrix must always
    // beat this one.
    class Native {}
    target.DOMMatrix = Native;

    expect(installDomMatrixPolyfill()).toBe(false);
    expect(target.DOMMatrix).toBe(Native);
  });
});
