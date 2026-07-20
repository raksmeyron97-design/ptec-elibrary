/** Pure, client-safe helpers for the /admin/storage module. No "server-only"
 *  import here — shared between server and client components. */

import { STORAGE_CATEGORIES, type StorageCategory } from "@/lib/types/storage";

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${exponent === 0 ? value : value.toFixed(value < 10 ? 1 : 0)} ${units[exponent]}`;
}

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "avif", "gif"]);

export type StorageFileKind = "image" | "pdf" | "other";

export function fileKind(extension: string): StorageFileKind {
  const ext = extension.toLowerCase();
  if (IMAGE_EXTS.has(ext)) return "image";
  if (ext === "pdf") return "pdf";
  return "other";
}

export function isKnownCategory(folder: string): folder is StorageCategory {
  return (STORAGE_CATEGORIES as readonly string[]).includes(folder.split("/")[0] ?? "");
}

export function categoryOf(folder: string): StorageCategory | null {
  const top = folder.split("/")[0];
  return (STORAGE_CATEGORIES as readonly string[]).includes(top ?? "") ? (top as StorageCategory) : null;
}

/** Truncate a long filename in the middle, keeping the extension visible. */
export function truncateMiddle(name: string, max = 32): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 && dot > name.length - 8 ? name.slice(dot) : "";
  const base = ext ? name.slice(0, dot) : name;
  const keep = max - ext.length - 1;
  const head = Math.ceil(keep * 0.6);
  const tail = Math.floor(keep * 0.4);
  return `${base.slice(0, head)}…${base.slice(base.length - tail)}${ext}`;
}

/** Builds a download/preview URL the browser can hit directly through this
 *  app's own proxy route (app/api/admin/storage/[mode]/route.ts) — the
 *  storage service's own URL and service token are never exposed to the
 *  browser. Client-safe (no secrets here — just a string), unlike
 *  lib/storage-client.ts which is "server-only". */
export function adminStorageDownloadHref(storageKey: string, mode: "download" | "preview" = "download") {
  return `/api/admin/storage/${mode}?key=${encodeURIComponent(storageKey)}`;
}

export function formatDateTime(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale === "km" ? "km-KH" : "en-US", {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
