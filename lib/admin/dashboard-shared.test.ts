import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  adminActionLabelKey,
  compareTrend,
  discoveryRates,
  excludeInternal,
  groupConsecutiveActivity,
  isLikelyTestQuery,
  isSensitiveAdminAction,
  parseDashboardFilters,
  pct,
  perResource,
  serializeDashboardFilters,
  uniqueVisitors,
  DEFAULT_FILTERS,
  parseMetric,
  autoGrain,
  aggregateSeries,
  computeHealthPulse,
  rankSearchOpportunities,
  DASHBOARD_METRICS,
  DEFAULT_METRIC,
  type SearchOpportunityInput,
} from "./dashboard-shared";

const NOW = new Date("2026-07-12T10:00:00+07:00");

describe("parseDashboardFilters", () => {
  it("returns defaults for empty params", () => {
    expect(parseDashboardFilters({}, NOW)).toEqual({ ...DEFAULT_FILTERS, from: undefined, to: undefined });
  });

  it("accepts every valid view and range", () => {
    for (const view of ["overview", "content", "search", "audience", "system"]) {
      expect(parseDashboardFilters({ view }, NOW).view).toBe(view);
    }
    for (const range of ["today", "7d", "30d", "90d"]) {
      expect(parseDashboardFilters({ range }, NOW).range).toBe(range);
    }
  });

  it("falls back on unknown enum values", () => {
    const f = parseDashboardFilters(
      { view: "hack", range: "1000d", type: "movie", lang: "fr" },
      NOW,
    );
    expect(f.view).toBe("overview");
    expect(f.range).toBe("30d");
    expect(f.type).toBe("all");
    expect(f.contentLanguage).toBe("all");
  });

  it("validates custom ranges: order, span, future starts", () => {
    const ok = parseDashboardFilters({ range: "custom", from: "2026-06-01", to: "2026-06-30" }, NOW);
    expect(ok).toMatchObject({ range: "custom", from: "2026-06-01", to: "2026-06-30" });

    // from > to
    expect(parseDashboardFilters({ range: "custom", from: "2026-07-01", to: "2026-06-01" }, NOW).range).toBe("30d");
    // > 365 days
    expect(parseDashboardFilters({ range: "custom", from: "2024-01-01", to: "2026-01-01" }, NOW).range).toBe("30d");
    // future start (Asia/Phnom_Penh "today" is 2026-07-12)
    expect(parseDashboardFilters({ range: "custom", from: "2026-07-13", to: "2026-07-14" }, NOW).range).toBe("30d");
    // malformed dates
    expect(parseDashboardFilters({ range: "custom", from: "07/01/2026", to: "2026-07-10" }, NOW).range).toBe("30d");
  });

  it("treats the Phnom Penh day boundary correctly", () => {
    // 2026-07-12T18:00Z is already 2026-07-13 01:00 in Phnom Penh (+07:00),
    // so a custom range starting on the 13th is valid there.
    const lateUtc = new Date("2026-07-12T18:00:00Z");
    const f = parseDashboardFilters({ range: "custom", from: "2026-07-13", to: "2026-07-13" }, lateUtc);
    expect(f.range).toBe("custom");
  });

  it("sanitises the department filter", () => {
    expect(parseDashboardFilters({ dept: "  ស្រាវជ្រាវ  " }, NOW).dept).toBe("ស្រាវជ្រាវ");
    expect(parseDashboardFilters({ dept: "a\u0000b\u001Fc" }, NOW).dept).toBe("abc");
    expect(parseDashboardFilters({ dept: "x".repeat(500) }, NOW).dept).toHaveLength(80);
    expect(parseDashboardFilters({ dept: "" }, NOW).dept).toBeNull();
  });

  it("takes the first value of array params", () => {
    expect(parseDashboardFilters({ range: ["7d", "90d"] }, NOW).range).toBe("7d");
  });

  it("round-trips through serializeDashboardFilters", () => {
    const f = parseDashboardFilters(
      { view: "content", range: "90d", compare: "0", type: "book", dept: "ស្ថិតិ", lang: "km" },
      NOW,
    );
    const qs = serializeDashboardFilters(f);
    const parsed = parseDashboardFilters(Object.fromEntries(new URLSearchParams(qs)), NOW);
    expect(parsed).toEqual(f);
  });

  it("serialises defaults to an empty string", () => {
    expect(serializeDashboardFilters(DEFAULT_FILTERS)).toBe("");
  });

  it("counts active audience filters", () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, type: "book", dept: "x", contentLanguage: "km" })).toBe(3);
  });
});

describe("compareTrend", () => {
  it("marks the zero/zero case hidden — no chip to render", () => {
    expect(compareTrend(0, 0, "vs prev")).toMatchObject({ direction: "neutral", value: "—", mode: "hidden" });
  });

  it("marks previous=0 hidden instead of showing a meaningless delta", () => {
    const t = compareTrend(335, 0, "vs prev");
    expect(t.mode).toBe("hidden");
    expect(t.previous).toBe(0);
  });

  it("uses absolute deltas below the percent base to avoid +2692% drama", () => {
    const t = compareTrend(335, 9, "vs prev");
    expect(t).toMatchObject({ value: "+326", previous: 9, mode: "absolute" });
  });

  it("stays absolute up to a base of 19 (percentages mislead on small bases)", () => {
    expect(compareTrend(143, 19, "vs prev")).toMatchObject({ value: "+124", mode: "absolute" });
    expect(compareTrend(24, 20, "vs prev")).toMatchObject({ value: "+20%", mode: "percent" });
  });

  it("reports a hundredfold jump as a count, not a four-digit percentage", () => {
    // Production, 30 Sep 2026: 25 → 2,512 visitors rendered "+9948%".
    expect(compareTrend(2512, 25, "vs prev")).toMatchObject({ value: "+2487", direction: "up", mode: "absolute" });
    expect(compareTrend(3407, 49, "vs prev")).toMatchObject({ value: "+3358", mode: "absolute" });
    // 999% is still a readable percentage.
    expect(compareTrend(1099, 100, "vs prev")).toMatchObject({ value: "+999%", mode: "percent" });
  });

  it("uses percentages for meaningful bases", () => {
    expect(compareTrend(120, 100, "vs prev")).toMatchObject({ value: "+20%", mode: "percent" });
    expect(compareTrend(80, 100, "vs prev")).toMatchObject({ direction: "down", value: "-20%", mode: "percent" });
  });

  it("flags flat periods", () => {
    expect(compareTrend(50, 50, "vs prev")).toMatchObject({ value: "±0", mode: "percent" });
  });

  it("never pairs a direction with a value that rounds to zero", () => {
    // 314 → 313 is -0.32%, which rounds to -0 and stringifies to "0" — and the
    // "-" is lost, because the sign came from the number. Deriving the arrow
    // from the raw diff therefore painted a red ↘ beside "0%", an arrow its own
    // number contradicted. Direction must follow the ROUNDED figure.
    expect(compareTrend(313, 314, "vs prev")).toMatchObject({
      value: "±0%",
      direction: "neutral",
      mode: "percent",
    });
  });

  it("still reports a sub-1% move that survives rounding", () => {
    // 1000 → 994 is -0.6% → rounds to -1%, a real (if small) decline.
    expect(compareTrend(994, 1000, "vs prev")).toMatchObject({ value: "-1%", direction: "down" });
  });
});

describe("uniqueVisitors", () => {
  it("dedupes signed-in users on id and anonymous on session hash", () => {
    const { visitors, untracked } = uniqueVisitors([
      { userId: "u1", sessionHash: "s1" },
      { userId: "u1", sessionHash: "s2" }, // same user, different hash → 1
      { userId: null, sessionHash: "s3" },
      { userId: null, sessionHash: "s3" }, // same anon session → 1
      { userId: null, sessionHash: null }, // historical row → untracked
    ]);
    // u1 (once, despite two hashes) + anon s3 (once) = 2
    expect(visitors).toBe(2);
    expect(untracked).toBe(1);
  });

  it("never collides user ids with session hashes", () => {
    const { visitors } = uniqueVisitors([
      { userId: "abc", sessionHash: null },
      { userId: null, sessionHash: "abc" },
    ]);
    expect(visitors).toBe(2);
  });
});

describe("discoveryRates", () => {
  it("computes honest pairwise rates", () => {
    const r = discoveryRates({
      searches: 200,
      resultClicks: 30,
      detailViews: 100,
      readerOpens: 20,
      downloadsOrSaves: 10,
    });
    expect(r.searchCtr).toEqual({ pct: 15, comparable: true });
    expect(r.readRate).toEqual({ pct: 20, comparable: true });
    expect(r.downloadRate).toEqual({ pct: 10, comparable: true });
  });

  it("marks ratios over 100% as not comparable instead of showing them", () => {
    const r = discoveryRates({
      searches: 10,
      resultClicks: 30, // more clicks than searches → populations differ
      detailViews: 5,
      readerOpens: 0,
      downloadsOrSaves: 18,
    });
    expect(r.searchCtr.comparable).toBe(false);
    expect(r.downloadRate.comparable).toBe(false);
  });

  it("returns null rates for collecting stages and zero denominators", () => {
    const r = discoveryRates({
      searches: 0,
      resultClicks: 0,
      detailViews: 50,
      readerOpens: null, // collecting
      downloadsOrSaves: 5,
    });
    expect(r.searchCtr.pct).toBeNull();
    expect(r.readRate.pct).toBeNull();
    expect(r.downloadRate.pct).toBe(10);
  });
});

describe("isLikelyTestQuery", () => {
  it("flags keyboard-mash and sentinel strings", () => {
    expect(isLikelyTestQuery("zzzznotfound")).toBe(true);
    expect(isLikelyTestQuery("bugcheck1783326292")).toBe(true);
    expect(isLikelyTestQuery("asdfasdf")).toBe(true);
  });

  it("flags long pasted passages", () => {
    expect(
      isLikelyTestQuery(
        "whining about the students, a message from melanie cooper that appeared here previously",
      ),
    ).toBe(true);
  });

  it("keeps genuine short queries, English and Khmer", () => {
    expect(isLikelyTestQuery("education")).toBe(false);
    expect(isLikelyTestQuery("collecting classroom data for research")).toBe(false);
    expect(isLikelyTestQuery("កម្មវិធីសិក្សា")).toBe(false);
    expect(isLikelyTestQuery("ស្ថិតិ និងវិភាគទិន្នន័យ")).toBe(false);
  });
});

describe("excludeInternal", () => {
  const internal = new Set(["staff-1"]);

  it("drops events from internal staff but keeps anonymous + public", () => {
    const rows = [
      { userId: "staff-1" },
      { userId: "reader-1" },
      { userId: null },
    ];
    expect(excludeInternal(rows, internal)).toEqual([{ userId: "reader-1" }, { userId: null }]);
  });

  it("is a no-op when there are no internal ids", () => {
    const rows = [{ userId: "staff-1" }];
    expect(excludeInternal(rows, new Set())).toBe(rows);
  });
});

describe("adminActionLabelKey", () => {
  it("maps known machine actions to i18n keys", () => {
    expect(adminActionLabelKey("dashboard.export")).toBe("dashboard_export");
    expect(adminActionLabelKey("user_password.reset_sent")).toBe("user_password_reset_sent");
    expect(adminActionLabelKey("USER.INVITE")).toBe("user_invite");
  });

  it("returns null for unknown actions (UI falls back to generic humanising)", () => {
    expect(adminActionLabelKey("weird.custom_thing")).toBeNull();
  });
});

describe("ratio helpers", () => {
  it("pct returns null on zero denominators", () => {
    expect(pct(5, 0)).toBeNull();
    expect(pct(1, 3)).toBeCloseTo(33.3);
  });

  it("perResource returns null with no resources", () => {
    expect(perResource(10, 0)).toBeNull();
    expect(perResource(10, 4)).toBe(2.5);
  });
});

describe("groupConsecutiveActivity", () => {
  const e = (action: string, actor: string, createdAt: string) => ({ action, actor, createdAt });

  it("collapses consecutive identical actions by the same actor within the window", () => {
    const groups = groupConsecutiveActivity([
      e("book.delete", "Ron", "2026-07-14T17:35:00Z"),
      e("book.delete", "Ron", "2026-07-14T17:34:00Z"),
      e("book.delete", "Ron", "2026-07-14T17:30:00Z"),
      e("post.create", "Ron", "2026-07-14T17:00:00Z"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].entries).toHaveLength(3);
    expect(groups[0].head.createdAt).toBe("2026-07-14T17:35:00Z");
    expect(groups[1].entries).toHaveLength(1);
  });

  it("does not group across actors, actions, or gaps beyond the window", () => {
    const groups = groupConsecutiveActivity([
      e("book.delete", "Ron", "2026-07-14T17:35:00Z"),
      e("book.delete", "Dara", "2026-07-14T17:34:00Z"), // other actor
      e("book.delete", "Dara", "2026-07-14T16:00:00Z"), // >15 min gap
    ]);
    expect(groups.map((g) => g.entries.length)).toEqual([1, 1, 1]);
  });

  it("chains: each entry only needs to be close to the previous one", () => {
    const groups = groupConsecutiveActivity([
      e("book.update", "Ron", "2026-07-14T17:30:00Z"),
      e("book.update", "Ron", "2026-07-14T17:20:00Z"),
      e("book.update", "Ron", "2026-07-14T17:10:00Z"), // 20 min from head, 10 from prev
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(3);
  });
});

describe("isSensitiveAdminAction", () => {
  it("flags privacy-relevant actions", () => {
    for (const a of [
      "reader_contact.reveal",
      "user_password.reset_sent",
      "contact_message.read",
      "user.delete",
      "user.suspend",
    ]) {
      expect(isSensitiveAdminAction(a), a).toBe(true);
    }
  });

  it("leaves ordinary content actions unflagged", () => {
    for (const a of ["book.create", "post.update", "dashboard.export", "content.approve"]) {
      expect(isSensitiveAdminAction(a), a).toBe(false);
    }
  });
});

// ── Overview redesign primitives (2026-07-22) ────────────────────────────────

describe("parseMetric", () => {
  it("accepts every known metric", () => {
    for (const m of DASHBOARD_METRICS) {
      expect(parseMetric(m)).toBe(m);
    }
  });

  it("falls back to the default for unknown, missing or array values", () => {
    expect(parseMetric(undefined)).toBe(DEFAULT_METRIC);
    expect(parseMetric("bogus")).toBe(DEFAULT_METRIC);
    expect(parseMetric("")).toBe(DEFAULT_METRIC);
    expect(parseMetric(["visitors", "views"])).toBe("visitors");
    expect(parseMetric(["nope"])).toBe(DEFAULT_METRIC);
  });
});

describe("autoGrain", () => {
  it("keeps short daily ranges as days and today as canonical hours", () => {
    expect(autoGrain(7, "day")).toBe("day");
    expect(autoGrain(30, "day")).toBe("day");
    expect(autoGrain(24, "hour")).toBe("hour");
  });

  it("rolls longer ranges up to weeks and months", () => {
    expect(autoGrain(60, "day")).toBe("week");
    expect(autoGrain(180, "day")).toBe("month");
  });
});

describe("aggregateSeries", () => {
  const daily = [
    { date: "2026-06-29", value: 1 }, // Monday
    { date: "2026-06-30", value: 2 },
    { date: "2026-07-05", value: 4 }, // Sunday, same ISO week
    { date: "2026-07-06", value: 8 }, // next Monday
    { date: "2026-08-02", value: 16 },
  ];

  it("keeps canonical hour and day series unchanged", () => {
    const hourly = [
      { date: "2026-07-22T13:00", value: 2 },
      { date: "2026-07-22T14:00", value: 3 },
    ];
    expect(aggregateSeries(hourly, "hour")).toEqual(hourly);
    expect(aggregateSeries(daily, "day")).toEqual(daily);
  });

  it("sums into canonical Monday-keyed weeks", () => {
    expect(aggregateSeries(daily, "week")).toEqual([
      { date: "2026-06-29", value: 7 },
      { date: "2026-07-06", value: 8 },
      { date: "2026-07-27", value: 16 },
    ]);
  });

  it("sums into canonical calendar months", () => {
    expect(aggregateSeries(daily, "month")).toEqual([
      { date: "2026-06-01", value: 3 },
      { date: "2026-07-01", value: 12 },
      { date: "2026-08-01", value: 16 },
    ]);
  });

  it("takes the peak day for distinct-count series instead of double counting", () => {
    expect(aggregateSeries(daily, "month", "max")).toEqual([
      { date: "2026-06-01", value: 2 },
      { date: "2026-07-01", value: 8 },
      { date: "2026-08-01", value: 16 },
    ]);
  });

  it("handles an empty series", () => {
    expect(aggregateSeries([], "week")).toEqual([]);
  });
});

describe("computeHealthPulse", () => {
  const base = {
    brokenFiles: 0,
    brokenFilesHref: "/admin/data-quality",
    storageOps: 200,
    storageErrors: 0,
    aiRequests: 50,
    aiFailures: 0,
    backupAgeHours: 6,
    systemHref: "/admin?view=system",
  };

  it("reports operational when every check passes", () => {
    const pulse = computeHealthPulse(base);
    expect(pulse.level).toBe("operational");
    expect(pulse.failing).toBe(0);
    expect(pulse.passing).toBe(4);
  });

  it("escalates to critical on a broken file regardless of other checks", () => {
    expect(computeHealthPulse({ ...base, brokenFiles: 3 }).level).toBe("critical");
  });

  it("treats a high storage error rate as critical and a low one as a warning", () => {
    expect(computeHealthPulse({ ...base, storageErrors: 20 }).level).toBe("critical");
    expect(computeHealthPulse({ ...base, storageErrors: 6 }).level).toBe("degraded");
  });

  it("does not judge rates below the minimum sample size", () => {
    const pulse = computeHealthPulse({ ...base, storageOps: 4, storageErrors: 4, aiRequests: 1, aiFailures: 1 });
    const storage = pulse.checks.find((c) => c.key === "storageErrors");
    const ai = pulse.checks.find((c) => c.key === "aiFailures");
    expect(storage?.level).toBe("unknown");
    expect(ai?.level).toBe("unknown");
    expect(pulse.level).toBe("operational"); // remaining checks still pass
  });

  it("warns on a stale backup and escalates when it is a week old", () => {
    expect(computeHealthPulse({ ...base, backupAgeHours: 72 }).level).toBe("degraded");
    expect(computeHealthPulse({ ...base, backupAgeHours: 200 }).level).toBe("critical");
  });

  it("reports unknown when nothing could be measured", () => {
    const pulse = computeHealthPulse({
      ...base,
      storageOps: 0,
      storageErrors: 0,
      aiRequests: 0,
      aiFailures: 0,
      backupAgeHours: null,
      brokenFiles: 0,
    });
    // brokenFiles = 0 is a real measurement, so one check still passes.
    expect(pulse.unknown).toBe(3);
    expect(pulse.passing).toBe(1);
    expect(pulse.level).toBe("operational");
  });
});

describe("rankSearchOpportunities", () => {
  const row = (over: Partial<SearchOpportunityInput> & { term: string }): SearchOpportunityInput => ({
    lang: "en",
    searches: 10,
    prevSearches: 0,
    avgResults: 0,
    clicks: 0,
    ...over,
  });

  it("ignores one-off searches and test queries", () => {
    const out = rankSearchOpportunities([
      row({ term: "chemistry", searches: 2 }),
      row({ term: "zzzzz", searches: 40 }),
      row({ term: "asdf", searches: 40 }),
    ]);
    expect(out).toEqual([]);
  });

  it("classifies zero-result, low-coverage and low-CTR terms", () => {
    const out = rankSearchOpportunities([
      row({ term: "nothing", avgResults: 0 }),
      row({ term: "thin", avgResults: 2 }),
      row({ term: "ignored", avgResults: 40, clicks: 0 }),
      row({ term: "healthy", avgResults: 40, clicks: 8 }),
    ]);
    expect(out.map((o) => [o.term, o.kind])).toEqual([
      ["nothing", "zeroResult"],
      ["thin", "lowCoverage"],
      ["ignored", "lowClickThrough"],
    ]);
  });

  it("ranks severity above raw volume and caps the list", () => {
    const out = rankSearchOpportunities(
      [
        row({ term: "popular-but-thin", searches: 20, avgResults: 2 }),
        row({ term: "rare-but-missing", searches: 15, avgResults: 0 }),
      ],
      1,
    );
    expect(out.map((o) => o.term)).toEqual(["rare-but-missing"]); // 15×3 > 20×2
  });

  it("computes CTR and flags a doubling term as trending", () => {
    const [o] = rankSearchOpportunities([
      row({ term: "khmer history", searches: 10, prevSearches: 4, avgResults: 1, clicks: 3 }),
    ]);
    expect(o.ctrPct).toBe(30);
    expect(o.trending).toBe(true);
  });
});
