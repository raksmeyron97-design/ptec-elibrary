import { describe, expect, it } from "vitest";
import { classifyPage, classifyPages, detectFurniture, stripFurniture, type PageInput } from "./passages";

/**
 * Modelled on the real shape of `book_pages.content`: one whitespace-collapsed
 * string per page, running header inline at the front, no layout recovered.
 * The header text CHANGES between sections while its position does not, which
 * is what makes it detectable across a document and undetectable within a page.
 */
function textbook(pageCount: number): PageInput[] {
  const sections = ["PROBABILITY SAMPLES", "SAMPLING", "NON-PROBABILITY SAMPLES"];
  // Openings vary per page, because real body text does. A book whose every
  // page opened with the same clause would have that clause detected as
  // furniture — correctly, since that is what furniture is — and a fixture
  // that did so would be testing the fixture rather than the rule.
  const openings = [
    "The correct sample size depends on",
    "Researchers must anticipate the distributions of",
    "Generally speaking a larger sample supports",
    "Novice investigators frequently underestimate",
    "Two subgroups of stakeholders illustrate",
    "Snowball recruitment begins from",
    "Convenience selection trades away",
    "Stratification requires knowing",
    "Cluster designs multiply",
    "Theoretical saturation ends",
  ];
  return Array.from({ length: pageCount }, (_, i) => {
    const pageNo = i + 1;
    const section = sections[i % sections.length];
    const body =
      `${openings[i % openings.length]} the purpose of the study and the nature of the ` +
      "population under scrutiny. Reliable statistics cannot be calculated from a design " +
      `that was never able to support them. Passage ${pageNo}. A wider range of analysis ` +
      "becomes available as the number of cases per variable rises above thirty.";
    return { pageNo, content: `${section} ${100 + pageNo} Chapter 4 ${body}` };
  });
}

describe("detectFurniture", () => {
  it("finds the tokens the header repeats on every page", () => {
    const furniture = detectFurniture(textbook(40));
    expect(furniture.header.has("chapter")).toBe(true);
    // Digits are normalized away, so a header whose only variable is the page
    // number is still one recurring token.
    expect(furniture.header.has("#")).toBe(true);
  });

  it("does not call a section name frequent just because it is a header", () => {
    // "SAMPLING" heads one section in three, so across the document it is not
    // frequent — and claiming otherwise would be the bug that lets a real
    // subject word be deleted from body text. stripFurniture reaches it by its
    // SHAPE instead; see the strip tests below.
    expect(detectFurniture(textbook(40)).header.has("sampling")).toBe(false);
  });

  it("finds nothing in a document too short to establish a pattern", () => {
    const furniture = detectFurniture(textbook(6));
    expect(furniture.header.size).toBe(0);
    expect(furniture.footer.size).toBe(0);
  });
});

describe("stripFurniture", () => {
  const furniture = detectFurniture(textbook(40));

  it("removes the header and nothing else", () => {
    const stripped = stripFurniture(textbook(40)[10].content, furniture);
    expect(stripped.startsWith("The correct sample size depends on")).toBe(true);
    expect(stripped).toContain("Passage 11.");
  });

  it("keeps a header word where it occurs in the body", () => {
    // This is the rule the whole feature rests on: "sampling" is furniture at
    // the top of the page and evidence in the middle of it. Removing every
    // occurrence would delete the very mentions that prove the topic.
    const page: PageInput = {
      pageNo: 5,
      content: "SAMPLING 105 Chapter 4 Purposive sampling differs from quota sampling in one respect.",
    };
    const stripped = stripFurniture(page.content, furniture);
    expect(stripped).toBe("Purposive sampling differs from quota sampling in one respect.");
    expect(stripped.match(/sampling/g)).toHaveLength(2);
  });

  it("stops at the first token that is not furniture, never reaching into the page", () => {
    const page: PageInput = { pageNo: 9, content: "Chapter 4 introduced sampling. Chapter 5 introduces measurement." };
    expect(stripFurniture(page.content, furniture)).toBe("introduced sampling. Chapter 5 introduces measurement.");
  });
});

describe("classifyPages", () => {
  it("marks a contents listing as contents, not as body", () => {
    const pages = textbook(60);
    pages[3] = {
      pageNo: 4,
      content:
        "Contents List of boxes xiii Acknowledgements xvii Introduction 1 The nature of inquiry 5 " +
        "The search for truth 5 Two conceptions of social reality 7 Positivism 9 The tools of science 14 " +
        "The scientific method 15 Criticisms of positivism 17 Alternatives to positivism 21 Ethics 31",
    };
    const classified = classifyPages(pages);
    expect(classified[3].kind).toBe("contents");
  });

  it("marks a bibliography as references", () => {
    const pages = textbook(60);
    pages[55] = {
      pageNo: 56,
      content:
        "References Cohen, L. (2007) Research Methods in Education. Morrison, K. (1998) Management Theories. " +
        "Manion, L. (2000) Educational Research. Patton, M. (2015) Qualitative Research. Yin, R. (2003) " +
        "Case Study Research. Silverman, D. (2011) Interpreting Qualitative Data. Flick, U. (2009) Introduction.",
    };
    expect(classifyPages(pages)[55].kind).toBe("references");
  });

  it("marks early pages as front matter and the bulk as body", () => {
    const classified = classifyPages(textbook(100));
    expect(classified[0].kind).toBe("front-matter");
    expect(classified.filter((p) => p.kind === "body").length).toBeGreaterThan(80);
  });

  it("marks a nearly empty page as sparse rather than as thin body text", () => {
    const pages = textbook(40);
    pages[20] = { pageNo: 21, content: "SAMPLING 121 Chapter 4 Figure 4.2" };
    expect(classifyPages(pages)[20].kind).toBe("sparse");
  });

  it("is safe on an empty document", () => {
    expect(classifyPages([])).toEqual([]);
  });
});

// ── SEO5-08: a Khmer contents page is a contents page ───────────────────────
//
// Both halves were broken, and either alone was enough to make Khmer
// contents pages invisible:
//   - the heading regex was English-only, and `\b` is ASCII-defined so it
//     could not have sat beside a Khmer word even if one were added;
//   - `\d` is ASCII-only in JavaScript, so a page numbered in Khmer digits
//     scored a numeric-token ratio of exactly zero.

describe("classifyPage — Khmer contents", () => {
  // Shaped like a real Khmer contents page: a heading, then chapter titles
  // each followed by a page number in KHMER digits.
  // Over MIN_BODY_CHARS (200) on purpose: a shorter sample is classified
  // `sparse` before the contents logic is ever reached, which made the first
  // draft of these tests fail for a reason that had nothing to do with Khmer.
  const khmerContents = [
    "មាតិកា",
    "ជំពូកទី១ សេចក្ដីផ្ដើម ១",
    "ជំពូកទី២ ការត្រួតពិនិត្យអក្សរសិល្ប៍ ១២",
    "ជំពូកទី៣ វិធីសាស្ត្រស្រាវជ្រាវ ២៧",
    "ជំពូកទី៤ ការប្រមូលទិន្នន័យ ៣៨",
    "ជំពូកទី៥ លទ្ធផលនៃការសិក្សា ៤៥",
    "ជំពូកទី៦ ការវិភាគទិន្នន័យ ៥២",
    "ជំពូកទី៧ ការពិភាក្សា ៦៨",
    "ជំពូកទី៨ សេចក្ដីសន្និដ្ឋាន ៧៤",
    "ជំពូកទី៩ អនុសាសន៍ ៧៨",
    "ឯកសារយោង ៨២",
    "ឧបសម្ព័ន្ធ ៨៩",
  ].join("\n");

  it("recognises មាតិកា at the front of a Khmer book", () => {
    expect(classifyPage({ pageNo: 3, content: khmerContents }, 120, khmerContents)).toBe("contents");
  });

  it("counts Khmer numerals as locators", () => {
    // The heading alone is not enough — the classifier needs the locator
    // density too, and that is the half `\d` silently failed.
    const noHeading = khmerContents.split("\n").slice(1).join("\n");
    expect(classifyPage({ pageNo: 4, content: noHeading }, 120, noHeading)).toBe("contents");
  });

  it("files a BACK-of-book Khmer contents page as back-matter, not contents", () => {
    // Khmer books often print មាតិកា at the END. classifyPage() decides
    // "contents" by POSITION, so the same page at the back is back-matter.
    // Both are furniture and both are excluded from evidence — but a dry run
    // that counts only "contents" would under-report Khmer books by however
    // many put it at the back, which is why SEO5-08 measures front and back
    // separately.
    expect(classifyPage({ pageNo: 118, content: khmerContents }, 120, khmerContents)).toBe(
      "back-matter",
    );
  });

  it("adding the Khmer heading introduces no false positive", () => {
    // The risk of a broader heading regex is the opposite error: dropping a
    // real page. `មាតិកា` is 5 code points and Khmer has no word
    // boundaries, so a page that merely MENTIONS the contents must stay body.
    const mentions =
      "សៀវភៅនេះមានមាតិកាសម្បូរបែប ដែលរៀបរាប់អំពីវិធីសាស្ត្របង្រៀនផ្សេងៗ " +
      "ព្រមទាំងឧទាហរណ៍ជាក់ស្ដែងសម្រាប់គ្រូបង្រៀននៅតាមសាលារៀនបឋមសិក្សា " +
      "ក្នុងប្រទេសកម្ពុជា ដោយផ្ដោតលើការអភិវឌ្ឍសមត្ថភាពរបស់សិស្សានុសិស្ស " +
      "និងការលើកកម្ពស់គុណភាពនៃការបង្រៀនតាមរយៈការអនុវត្តជាក់ស្ដែងក្នុងថ្នាក់រៀន " +
      "ដែលអាចជួយឱ្យគ្រូបង្រៀនយល់ដឹងកាន់តែច្បាស់អំពីតម្រូវការរបស់សិស្សម្នាក់ៗ។";
    expect(classifyPage({ pageNo: 40, content: mentions }, 120, mentions)).toBe("body");
  });

  it("does not turn Khmer PROSE into contents", () => {
    // The guard that matters: dropping a real page makes a book unanswerable
    // on its own subject.
    const prose =
      "ការស្រាវជ្រាវប្រតិបត្តិគឺជាដំណើរការមួយ ដែលគ្រូបង្រៀនពិនិត្យមើលការអនុវត្តរបស់ខ្លួន " +
      "ដើម្បីកែលម្អគុណភាពនៃការបង្រៀន និងការរៀនសូត្ររបស់សិស្ស។ វិធីសាស្ត្រនេះត្រូវបានប្រើប្រាស់ " +
      "យ៉ាងទូលំទូលាយនៅក្នុងវិស័យអប់រំសម័យទំនើប ដោយសារវាអនុញ្ញាតឱ្យគ្រូបង្រៀនស្វែងយល់ពីបញ្ហា " +
      "ជាក់ស្ដែងក្នុងថ្នាក់រៀន និងស្វែងរកដំណោះស្រាយដែលសមស្របនឹងបរិបទរបស់ខ្លួន។";
    expect(classifyPage({ pageNo: 40, content: prose }, 120, prose)).toBe("body");
  });

  it("leaves English classification exactly as it was", () => {
    const en = [
      "Contents",
      "Chapter 1 Introduction 1",
      "Chapter 2 Literature Review 12",
      "Chapter 3 Research Method 27",
      "Chapter 4 Data Collection 38",
      "Chapter 5 Results 45",
      "Chapter 6 Analysis 52",
      "Chapter 7 Discussion 68",
      "Chapter 8 Conclusion 74",
      "References 82",
      "Appendix 89",
    ].join("\n");
    expect(classifyPage({ pageNo: 3, content: en }, 120, en)).toBe("contents");
    const enProse =
      "Action research is a process in which teachers examine their own practice in order to improve the quality of teaching and of student learning in their classrooms. It is widely used in contemporary education because it lets a teacher study a real problem and test a response to it.";
    expect(classifyPage({ pageNo: 40, content: enProse }, 120, enProse)).toBe("body");
  });
});
