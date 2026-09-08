import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Publishing a scheduled row is only half of going live.
 *
 * The sweep flips `status` in Postgres, but every public surface these rows
 * appear on is cached — the posts/books listings are unstable_cache entries
 * (300–3600s) and the thesis detail page is ISR at revalidate = 3600. A sweep
 * that writes the row and stops leaves the content invisible for up to an hour
 * past the time an editor chose, which is the single thing scheduling exists
 * to get right.
 *
 * Learning paths were revalidated here from the day they were added; posts,
 * theses and books never were. So the assertions below are per resource type
 * on purpose: the bug was not "no revalidation", it was one type behaving
 * differently from the other three in the same handler.
 */

const publishedRows: Record<string, Array<{ id: string; slug: string }>> = {
  posts: [{ id: "p1", slug: "exam-timetable" }],
  research_reports: [{ id: "t1", slug: "khmer-literacy-2026" }],
  books: [{ id: "b1", slug: "grade-4-science" }],
  learning_paths: [{ id: "l1", slug: "start-here" }],
};

const revalidatePost = vi.fn();
const revalidateThesis = vi.fn();
const revalidateBook = vi.fn();
const revalidateLearningPath = vi.fn();

vi.mock("@/lib/cache/revalidate", () => ({
  revalidatePost: (...a: unknown[]) => revalidatePost(...a),
  revalidateThesis: (...a: unknown[]) => revalidateThesis(...a),
  revalidateBook: (...a: unknown[]) => revalidateBook(...a),
  revalidateLearningPath: (...a: unknown[]) => revalidateLearningPath(...a),
}));

vi.mock("@/lib/security-log", () => ({ logSecurityEvent: vi.fn() }));
vi.mock("@/lib/admin/announcements/cron", () => ({
  runAnnouncementSweep: async () => ({
    publishedScheduled: [],
    publishErrors: [],
    jobsProcessed: 0,
    expired: [],
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from(table: string) {
      const chain = {
        update: () => chain,
        eq: () => chain,
        lte: () => chain,
        select: async () => ({ data: publishedRows[table] ?? [], error: null }),
      };
      return chain;
    },
  }),
}));

import { GET } from "./route";

function request() {
  return new Request("https://library.ptec.edu.kh/api/cron/publish-scheduled", {
    headers: { authorization: "Bearer test-cron-secret" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-cron-secret";
});

describe("publish-scheduled sweep makes the content actually visible", () => {
  it("revalidates a newly published post", async () => {
    await GET(request());
    expect(revalidatePost).toHaveBeenCalledWith("exam-timetable");
  });

  it("revalidates a newly published thesis", async () => {
    await GET(request());
    expect(revalidateThesis).toHaveBeenCalledWith("khmer-literacy-2026");
  });

  it("revalidates a newly published book, as a new arrival on the homepage", async () => {
    await GET(request());
    // A book reaching publication is not a routine metadata edit — it can and
    // should change the homepage shelves.
    expect(revalidateBook).toHaveBeenCalledWith("grade-4-science", { affectsHome: true });
  });

  it("still revalidates learning paths — the one type that always worked", async () => {
    await GET(request());
    expect(revalidateLearningPath).toHaveBeenCalledWith("start-here");
  });

  it("does not revalidate when the sweep published nothing", async () => {
    for (const key of Object.keys(publishedRows)) publishedRows[key] = [];
    try {
      await GET(request());
      expect(revalidatePost).not.toHaveBeenCalled();
      expect(revalidateThesis).not.toHaveBeenCalled();
      expect(revalidateBook).not.toHaveBeenCalled();
      expect(revalidateLearningPath).not.toHaveBeenCalled();
    } finally {
      publishedRows.posts = [{ id: "p1", slug: "exam-timetable" }];
      publishedRows.research_reports = [{ id: "t1", slug: "khmer-literacy-2026" }];
      publishedRows.books = [{ id: "b1", slug: "grade-4-science" }];
      publishedRows.learning_paths = [{ id: "l1", slug: "start-here" }];
    }
  });

  it("rejects a request without the cron secret", async () => {
    const res = await GET(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      new Request("https://library.ptec.edu.kh/api/cron/publish-scheduled") as any,
    );
    expect(res.status).toBe(401);
    expect(revalidatePost).not.toHaveBeenCalled();
  });
});
