import { describe, expect, it } from "vitest";
import { issueLabel, issueSubtitle, titleRestatesNumbering } from "./types";

const issue = (over: Partial<Parameters<typeof issueSubtitle>[0]> = {}) => ({
  issue_number: "11",
  issue_label: null,
  title: null,
  title_km: null,
  volume: { volume_number: "91" },
  ...over,
});

describe("titleRestatesNumbering", () => {
  it.each([
    "Volume 91, Issue 11",
    "Vol. 91 No. 11",
    "vol 91, no 11 (2014)",
    "Volume 91 Number 11 2014",
    "91(11)",
    "ភាគ ៩១ លេខ ១១",
    "ភាគទី 91 លេខ 11",
  ])("%s restates Vol. 91, No. 11", (title) => {
    expect(titleRestatesNumbering(title, "91", "11")).toBe(true);
  });

  it.each([
    "Special issue on assessment",
    "Volume 91, Issue 11: Green chemistry",
    "Innovation in teaching",
    "Vol. 92, No. 1", // a different number is not a restatement of this one
  ])("%s says something else", (title) => {
    expect(titleRestatesNumbering(title, "91", "11")).toBe(false);
  });

  it("naming only part of the numbering still restates it", () => {
    expect(titleRestatesNumbering("Issue 11", "91", "11")).toBe(true);
  });

  it("a word containing 'no' is not the abbreviation", () => {
    expect(titleRestatesNumbering("Innovation 11", "91", "11")).toBe(false);
  });

  it("an issue with no numbers cannot be restated", () => {
    expect(titleRestatesNumbering("Vol.", null, null)).toBe(false);
  });
});

describe("issueSubtitle", () => {
  it("drops the title production's only issue carries", () => {
    const i = issue({ title: "Volume 91, Issue 11" });
    expect(issueLabel(i, "en")).toBe("Vol. 91, No. 11");
    expect(issueSubtitle(i, "en")).toBeNull();
    expect(issueSubtitle(i, "km")).toBeNull();
  });

  it("keeps a real theme title, in the reader's language", () => {
    const i = issue({ title: "Teacher induction", title_km: "ការណែនាំគ្រូថ្មី" });
    expect(issueSubtitle(i, "en")).toBe("Teacher induction");
    expect(issueSubtitle(i, "km")).toBe("ការណែនាំគ្រូថ្មី");
  });

  it("a title-only special issue has no subtitle: its label is the title", () => {
    const i = issue({ issue_number: null, volume: null, title: "Special issue: COVID-19 and schooling" });
    expect(issueLabel(i, "en")).toBe("Special issue: COVID-19 and schooling");
    expect(issueSubtitle(i, "en")).toBeNull();
  });

  it("nothing when there is no title", () => {
    expect(issueSubtitle(issue(), "en")).toBeNull();
  });
});
