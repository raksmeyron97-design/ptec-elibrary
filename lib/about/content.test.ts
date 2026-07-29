import { describe, expect, it } from "vitest";
import {
  BORROWING_ALLOWANCES,
  COLLECTION_LANGUAGES,
  CONDUCT_RULES,
  DDC_CATEGORIES,
  JOURNEY_ACHIEVEMENTS,
  JOURNEY_MILESTONES,
  PENALTIES,
  PHYSICAL_COLLECTION,
  RULE_CATEGORIES,
  SPECIAL_COLLECTIONS,
} from "./content";
import { RULE_AUDIENCES } from "./types";
import type { LocalizedText } from "./types";

// These tests are the editorial guard rails. They do not check that the
// content is pretty — they check the promises the About pages make to
// readers: no invented facts, no contested figure shown as a statistic, no
// dead link, and no missing translation.

function bothLanguages(text: LocalizedText, label: string) {
  expect(text.km.trim(), `${label}: Khmer missing`).not.toBe("");
  expect(text.en.trim(), `${label}: English missing`).not.toBe("");
}

describe("physical collection figures", () => {
  it("keeps titles and copies as SEPARATE measures", () => {
    // Conflating them is the specific error the source form invites: 45,085
    // copies correspond to 2,766 titles. They must never share a label.
    expect(PHYSICAL_COLLECTION.titles.value).toBe(2766);
    expect(PHYSICAL_COLLECTION.copies.total.value).toBe(45085);
    expect(PHYSICAL_COLLECTION.titles.value).not.toBe(PHYSICAL_COLLECTION.copies.total.value);
  });

  it("has copy figures that add up to the stated total", () => {
    const { nonTextbook, textbook, total } = PHYSICAL_COLLECTION.copies;
    expect(nonTextbook.value + textbook.value).toBe(total.value);
  });

  it("records a source section for every figure", () => {
    const figures = [
      PHYSICAL_COLLECTION.titles,
      PHYSICAL_COLLECTION.copies.nonTextbook,
      PHYSICAL_COLLECTION.copies.textbook,
      PHYSICAL_COLLECTION.copies.total,
    ];
    for (const figure of figures) {
      expect(figure.sourceSection.trim()).not.toBe("");
    }
  });
});

describe("DDC categories", () => {
  it("sums to the stated title total", () => {
    // If a category count is edited without updating the total, the page's
    // headline figure and its table would disagree.
    const sum = DDC_CATEGORIES.reduce((total, c) => total + c.titles, 0);
    expect(sum).toBe(PHYSICAL_COLLECTION.titles.value);
  });

  it("preserves the source's duplicate 800 code instead of renumbering it", () => {
    const eightHundreds = DDC_CATEGORIES.filter((c) => c.code === "800");
    expect(eightHundreds).toHaveLength(2);
    // Both must be flagged so the UI can tell the reader why.
    for (const category of eightHundreds) {
      expect(category.hasCodeConflict).toBe(true);
    }
  });

  it("flags the textbook row as a local grouping, not a Dewey class", () => {
    const textbooks = DDC_CATEGORIES.find((c) => c.isLocalGrouping);
    expect(textbooks).toBeDefined();
    expect(textbooks!.titles).toBe(117);
  });

  it("gives every category a unique id and both languages", () => {
    const ids = DDC_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const category of DDC_CATEGORIES) {
      bothLanguages(category.title, `DDC ${category.code} title`);
      bothLanguages(category.scope, `DDC ${category.code} scope`);
      expect(category.titles).toBeGreaterThan(0);
    }
  });
});

describe("journey content", () => {
  it("does NOT attach a figure to the disputed research-bulletin count", () => {
    // §1.4 says four titles, §2.4 says six volumes. Until the library
    // resolves that, this card carries no number at all.
    const bulletin = JOURNEY_ACHIEVEMENTS.find((a) => a.id === "research-bulletin");
    expect(bulletin).toBeDefined();
    expect(bulletin!.count).toBeUndefined();
  });

  it("marks the 30-title figure as a minimum, because the source says 'more than'", () => {
    const press = JOURNEY_ACHIEVEMENTS.find((a) => a.id === "press-titles");
    expect(press?.count?.value).toBe(30);
    expect(press?.count?.confidence).toBe("verified");
    expect(press?.isMinimum).toBe(true);
  });

  it("never renders a figure that is not verified", () => {
    for (const achievement of JOURNEY_ACHIEVEMENTS) {
      if (achievement.count) expect(achievement.count.confidence).toBe("verified");
    }
  });

  it("has milestones in chronological order with no invented entries", () => {
    // The source form's timeline table was submitted blank; only the two
    // dated facts it states elsewhere are represented.
    expect(JOURNEY_MILESTONES).toHaveLength(2);
    const years = JOURNEY_MILESTONES.map((m) => Number(m.year));
    expect(years).toEqual([...years].sort((a, b) => a - b));
    expect(years[0]).toBe(2017);
  });

  it("gives every milestone both languages and a unique id", () => {
    const ids = JOURNEY_MILESTONES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const milestone of JOURNEY_MILESTONES) {
      bothLanguages(milestone.title, `milestone ${milestone.id} title`);
      bothLanguages(milestone.description, `milestone ${milestone.id} description`);
    }
  });
});

describe("borrowing allowances", () => {
  it("matches the figures stated in §5.3 of the source form", () => {
    const students = BORROWING_ALLOWANCES.find((a) => a.audience === "students");
    expect(students?.maxItems).toBe(5);
    expect(students?.loanDays.find((l) => l.key === "khmer")?.days).toBe(14);
    expect(students?.loanDays.find((l) => l.key === "english")?.days).toBe(7);

    const staff = BORROWING_ALLOWANCES.find((a) => a.audience === "staff");
    expect(staff?.maxItems).toBe(5);
    expect(staff?.loanDays.find((l) => l.key === "default")?.days).toBe(30);
  });

  it("gives no borrowing allowance to visitors or online users", () => {
    // Those groups appear in the audience selector but the source grants them
    // no loan rights — inventing one would be a policy fabrication.
    expect(BORROWING_ALLOWANCES.some((a) => a.audience === "visitors")).toBe(false);
    expect(BORROWING_ALLOWANCES.some((a) => a.audience === "online")).toBe(false);
  });
});

describe("rule categories", () => {
  it("gives every category a summary that states the actual point", () => {
    // The brief's explicit rule: no vague "Read more" summaries. A summary
    // shorter than its own title is a strong signal of a placeholder.
    for (const category of RULE_CATEGORIES) {
      bothLanguages(category.title, `rule ${category.id} title`);
      bothLanguages(category.summary, `rule ${category.id} summary`);
      expect(category.summary.en.length, `rule ${category.id} summary too short`).toBeGreaterThan(
        20,
      );
      expect(category.summary.en.toLowerCase()).not.toContain("read more");
    }
  });

  it("has at least one clause per category, in both languages", () => {
    for (const category of RULE_CATEGORIES) {
      expect(category.clauses.length, `rule ${category.id} has no clauses`).toBeGreaterThan(0);
      category.clauses.forEach((clause, index) =>
        bothLanguages(clause, `rule ${category.id} clause ${index}`),
      );
    }
  });

  it("assigns every category to at least one known audience", () => {
    for (const category of RULE_CATEGORIES) {
      expect(category.audiences.length).toBeGreaterThan(0);
      for (const audience of category.audiences) {
        expect(RULE_AUDIENCES).toContain(audience);
      }
    }
  });

  it("leaves no audience tab with an empty rule list", () => {
    // An audience the selector offers but has nothing to say about would be a
    // dead tab.
    for (const audience of RULE_AUDIENCES) {
      const applicable = RULE_CATEGORIES.filter((c) => c.audiences.includes(audience));
      expect(applicable.length, `no rules for audience "${audience}"`).toBeGreaterThan(0);
    }
  });
});

describe("penalties", () => {
  it("reserves the red 'prohibited' tone for deliberate acts", () => {
    // Red must not be spent on an ordinary late return, or it stops meaning
    // anything where it matters.
    const prohibited = PENALTIES.filter((p) => p.tone === "prohibited").map((p) => p.id);
    expect(prohibited).toEqual(["card-misuse", "theft"]);
    expect(PENALTIES.find((p) => p.id === "late-return")?.tone).toBe("notice");
  });

  it("separates each situation from its consequence, in both languages", () => {
    for (const penalty of PENALTIES) {
      bothLanguages(penalty.trigger, `penalty ${penalty.id} trigger`);
      bothLanguages(penalty.consequence, `penalty ${penalty.id} consequence`);
    }
  });
});

describe("conduct rules", () => {
  it("labels each rule as a 'do' or a 'don't' so colour is never the only cue", () => {
    for (const rule of CONDUCT_RULES) {
      expect(["do", "dont"]).toContain(rule.kind);
      bothLanguages(rule.text, `conduct ${rule.id}`);
    }
  });

  it("covers every conduct item listed in §5.5 plus card misuse", () => {
    expect(CONDUCT_RULES).toHaveLength(7);
  });
});

describe("languages and special collections", () => {
  it("lists the six languages from §6.3", () => {
    expect(COLLECTION_LANGUAGES).toHaveLength(6);
    expect(COLLECTION_LANGUAGES.map((l) => l.id)).toEqual(["km", "en", "ja", "ko", "zh", "th"]);
  });

  it("never offers a language chip as a link without a real filter", () => {
    // The public catalogue has no language facet yet; a chip with a
    // catalogFilter would render as a button that goes nowhere.
    for (const language of COLLECTION_LANGUAGES) {
      expect(language.catalogFilter).toBeUndefined();
    }
  });

  it("only links a special collection to a route that exists", () => {
    const REAL_ROUTES = ["/theses", "/publications", "/books", "/catalogs"];
    for (const collection of SPECIAL_COLLECTIONS) {
      bothLanguages(collection.title, `collection ${collection.id} title`);
      bothLanguages(collection.description, `collection ${collection.id} description`);
      if (collection.href) expect(REAL_ROUTES).toContain(collection.href);
    }
  });

  it("lists the four special collections from §6.5", () => {
    expect(SPECIAL_COLLECTIONS).toHaveLength(4);
  });
});
