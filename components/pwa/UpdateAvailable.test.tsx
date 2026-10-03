import { act, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import enMessages from "@/messages/en.json";
import UpdateAvailable, { UPDATE_PROMPT_QUIET_MS } from "./UpdateAvailable";

// A page already controlled by an older worker, with a newer one WAITING —
// the one situation the prompt exists for.
function stubWaitingWorker() {
  const waiting = { postMessage: vi.fn() };
  const registration = { waiting, installing: null, addEventListener: vi.fn() };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      controller: {},
      getRegistration: () => Promise.resolve(registration),
      addEventListener: vi.fn(),
    },
  });
  return waiting;
}

function renderPrompt() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <UpdateAvailable />
    </NextIntlClientProvider>,
  );
}

const message = enMessages.pwaUpdate.message;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("UpdateAvailable — the first ten seconds of a visit are quiet", () => {
  it("holds a waiting update until the quiet period ends, then offers it", async () => {
    vi.spyOn(performance, "now").mockReturnValue(1_000);
    stubWaitingWorker();
    renderPrompt();
    await act(async () => {
      await Promise.resolve();
    });
    // The worker is waiting, but the visit is one second old.
    expect(screen.queryByText(message)).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(UPDATE_PROMPT_QUIET_MS - 1_000 - 1);
    });
    expect(screen.queryByText(message)).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it("offers it at once when the visit is already past the quiet period", async () => {
    vi.spyOn(performance, "now").mockReturnValue(UPDATE_PROMPT_QUIET_MS + 5_000);
    stubWaitingWorker();
    renderPrompt();
    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it("never reloads on its own — the button only asks the worker to take over", async () => {
    vi.spyOn(performance, "now").mockReturnValue(UPDATE_PROMPT_QUIET_MS + 1);
    const waiting = stubWaitingWorker();
    renderPrompt();
    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });
    expect(waiting.postMessage).not.toHaveBeenCalled();
    await act(async () => {
      screen.getByRole("button", { name: enMessages.pwaUpdate.update }).click();
    });
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });

  it("docks above the phone tab bar", async () => {
    vi.spyOn(performance, "now").mockReturnValue(UPDATE_PROMPT_QUIET_MS + 1);
    stubWaitingWorker();
    renderPrompt();
    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });
    expect(screen.getByRole("status").className).toContain("var(--ptec-mobile-nav-clearance)");
  });
});
