// lib/rate-limit.ts

type RateLimitStore = Map<string, number[]>;

const store: RateLimitStore = new Map();

/**
 * Basic in-memory rate limiter using a sliding window.
 * Note: In serverless environments (like Vercel), this state may be reset during cold starts.
 * For true distributed rate limiting, consider Upstash Redis or Vercel KV.
 * 
 * @param ip Client IP address
 * @param limit Maximum allowed requests within the window
 * @param windowMs Time window in milliseconds
 * @returns { success: boolean, remaining: number, reset: number }
 */
export function rateLimit(ip: string, limit: number, windowMs: number) {
  const now = Date.now();
  
  // Clean up old timestamps for this IP
  let timestamps = store.get(ip) || [];
  timestamps = timestamps.filter(time => now - time < windowMs);
  
  if (timestamps.length >= limit) {
    const oldestTimestamp = timestamps[0];
    const resetTime = oldestTimestamp + windowMs;
    return {
      success: false,
      remaining: 0,
      reset: resetTime,
    };
  }

  // Add current request
  timestamps.push(now);
  store.set(ip, timestamps);

  // Periodically clean up the whole store to prevent memory leaks in long-running instances
  if (store.size > 10000) {
    // Keep only the most recent 5000 active IPs
    const sortedEntries = Array.from(store.entries())
      .sort((a, b) => (b[1][b[1].length - 1] || 0) - (a[1][a[1].length - 1] || 0))
      .slice(0, 5000);
    store.clear();
    for (const [k, v] of sortedEntries) store.set(k, v);
  }

  return {
    success: true,
    remaining: limit - timestamps.length,
    reset: now + windowMs,
  };
}
