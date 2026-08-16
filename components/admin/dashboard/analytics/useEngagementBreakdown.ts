"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ANALYTICS_LIMITS,
  engagementBreakdownCacheKey,
  engagementBreakdownUrl,
  type EngagementBreakdownRequest,
  type EngagementBreakdownResponse,
} from "@/lib/admin/engagement-breakdown";

export class BoundedBreakdownCache {
  private readonly entries = new Map<string, { expiresAt: number; value: EngagementBreakdownResponse }>();

  constructor(
    private readonly maximum: number = ANALYTICS_LIMITS.maxClientCacheEntries,
    private readonly ttlMs: number = ANALYTICS_LIMITS.clientCacheTtlMs,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): EngagementBreakdownResponse | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: EngagementBreakdownResponse): void {
    this.entries.delete(key);
    this.entries.set(key, { expiresAt: this.now() + this.ttlMs, value });
    while (this.entries.size > this.maximum) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) break;
      this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

const cache = new BoundedBreakdownCache();
let activeController: AbortController | null = null;

export type EngagementBreakdownLoadState =
  | { status: "idle"; data: null; error: null }
  | { status: "loading"; data: null; error: null }
  | { status: "success"; data: EngagementBreakdownResponse; error: null }
  | { status: "error"; data: null; error: "timeout" | "request" };

type SettledState = Extract<EngagementBreakdownLoadState, { status: "success" | "error" }>;
type StoredState = { key: string; retryToken: number; value: SettledState };

export function clearEngagementBreakdownCache(): void {
  cache.clear();
  activeController?.abort();
  activeController = null;
}

export function useEngagementBreakdown(request: EngagementBreakdownRequest | null) {
  const [retryState, setRetryState] = useState<{ key: string | null; token: number }>({
    key: null,
    token: 0,
  });
  const [settled, setSettled] = useState<StoredState | null>(null);
  const key = request ? engagementBreakdownCacheKey(request) : null;
  const retryToken = retryState.key === key ? retryState.token : 0;

  useEffect(() => {
    if (!request || !key) return;
    let cancelled = false;
    activeController?.abort();

    const cached = retryToken === 0 ? cache.get(key) : null;
    if (cached) {
      // Keep effects free of synchronous state cascades while still resolving
      // a cache hit before the browser's next paint in normal operation.
      queueMicrotask(() => {
        if (!cancelled) {
          setSettled({
            key,
            retryToken,
            value: { status: "success", data: cached, error: null },
          });
        }
      });
      return () => {
        cancelled = true;
      };
    }

    const controller = new AbortController();
    activeController = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, ANALYTICS_LIMITS.requestTimeoutMs);

    fetch(engagementBreakdownUrl(request), {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<EngagementBreakdownResponse>;
      })
      .then((data) => {
        if (controller.signal.aborted || cancelled) return;
        cache.set(key, data);
        setSettled({
          key,
          retryToken,
          value: { status: "success", data, error: null },
        });
      })
      .catch((error: unknown) => {
        if ((controller.signal.aborted && !timedOut) || cancelled) return;
        setSettled({
          key,
          retryToken,
          value: {
            status: "error",
            data: null,
            error: timedOut ? "timeout" : "request",
          },
        });
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          // The route emits structured diagnostics; do not log URLs or filters
          // in the browser where they may contain department text.
        }
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (activeController === controller) activeController = null;
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
      if (activeController === controller) activeController = null;
    };
  }, [key, request, retryToken]);

  const retry = useCallback(() => {
    setRetryState((current) => ({
      key,
      token: current.key === key ? current.token + 1 : 1,
    }));
  }, [key]);
  const value: EngagementBreakdownLoadState = !request || !key
    ? { status: "idle", data: null, error: null }
    : settled?.key === key && settled.retryToken === retryToken
      ? settled.value
      : { status: "loading", data: null, error: null };
  return { ...value, retry };
}
