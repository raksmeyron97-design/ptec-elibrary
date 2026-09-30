// @ts-check
/**
 * The ISR cache handler (next.config.ts → cacheHandler).
 *
 * It IS Next's own FileSystemCache, with one change: a path component too long
 * to exist on disk is given a short, stable name. Everything else (memory LRU,
 * tags manifest, revalidation, the on-disk layout of every other entry) is the
 * built-in behaviour, because it is the built-in class.
 *
 * Why: the file-system cache names each entry after its URL. A Khmer thesis
 * title makes a long slug, each Khmer character is 3 bytes of UTF-8, and a
 * file name may not exceed 255 bytes. Production's first thesis slug is 312
 * bytes, so every write of its page failed with
 *   ENAMETOOLONG: mkdir '.next/server/app/en/theses/<slug>.segments/…'
 * and the page lived only in the in-memory LRU: lost on restart, and a logged
 * error on every regeneration.
 *
 * Only components longer than LONG_COMPONENT_BYTES are renamed. Anything that
 * could already be written keeps its exact name, so entries the build wrote and
 * every short slug are untouched.
 */

// Not a public entry point. lib/cache/isr-cache-handler.test.ts round-trips a
// long key through this exact class, so a Next upgrade that moves or reshapes
// it fails CI rather than silently dropping back to ENAMETOOLONG.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Next loads a cache handler by path at runtime; CommonJS is its documented form.
const FileSystemCache = require("next/dist/server/lib/incremental-cache/file-system-cache").default;

/** 255-byte file-name limit, less room for the longest suffix (".segments") and margin. */
const LONG_COMPONENT_BYTES = 240;
/** How much of a renamed component stays readable in `ls`. */
const READABLE_PREFIX_BYTES = 60;
/**
 * Suffixes the cache appends to an entry's name. They are kept outside the
 * rename so that set() can still derive `.meta` and `.segments` from the
 * `.html` path it was given, and get() arrives at the same names from the key.
 * Longest first, so ".segment.rsc" is not read as ".rsc".
 */
const SUFFIXES = [".segment.rsc", ".segments", ".html", ".meta", ".body", ".json", ".rsc"];
/** Next's own per-entry limit on the data cache, skipped for any custom handler. */
const FETCH_CACHE_ITEM_LIMIT = 2 * 1024 * 1024;

// No Node built-ins: the build bundles this file with webpack as well, and a
// `node:` import fails that compile ("UnhandledSchemeError: node:crypto").
const encoder = new TextEncoder();
/** @param {string} s */
const byteLength = (s) => encoder.encode(s).length;

/**
 * A 64-bit fingerprint of `s` as 16 hex digits (cyrb53's mixing, both halves
 * kept). Not a security hash: it only has to tell slugs apart, and it runs
 * with the readable prefix beside it.
 */
function fingerprint(/** @type {string} */ s, /** @type {number} */ seed) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (const ch of s) {
    const c = /** @type {number} */ (ch.codePointAt(0));
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

/** The first code points of `s` that fit in `maxBytes`; never splits a character. */
function utf8Prefix(/** @type {string} */ s, /** @type {number} */ maxBytes) {
  let out = "";
  for (const ch of s) {
    if (byteLength(out + ch) > maxBytes) break;
    out += ch;
  }
  return out;
}

/** One path component, renamed only if it could not exist on disk. */
function shortenComponent(/** @type {string} */ component) {
  const suffix = SUFFIXES.find((s) => component.endsWith(s) && component.length > s.length) ?? "";
  const base = suffix ? component.slice(0, -suffix.length) : component;
  if (byteLength(base) <= LONG_COMPONENT_BYTES) return component;
  // 96 bits across two seeds: ample for a library's worth of slugs.
  const hash = fingerprint(base, 0) + fingerprint(base, 1).slice(0, 8);
  return `${utf8Prefix(base, READABLE_PREFIX_BYTES)}~${hash}${suffix}`;
}

/** A cache key with every over-long path component renamed. Pure and deterministic. */
function shortenCacheKey(/** @type {string} */ key) {
  return key.split("/").map(shortenComponent).join("/");
}

class IsrCacheHandler extends FileSystemCache {
  /**
   * @param {string} key
   * @param {unknown} kind
   */
  getFilePath(key, kind) {
    return super.getFilePath(shortenCacheKey(key), kind);
  }

  /**
   * @param {string} key
   * @param {any} data
   * @param {any} ctx
   */
  async set(key, data, ctx) {
    // IncrementalCache enforces this limit itself only when NO custom handler
    // is configured. Restore it, so that installing this handler changes file
    // names and nothing else.
    if (ctx && ctx.fetchCache && !ctx.isImplicitBuildTimeCache && data) {
      const size = JSON.stringify(data).length;
      if (size > FETCH_CACHE_ITEM_LIMIT) {
        console.warn(
          `Failed to set Next.js data cache for ${ctx.fetchUrl || key}, items over 2MB can not be cached (${size} bytes)`,
        );
        return;
      }
    }
    return super.set(key, data, ctx);
  }
}

module.exports = IsrCacheHandler;
module.exports.shortenCacheKey = shortenCacheKey;
module.exports.LONG_COMPONENT_BYTES = LONG_COMPONENT_BYTES;
