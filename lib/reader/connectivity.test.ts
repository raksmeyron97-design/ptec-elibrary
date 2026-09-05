import { describe, expect, it } from "vitest";
import {
  INITIAL_CONNECTIVITY,
  backoffMs,
  connectivityBadge,
  isTransientPdfError,
  mayFetch,
  nextProbeDelay,
  reduceConnectivity,
  shouldReloadAfterProbe,
  type ConnectivityEvent,
  type ConnectivityState,
} from "./connectivity";

const run = (events: ConnectivityEvent[], from: ConnectivityState = INITIAL_CONNECTIVITY) =>
  events.reduce(reduceConnectivity, from);

describe("connectivity model", () => {
  it("treats only network, rate-limit and server failures as transient", () => {
    expect(isTransientPdfError("network")).toBe(true);
    expect(isTransientPdfError("rateLimited")).toBe(true);
    expect(isTransientPdfError("server")).toBe(true);
    expect(isTransientPdfError("missing")).toBe(false);
    expect(isTransientPdfError("permission")).toBe(false);
    expect(isTransientPdfError("invalid")).toBe(false);
    expect(isTransientPdfError("unknown")).toBe(false);
  });

  it("backs off exponentially and caps at the last step", () => {
    expect([0, 1, 2, 3, 4, 9].map((a) => backoffMs(a))).toEqual([2000, 4000, 8000, 16000, 30000, 30000]);
    expect(backoffMs(-1)).toBe(2000);
  });

  it("going offline stops fetching without demanding a reload if nothing failed", () => {
    const s = run([{ type: "browserOffline" }]);
    expect(s.status).toBe("offline");
    expect(mayFetch(s)).toBe(false);
    expect(s.needsReload).toBe(false);
    expect(s.transitions).toBe(1);
    // The browser's own event is the trigger; no timer while it says offline.
    expect(nextProbeDelay(s)).toBeNull();
    // Back online without a failure: a probe confirms, no reload follows.
    const back = run([{ type: "browserOnline" }, { type: "probeStart" }, { type: "probeOk" }], s);
    expect(back.status).toBe("online");
    expect(shouldReloadAfterProbe(back)).toBe(false);
  });

  it("a failed page load marks the document for one reload after a confirmed probe", () => {
    const s = run([{ type: "loadFailed", kind: "network" }]);
    expect(s.status).toBe("offline");
    expect(s.needsReload).toBe(true);
    expect(s.transitions).toBe(1);
    // navigator.onLine still says online, so probe on the backoff schedule.
    expect(nextProbeDelay(s)).toBe(2000);
    const failing = run([{ type: "probeStart" }, { type: "probeFailed" }], s);
    expect(failing.status).toBe("offline");
    expect(nextProbeDelay(failing)).toBe(4000);
    const ok = run([{ type: "probeStart" }, { type: "probeOk" }], failing);
    expect(shouldReloadAfterProbe(ok)).toBe(true);
    const done = reduceConnectivity(ok, { type: "reloaded" });
    expect(done.needsReload).toBe(false);
    expect(done.attempt).toBe(0);
  });

  it("a permanent failure is not an outage", () => {
    const s = run([{ type: "loadFailed", kind: "missing" }]);
    expect(s).toEqual(INITIAL_CONNECTIVITY);
  });

  it("repeated failures during one outage count once", () => {
    const s = run([
      { type: "browserOffline" },
      { type: "loadFailed", kind: "network" },
      { type: "loadFailed", kind: "network" },
    ]);
    expect(s.transitions).toBe(1);
    expect(s.needsReload).toBe(true);
  });

  it("the browser saying online does not end the outage by itself", () => {
    const s = run([{ type: "loadFailed", kind: "network" }, { type: "browserOnline" }]);
    expect(s.status).toBe("offline");
    expect(nextProbeDelay(s)).toBe(2000);
  });

  it("does not probe while a probe is already in flight", () => {
    const s = run([{ type: "loadFailed", kind: "network" }, { type: "probeStart" }]);
    expect(s.status).toBe("reconnecting");
    expect(nextProbeDelay(s)).toBeNull();
    expect(mayFetch(s)).toBe(false);
  });

  it("names the badge", () => {
    expect(connectivityBadge(INITIAL_CONNECTIVITY, false)).toBeNull();
    expect(connectivityBadge(INITIAL_CONNECTIVITY, true)).toBe("cached");
    expect(connectivityBadge(run([{ type: "browserOffline" }]), false)).toBe("offline");
    expect(connectivityBadge(run([{ type: "loadFailed", kind: "network" }, { type: "probeStart" }]), false)).toBe("reconnecting");
  });
});
