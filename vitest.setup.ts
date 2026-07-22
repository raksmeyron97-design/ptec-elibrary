import '@testing-library/jest-dom';
import { vi } from 'vitest';

// ── Web Storage ────────────────────────────────────────────────────────────
// Node 24+ exposes its own experimental `localStorage`/`sessionStorage`
// globals that evaluate to `undefined` unless the process was started with
// `--localstorage-file`. Those globals shadow the working implementations
// jsdom provides, so on a new Node every test that touches storage dies with
// "Cannot read properties of undefined (reading 'clear')". Restore a
// spec-shaped in-memory Storage when (and only when) that has happened, so the
// suite behaves identically on Node 20 and Node 26.
// Backing map per storage instance, reachable from prototype methods.
const storageData = new WeakMap<object, Map<string, string>>();
const dataOf = (self: object) => storageData.get(self) ?? new Map<string, string>();

/**
 * Methods are installed on `Storage.prototype` rather than on the instance so
 * that `vi.spyOn(Storage.prototype, 'getItem')` — how the reader-preference
 * tests simulate blocked storage — still intercepts calls, and `mockRestore()`
 * puts this implementation back.
 */
function installStoragePrototype(proto: object) {
  Object.defineProperties(proto, {
    length: {
      configurable: true,
      get(this: object) {
        return dataOf(this).size;
      },
    },
    key: {
      configurable: true,
      writable: true,
      value(this: object, index: number) {
        return [...dataOf(this).keys()][index] ?? null;
      },
    },
    getItem: {
      configurable: true,
      writable: true,
      value(this: object, k: string) {
        const store = dataOf(this);
        return store.has(String(k)) ? store.get(String(k))! : null;
      },
    },
    setItem: {
      configurable: true,
      writable: true,
      value(this: object, k: string, v: string) {
        dataOf(this).set(String(k), String(v));
      },
    },
    removeItem: {
      configurable: true,
      writable: true,
      value(this: object, k: string) {
        dataOf(this).delete(String(k));
      },
    },
    clear: {
      configurable: true,
      writable: true,
      value(this: object) {
        dataOf(this).clear();
      },
    },
  });
}

function installStorage(key: 'localStorage' | 'sessionStorage') {
  if (typeof (window as unknown as Record<string, unknown>)[key] !== 'undefined') return;

  const StorageCtor = (globalThis as { Storage?: { prototype: object } }).Storage;
  const proto = StorageCtor?.prototype ?? Object.prototype;
  installStoragePrototype(proto);

  const storage = Object.create(proto) as Storage;
  storageData.set(storage, new Map<string, string>());

  for (const target of [window, globalThis]) {
    Object.defineProperty(target, key, {
      configurable: true,
      writable: true,
      value: storage,
    });
  }
}

installStorage('localStorage');
installStorage('sessionStorage');

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
