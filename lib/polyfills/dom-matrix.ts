/* lib/polyfills/dom-matrix.ts
 *
 * A 2D-only `DOMMatrix` for Node, because pdfjs needs one and the standalone
 * container has no way to get it.
 *
 * `pdfjs-dist/legacy/build/pdf.mjs` evaluates `new DOMMatrix()` at MODULE
 * SCOPE (`const SCALE_MATRIX = new DOMMatrix()`), and its worker builds one to
 * flip a Type 3 bitmap glyph into text space:
 *
 *     const { a, b, c, d, e, f } =
 *       new DOMMatrix().scaleSelf(1 / width, -1 / height).translateSelf(0, -height);
 *
 * Node has never had `DOMMatrix`. pdfjs covers that itself — but only through
 * `@napi-rs/canvas`, an OPTIONAL dependency it loads with
 * `createRequire(import.meta.url)`. That is the same invisibility that lost us
 * `pdf.worker.mjs` (see lib/pdf-worker-tracing.test.ts): Next's file tracer
 * cannot follow a runtime `require`, so the package is absent from
 * `.next/standalone`, `globalThis.DOMMatrix` stays undefined, and importing
 * pdf.mjs throws `ReferenceError: DOMMatrix is not defined` on its first
 * evaluation. Every local run passes, because a development `node_modules`
 * has the native binary sitting there.
 *
 * Tracing `@napi-rs/canvas` instead was the alternative and was rejected: it
 * is a platform-specific native binary shipped to satisfy two constructors,
 * and text extraction rasterizes nothing.
 *
 * WHAT THIS IS NOT: a spec-complete DOMMatrix. It is affine 2D — the six
 * components pdfjs reads — and any operation that would produce a genuinely 3D
 * matrix THROWS rather than returning a plausible 2D answer. `Path2D` is not
 * polyfilled either; pdfjs only warns about it and only rendering needs it.
 * If a future pdfjs starts asking for more, the failure is a loud one.
 */

/** The six components of a 2D affine matrix, in DOMMatrix's own order. */
export type Matrix2D = { a: number; b: number; c: number; d: number; e: number; f: number };

function isMatrixLike(value: unknown): value is Matrix2D {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  return ["a", "b", "c", "d", "e", "f"].every((k) => typeof m[k] === "number");
}

/**
 * `this = this * other`, the post-multiply every DOMMatrix `*Self` method
 * performs. Column-vector convention, matching CSS/canvas:
 *
 *     | a c e |
 *     | b d f |
 *     | 0 0 1 |
 */
function postMultiply(self: DomMatrix2D, m: Matrix2D): void {
  const { a, b, c, d, e, f } = self;
  self.a = a * m.a + c * m.b;
  self.b = b * m.a + d * m.b;
  self.c = a * m.c + c * m.d;
  self.d = b * m.c + d * m.d;
  self.e = a * m.e + c * m.f + e;
  self.f = b * m.e + d * m.f + f;
}

/** A 3D operation on a 2D-only matrix is a silently wrong answer. Refuse it. */
function assert2D(condition: boolean, op: string): void {
  if (!condition) {
    throw new TypeError(`DOMMatrix polyfill: ${op} is 2D-only (see lib/polyfills/dom-matrix.ts)`);
  }
}

export class DomMatrix2D implements Matrix2D {
  // Plain writable fields, not accessors: pdfjs assigns `SCALE_MATRIX.a` and
  // `SCALE_MATRIX.d` directly.
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  /**
   * Accepts nothing (identity), a six-number array `[a, b, c, d, e, f]`, or
   * anything carrying numeric `a`–`f` — which covers another DOMMatrix and the
   * plain transform objects pdfjs passes around. A 16-number (3D) array and a
   * CSS transform string both throw; neither is reachable from text
   * extraction, and guessing at one would be worse than stopping.
   */
  constructor(init?: number[] | Matrix2D | null) {
    if (init === undefined || init === null) return;
    if (Array.isArray(init)) {
      assert2D(init.length === 6, `construction from a ${init.length}-element array`);
      assert2D(
        init.every((n) => typeof n === "number"),
        "construction from a non-numeric array",
      );
      [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      return;
    }
    if (isMatrixLike(init)) {
      ({ a: this.a, b: this.b, c: this.c, d: this.d, e: this.e, f: this.f } = init);
      return;
    }
    throw new TypeError("DOMMatrix polyfill: unsupported initializer (expected [a,b,c,d,e,f])");
  }

  get m11(): number { return this.a; }
  set m11(v: number) { this.a = v; }
  get m12(): number { return this.b; }
  set m12(v: number) { this.b = v; }
  get m21(): number { return this.c; }
  set m21(v: number) { this.c = v; }
  get m22(): number { return this.d; }
  set m22(v: number) { this.d = v; }
  get m41(): number { return this.e; }
  set m41(v: number) { this.e = v; }
  get m42(): number { return this.f; }
  set m42(v: number) { this.f = v; }

  // The rest of the 4x4 is fixed for a 2D matrix. Kept read-only: a write here
  // is a 3D operation, and silently dropping it is the failure mode this file
  // exists to avoid.
  get m13(): number { return 0; }
  get m14(): number { return 0; }
  get m23(): number { return 0; }
  get m24(): number { return 0; }
  get m31(): number { return 0; }
  get m32(): number { return 0; }
  get m33(): number { return 1; }
  get m34(): number { return 0; }
  get m43(): number { return 0; }
  get m44(): number { return 1; }

  get is2D(): boolean { return true; }

  get isIdentity(): boolean {
    return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0;
  }

  multiplySelf(other: Matrix2D): this {
    postMultiply(this, other);
    return this;
  }

  /**
   * `scaleY` defaults to `scaleX` (per spec — NOT to 1), and a non-unit
   * `scaleZ` or `originZ` is a 3D operation.
   */
  scaleSelf(scaleX = 1, scaleY?: number, scaleZ = 1, originX = 0, originY = 0, originZ = 0): this {
    assert2D(scaleZ === 1 && originZ === 0, "scaleSelf with a z component");
    const sy = scaleY ?? scaleX;
    if (originX !== 0 || originY !== 0) {
      this.translateSelf(originX, originY);
      postMultiply(this, { a: scaleX, b: 0, c: 0, d: sy, e: 0, f: 0 });
      this.translateSelf(-originX, -originY);
      return this;
    }
    postMultiply(this, { a: scaleX, b: 0, c: 0, d: sy, e: 0, f: 0 });
    return this;
  }

  translateSelf(tx = 0, ty = 0, tz = 0): this {
    assert2D(tz === 0, "translateSelf with a z component");
    postMultiply(this, { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty });
    return this;
  }

  scale(scaleX = 1, scaleY?: number, scaleZ = 1, originX = 0, originY = 0, originZ = 0): DomMatrix2D {
    return new DomMatrix2D(this).scaleSelf(scaleX, scaleY, scaleZ, originX, originY, originZ);
  }

  translate(tx = 0, ty = 0, tz = 0): DomMatrix2D {
    return new DomMatrix2D(this).translateSelf(tx, ty, tz);
  }

  toString(): string {
    return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
  }
}

/**
 * Mount the polyfill on `globalThis`, once, only when the runtime has no
 * `DOMMatrix` of its own.
 *
 * Must run BEFORE `import("pdfjs-dist/.../pdf.mjs")`: pdf.mjs constructs one
 * during module evaluation, and it will happily use whatever is already there
 * (its own `@napi-rs/canvas` fallback is guarded by the same `if`), so a real
 * browser/Deno/canvas-backed implementation always wins.
 *
 * Returns true if this call installed it.
 */
export function installDomMatrixPolyfill(): boolean {
  const target = globalThis as { DOMMatrix?: unknown };
  if (target.DOMMatrix !== undefined) return false;
  target.DOMMatrix = DomMatrix2D;
  return true;
}
