import { describe, expect, it } from "vitest";
import { compareArticlesInIssue, compareIssuesNewestFirst, type OrderableArticle } from "@/lib/journals/order";

const a = (id: string, over: Partial<OrderableArticle> = {}): OrderableArticle => ({
  id, title: id, page_start: null, article_no: null, publication_date: null, ...over,
});

describe("compareArticlesInIssue — the printed table of contents", () => {
  it("orders by first page numerically, not as text", () => {
    const list = [a("x", { page_start: "114" }), a("y", { page_start: "22" }), a("z", { page_start: "9" })];
    expect(list.sort(compareArticlesInIssue).map((r) => r.id)).toEqual(["z", "y", "x"]);
  });

  it("falls back to article number, then date, and puts position-less articles last", () => {
    const list = [
      a("none"),
      a("e2", { article_no: "e1002" }),
      a("n2", { article_no: "2" }),
      a("n1", { article_no: "1" }),
      a("p", { page_start: "1" }),
    ];
    expect(list.sort(compareArticlesInIssue).map((r) => r.id)).toEqual(["p", "n1", "n2", "e2", "none"]);
  });

  it("is total: identical positions end in the id, so two runs agree", () => {
    const one = [a("b", { page_start: "5", title: "Same" }), a("a", { page_start: "5", title: "Same" })];
    const two = [...one].reverse();
    expect(one.sort(compareArticlesInIssue).map((r) => r.id)).toEqual(two.sort(compareArticlesInIssue).map((r) => r.id));
  });
});

describe("compareIssuesNewestFirst", () => {
  const issue = (id: string, vol: string | null, num: string | null, date: string | null = null) => ({
    id, issue_number: num, published_date: date, title: null, volume: vol ? { volume_number: vol } : null,
  });

  it("newest volume first, then newest issue — numerically", () => {
    const list = [issue("6-3", "6", "3"), issue("7-1", "7", "1"), issue("7-2", "7", "2"), issue("10-1", "10", "1")];
    expect(list.sort(compareIssuesNewestFirst).map((i) => i.id)).toEqual(["10-1", "7-2", "7-1", "6-3"]);
  });
});
