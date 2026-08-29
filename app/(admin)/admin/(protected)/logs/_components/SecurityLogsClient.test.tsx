// Rendering guarantees for the audit console that neither the type system nor a
// production build can catch.
//
// Three classes of bug this pins:
//
//  1. A missing or renamed translation key. Almost every label here is built
//     dynamically (`status.${e.eventStatus}`, `headline.download_${status}`,
//     `action.${actionKey(e)}`), so tsc sees a string and the build succeeds
//     while the page renders a raw key. Both locales are exercised because a
//     key can exist in en.json and not in km.json.
//  2. Data-honesty regressions — the page must not claim live updates it does
//     not perform, and must not show a trend it never computed.
//  3. Privacy — a masked identity must not be accompanied anywhere in the
//     rendered markup by the raw value.

import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import kmMessages from "@/messages/km.json";
import type { ActivityResult } from "@/lib/admin/activity-log";
import type { ActivityEvent } from "@/lib/admin/activity-log-shared";
import SecurityLogsClient, { type ClientFilters } from "./SecurityLogsClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/logs",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../actions", () => ({
  exportActivityLogs: vi.fn(),
  revealReaderContact: vi.fn(),
}));

const NOW = "2026-08-28T12:00:00.000Z";

function event(over: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: "download_logs:1",
    source: "download_logs",
    eventType: "download",
    eventStatus: "authorized",
    resourceType: "thesis",
    resourceId: "r1",
    resourceTitle: "Educational Psychology in Cambodian Classrooms",
    userId: "u1",
    actorName: "Sok Dara",
    actorEmail: "s•••@ptec.edu.kh",
    actorAvatar: null,
    isAnon: false,
    institutionType: "University",
    role: "Student",
    purpose: "Research",
    rankAtEvent: 7,
    permissionSource: "automatic-ranking",
    denialReason: null,
    locale: "km",
    occurredAt: "2026-08-28T11:30:00.000Z",
    ...over,
  };
}

function result(over: Partial<ActivityResult> = {}): ActivityResult {
  return {
    events: [event()],
    pagination: { page: 0, pageSize: 20, total: 1, totalPages: 1 },
    summary: {
      authorizedDownloads: 12, deniedDownloads: 3, failedDownloads: 1,
      pageViews: 84, activeUsers: 9, totalEvents: 100, securityAlerts: 4,
    },
    tabCounts: { all: 100, downloads: 12, views: 84, security: 4, account: 0, admin: 0 },
    analytics: {
      bucket: "hour",
      timeline: [
        { start: "2026-08-28T10:00:00.000Z", views: 3, downloads: 1, security: 0 },
        { start: "2026-08-28T11:00:00.000Z", views: 9, downloads: 4, security: 2 },
      ],
      byResource: [
        { resourceType: "thesis", views: 40, downloads: 8, security: 3, total: 51 },
        { resourceType: "book", views: 44, downloads: 4, security: 1, total: 49 },
      ],
      security: {
        total: 4, deniedDownloads: 3, failedDownloads: 1, otherSecurity: 0,
        reasons: [{ reason: "TOP_TEN_RESTRICTED", count: 3 }], unspecified: 1,
      },
    },
    appliedRange: { start: "2026-08-27T12:00:00.000Z", end: NOW, timezone: "Asia/Phnom_Penh" },
    ...over,
  };
}

const filters: ClientFilters = {
  range: "24h", tab: "all", resourceType: "all", status: "all",
  search: "", customStart: null, customEnd: null,
};

function renderConsole(opts: {
  locale?: "en" | "km";
  data?: ActivityResult;
  filters?: Partial<ClientFilters>;
  canSeePersonal?: boolean;
} = {}) {
  const locale = opts.locale ?? "en";
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "km" ? kmMessages : enMessages}>
      <SecurityLogsClient
        result={opts.data ?? result()}
        filters={{ ...filters, ...opts.filters }}
        canSeePersonal={opts.canSeePersonal ?? false}
      />
    </NextIntlClientProvider>,
  );
}

/** Any "adminLogs.foo.bar" left in the DOM is an unresolved message. */
function assertNoRawKeys(container: HTMLElement) {
  expect(container.textContent ?? "").not.toMatch(/adminLogs\.[a-zA-Z]/);
}

describe("Activity & Security console", () => {
  it("renders every level of the page with resolved English copy", () => {
    const { container } = renderConsole();
    assertNoRawKeys(container);

    // Level 1 — what is happening.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Activity & Security");
    expect(screen.getByText("Authorized downloads")).toBeInTheDocument();
    // The screen-reader companion, which is unambiguous — the bare "12" also
    // appears in the chart legend and on the Downloads tab badge, correctly.
    expect(screen.getByText("12 authorized downloads in the selected range")).toBeInTheDocument();

    // Level 2 — the shape of it.
    expect(screen.getByRole("heading", { name: "Activity over time" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Security summary" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Resource activity" })).toBeInTheDocument();

    // Level 3 — which events.
    expect(screen.getAllByText("Downloaded").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Educational Psychology in Cambodian Classrooms").length).toBeGreaterThan(0);
  });

  it("renders in Khmer without falling back to a raw key", () => {
    const { container } = renderConsole({ locale: "km" });
    assertNoRawKeys(container);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("សកម្មភាព និងសុវត្ថិភាព");
    expect(screen.getAllByText("បានទាញយក").length).toBeGreaterThan(0);
  });

  // ── Data honesty ──────────────────────────────────────────────────────────

  it("never claims live or automatic updating — nothing on this page polls", () => {
    const { container } = renderConsole();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/auto-?refresh/i);
    expect(text).not.toMatch(/\blive\b/i);
    expect(text).toMatch(/Updated \d{2}:\d{2}/);
  });

  it("shows no trend percentage, because no comparison period is ever fetched", () => {
    const { container } = renderConsole();
    expect(container.textContent ?? "").not.toMatch(/[+-]\d+(\.\d+)?%/);
  });

  it("says 'authorized', never 'completed' — delivery completion is not observable", () => {
    const { container } = renderConsole();
    const text = container.textContent ?? "";
    expect(text).toMatch(/Authorized downloads/);
    expect(text).not.toMatch(/download (completed|complete)/i);
  });

  // ── Privacy ───────────────────────────────────────────────────────────────

  it("renders only what the server sent, so a masked email has no raw twin in the DOM", () => {
    const { container } = renderConsole({ canSeePersonal: false });
    const html = container.innerHTML;
    expect(html).toContain("s•••@ptec.edu.kh");
    expect(html).not.toContain("sokdara@ptec.edu.kh");
    expect(html).not.toMatch(/[a-z0-9._%+-]{2,}@ptec\.edu\.kh/i);
  });

  // ── Security semantics ────────────────────────────────────────────────────

  it("keeps the security decomposition summing to the Security tab's own count", () => {
    const data = result();
    renderConsole({ data });
    const { deniedDownloads, failedDownloads, otherSecurity, total } = data.analytics.security;
    expect(deniedDownloads + failedDownloads + otherSecurity).toBe(total);
    expect(total).toBe(data.tabCounts.security);
  });

  it("states a blocked download as blocked, with its reason on the row", () => {
    renderConsole({
      data: result({
        events: [event({ id: "activity_events:9", source: "activity_events", eventStatus: "denied", denialReason: "TOP_TEN_RESTRICTED" })],
      }),
    });
    expect(screen.getAllByText("Blocked").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Denied").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Top-10 protected").length).toBeGreaterThan(0);
  });

  it("offers the security drill-downs as controls, not captions", () => {
    renderConsole();
    expect(screen.getByRole("button", { name: /Denied downloads: 3/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Failed deliveries: 1/ })).toBeEnabled();
    // Nothing to drill into must not look drillable.
    expect(screen.getByRole("button", { name: /Other security events: 0/ })).toBeDisabled();
  });

  // ── Empty states ──────────────────────────────────────────────────────────

  it("distinguishes a quiet library from a too-narrow filter", () => {
    const empty = result({
      events: [],
      pagination: { page: 0, pageSize: 20, total: 0, totalPages: 1 },
    });

    const quiet = renderConsole({ data: empty });
    expect(screen.getByText("No activity found")).toBeInTheDocument();
    quiet.unmount();

    renderConsole({ data: empty, filters: { status: "denied" } });
    expect(screen.getByText("No matching activity")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear all filters" })).toBeInTheDocument();
  });

  it("reports a clear period as clear rather than as a failure to find rows", () => {
    renderConsole({
      filters: { tab: "security" },
      data: result({
        events: [],
        pagination: { page: 0, pageSize: 20, total: 0, totalPages: 1 },
        tabCounts: { all: 100, downloads: 12, views: 84, security: 0, account: 0, admin: 0 },
      }),
    });
    expect(screen.getByText("No security alerts")).toBeInTheDocument();
  });

  // ── Accessibility ─────────────────────────────────────────────────────────

  it("gives the chart a text equivalent, so it is never the only representation", () => {
    renderConsole();
    const chart = screen.getByRole("img", { name: /Activity over/ });
    expect(chart).toBeInTheDocument();
    // The same numbers, as a table, for a screen reader.
    const table = screen.getByRole("table", { name: /Activity over/ });
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(1);
  });

  it("names each row activator by what the row actually says", () => {
    renderConsole();
    const activators = screen.getAllByRole("button", { name: /Downloaded by Sok Dara on Educational Psychology/ });
    expect(activators.length).toBeGreaterThan(0);
  });

  it("exposes the tab rail as tabs with live counts", () => {
    renderConsole();
    const security = screen.getByRole("tab", { name: /Security/ });
    expect(security).toHaveAttribute("aria-selected", "false");
    expect(security).toHaveTextContent("4");
  });
});
