import { describe, expect, it } from "vitest";
import { buildInsights, SEMANTIC_VERSION } from "./build";
import type { PageInput } from "./passages";

/**
 * An English textbook that genuinely covers its tags.
 *
 * Deliberately varied and realistically long (~2 kB a page, against 3–4 kB in
 * production). A fixture whose every page opens with the same clause makes
 * that clause furniture — correctly, since that is what furniture is — and
 * then tests the fixture rather than the rule.
 */
function englishBook(): PageInput[] {
  const openings = [
    "A researcher defending a design must first say why",
    "Postgraduate students routinely underestimate how much",
    "In the literature reviewed so far, disagreement about",
    "Consider two studies of the same primary school where",
    "It would be convenient to treat",
    "Nothing in the preceding chapters suggested that",
    "Practitioners working under time pressure often abandon",
  ];
  const middles = [
    "Reviewers will ask for a justification, and an answer assembled after the data were collected reads as one.",
    "The literature offers no single rule, which is why the decision belongs in the design rather than the write-up.",
    "Cost, access and the cooperation of a gatekeeper all bear on what is achievable in a real school.",
    "Statistical power falls away quickly once the number of cases per variable drops below thirty.",
    "Two investigators given the same instrument and the same population will still disagree at the margins.",
  ];

  const pages: PageInput[] = [
    { pageNo: 1, content: "SAMPLING IN EDUCATIONAL RESEARCH A textbook for postgraduate students of education, covering design, instrumentation and the defence of conclusions drawn from school populations." },
    { pageNo: 2, content: "First published 2007 by an academic press. All rights reserved. No part of this book may be reprinted or reproduced or utilised in any form without permission in writing from the publishers." },
    { pageNo: 3, content: "Contents List of boxes xiii Acknowledgements xvii Introduction 1 Sampling 8 Probability samples 14 Simple random samples 15 Systematic samples 17 Stratified samples 18 Cluster samples 20 Non-probability samples 22 Convenience sampling 23 Quota sampling 25 Purposive sampling 27 Snowball sampling 28 Measurement 30 Levels of measurement 32 Instrument design 37 Validity 44 Content validity 45 Construct validity 47 Reliability 52 Index 60" },
  ];

  for (let pageNo = 8; pageNo <= 56; pageNo++) {
    const topic = pageNo % 3 === 0 ? "sampling" : pageNo % 3 === 1 ? "measurement" : "validity";
    const sentences = [
      `${openings[pageNo % openings.length]} ${topic} was approached in the way it was.`,
      middles[pageNo % middles.length],
      `Careful ${topic} distinguishes a study that can support its conclusions from one that cannot.`,
      middles[(pageNo + 2) % middles.length],
      `Where ${topic} has been treated as an afterthought, the resulting claims rarely survive scrutiny.`,
      "Passage " + pageNo + " closes the section with an exercise for the reader.",
    ];
    pages.push({ pageNo, content: `SAMPLING ${pageNo} Chapter 2 ${sentences.join(" ")}` });
  }
  return pages;
}

/** Verbatim production text: a legacy non-Unicode Khmer font. */
const DAMAGED_KHMER_PAGE =
  "យុ ទ ស ប េ ងៀ ន ទំ េនើ ប េរៀ ប ចំ េ យ៖ ចំ េណះ ដឹ ង ែល ង ន ស ិ រ ព ដូ ចសតវ ត ទី ២០ េទៀ ត េហើ យ " +
  "រប េ ងៀ ន ែដ ល េ បើ ែត េសៀ វ េ សិ ក េ ល គឺ ហួ សស ម័ យ ៉ សុី ន កំ ពុ ង េធ ើ រ ជំ នួ សម នុ ស រ រ កំ ពុ ង " +
  "ត់ ប ង់ រ រ ថ ី ៗ កំ ពុ ង េកើ ត េឡើ ង េយើ ង តូ វ រប ណ ះ ប ណ ា លម នុ ស ឱ េធ ើ អ ី ែដ ល ៉ សុី ន មិ ន ច េធ ើ ន";

describe("buildInsights", () => {
  it("proves the topics an English textbook covers", () => {
    const result = buildInsights({
      pages: englishBook(),
      tags: ["sampling", "measurement", "validity"],
      title: "Sampling in Educational Research",
    });

    expect(result.status).toBe("ok");
    expect(result.version).toBe(SEMANTIC_VERSION);
    expect(result.textHealth).toMatchObject({ script: "latin", verdict: "healthy" });
    expect(result.topics.map((t) => t.label).sort()).toEqual(["measurement", "sampling", "validity"]);
    for (const topic of result.topics) expect(topic.pages.length).toBeGreaterThan(0);
  });

  it("counts pages by structural kind rather than lumping them together", () => {
    const result = buildInsights({ pages: englishBook(), tags: ["sampling"] });
    expect(result.pages.total).toBe(52);
    expect(result.pages.contents).toBe(1);
    expect(result.pages.body).toBeGreaterThan(40);
  });

  it("refuses to derive anything from structurally damaged text", () => {
    // The damage is the whole point: extraction SUCCEEDED here, so
    // resource_index_state records this record as `indexed`. Publishing a
    // topic from it would publish a fabrication about a real document.
    const pages = Array.from({ length: 40 }, (_, i) => ({
      pageNo: i + 1,
      content: DAMAGED_KHMER_PAGE,
    }));
    const result = buildInsights({ pages, tags: ["គរុកោសល្យ", "វិធីសាស្ត្របង្រៀន"] });

    expect(result.status).toBe("damaged-text");
    expect(result.topics).toEqual([]);
    expect(result.textHealth?.verdict).toBe("damaged");
    expect(result.textHealth?.reasons.length).toBeGreaterThan(0);
  });

  it("separates 'no text' from 'text we cannot use' from 'nothing proven'", () => {
    // Three different situations with three different owners — the indexer,
    // the extraction toolchain, and the cataloguer. Collapsing them into an
    // empty section is how a total failure hides behind a working feature.
    expect(buildInsights({ pages: [], tags: ["sampling"] }).status).toBe("no-text");

    const good = englishBook();
    expect(buildInsights({ pages: good, tags: ["astrophysics"] }).status).toBe("unsupported-topics");
    expect(buildInsights({ pages: good, tags: ["sampling"] }).status).toBe("ok");
  });

  it("publishes nothing when a record carries no tags at all", () => {
    const result = buildInsights({ pages: englishBook(), tags: [] });
    expect(result.status).toBe("unsupported-topics");
    expect(result.topics).toEqual([]);
  });

  it("is deterministic — the same input produces a byte-identical row", () => {
    const input = { pages: englishBook(), tags: ["sampling", "measurement", "validity"] };
    expect(JSON.stringify(buildInsights(input))).toBe(JSON.stringify(buildInsights(input)));
  });

  it("never returns document text, only counts and page numbers", () => {
    const serialized = JSON.stringify(buildInsights({ pages: englishBook(), tags: ["sampling"] }));
    // A page reference is a fact anyone holding the document can check; a
    // passage is content, governed by a rights policy this library has not
    // written. Nothing in a stored row may carry the second.
    expect(serialized).not.toContain("Passage");
    expect(serialized).not.toContain("deserves attention");
  });
});
