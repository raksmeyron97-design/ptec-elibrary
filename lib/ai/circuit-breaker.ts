// lib/ai/circuit-breaker.ts
// A consecutive-failure breaker for the local provider. Pure; the clock is
// injected so the tests can move time without sleeping.
//
// Why it exists: when the Ollama box is down, every assistant request would
// otherwise pay a connection timeout BEFORE falling back to Gemini, and the
// reader would wait a minute for an answer the cloud could have given in two
// seconds. After `threshold` consecutive failures the breaker opens and the
// primary is skipped outright until `cooldownMs` has passed; one request is
// then let through (half-open), and its outcome decides whether the circuit
// closes again or reopens for another cooldown.
//
// It counts CONSECUTIVE failures, not a rate: one slow answer among many good
// ones is a slow answer, not an outage.

export interface CircuitBreakerOptions {
  /** Consecutive failures that open the circuit. */
  threshold: number;
  /** How long the circuit stays open before a trial request is allowed. */
  cooldownMs: number;
  now?: () => number;
}

export interface CircuitBreakerState {
  open: boolean;
  consecutiveFailures: number;
  /** Epoch ms after which a trial request is admitted; null when closed. */
  reopensAt: number | null;
}

export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  private readonly threshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(options: CircuitBreakerOptions) {
    this.threshold = Math.max(1, Math.floor(options.threshold));
    this.cooldownMs = Math.max(0, options.cooldownMs);
    this.now = options.now ?? Date.now;
  }

  /** May a request reach the primary right now? */
  allows(): boolean {
    if (this.openedAt === null) return true;
    // Half-open: the cooldown has elapsed, so let ONE request through. Until
    // it reports back, the circuit stays open for everyone else — otherwise
    // a burst that arrives at the same instant hits a down box together.
    if (this.now() - this.openedAt >= this.cooldownMs) {
      this.openedAt = this.now();
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.threshold) this.openedAt = this.now();
  }

  state(): CircuitBreakerState {
    return {
      open: this.openedAt !== null,
      consecutiveFailures: this.failures,
      reopensAt: this.openedAt === null ? null : this.openedAt + this.cooldownMs,
    };
  }

  reset(): void {
    this.recordSuccess();
  }
}
