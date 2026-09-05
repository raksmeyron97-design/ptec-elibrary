import { describe, expect, it } from "vitest";
import { analyzeTextHealth, CALIBRATION } from "./text-quality";

/**
 * The Khmer strings below are REAL: each damaged one is a verbatim excerpt
 * from `book_pages` in production, paired with the text the document actually
 * says. If a change to the detector stops condemning one of these, it has
 * stopped protecting the collection — 99 of the 99 Khmer-script books in the
 * library extract like this.
 */
const DAMAGED_SAMPLES: { label: string; stored: string; actual: string }[] = [
  {
    label: "coeng dropped + glyph spacing (យុទ្ធសាស្ត្របង្រៀនទំនើប)",
    stored:
      "យុ ទ ស ប េ ងៀ ន ទំ េនើ ប េរៀ ប ចំ េ យ៖ ចំ េណះ ដឹ ង ែល ង ន ស ិ រ ព ដូ ចសតវ ត ទី ២០ េទៀ ត េហើ យ រប េ ងៀ ន ែដ ល េ បើ ែត េសៀ វ េ សិ ក េ ល គឺ ហួ សស ម័ យ ៉ សុី ន កំ ពុ ង េធ ើ រ ជំ នួ សម នុ ស រ រ កំ ពុ ង ត់ ប ង់ រ រ ថ ី ៗ កំ ពុ ង េកើ ត េឡើ ង េយើ ង តូ វ រប ណ ះ ប ណ ា លម នុ ស ឱ េធ ើ អ ី ែដ ល ៉ សុី ន មិ ន ច េធ ើ ន",
    actual: "យុទ្ធសាស្ត្របង្រៀនទំនើប",
  },
  {
    label: "coeng detached after (សៀវភៅណែនាំគ្រូបង្រៀន គីមីវិទ្យា)",
    stored:
      "ថ្នាក់ទី7 រូបធាតុ វត្ថុបំណង ពណ៌ ន្ ពី ល ក្ ្ខណៈរូបធាតុ និ ងសិក្សា ល ក្ ្ខណៈខុស ោ្ រវាងភាពរូបរឹង និងភាពរូប រាវ។ មត ើ ម្ សិក្ សារូបធាតុតា េ ល ក្ ្ខណៈអ វី ខ ្លះ ? មត ើ រូបធាតុរឹង និងរូបធាតុរាវ ៉ នល ក្ ្ខណៈខុស ោ្ យ ោ ងដូចម េដែ ចខ ្លះ ?",
    actual: "លក្ខណៈ",
  },
  {
    label: "coeng detached before (សៀវភៅណែនាំអ្នកបណ្ដុះបណ្ដាល)",
    stored:
      "សៀវភៅណែនាំ សម ែែ ប់អ្នកបណ្តុះបណ្ត ែ លអំព ី បរិយាបន្នពិការភាព សាវតារ មនុស ្រ សជាងមួយពាន់លាននាក់នៅលើពិភពលោក ម នពិការភាព។ ចំនួនន ្រ ះស្មើនឹងមនុស ្រ ស ១នាក់ក្នុងចំ ណ ម ៧នាក់ ទោះជា យា ៉ ្រ ងន ្រ ះក្តី ជាញឹកញាប់ពួកគាត់ត្រូវបានរារាំង មិនឱ ្រ យចូលរួមនៅក្នុងសង្គមទ ្រ ។",
    actual: "សម្រាប់ / មនុស្ស",
  },
  {
    label: "legacy font cmap (រុក្ខវិទ្យា)",
    stored:
      "រុកãវǤទų 9 ǂមរǇយƳរណ៍របស់ the Royal Botanic Gardens, Kew, in the United Kingdom កƒុងƹ ƒំ ២០១៦ េǷេលីពិភពេǎក ǋនរុកſƺតិƙបǋណƺ ៣៩១០០០ƙបេភទែដលƙតȪវǇនេគǒ ƀ ល់ǃƺរុកſƺតិǋនǇច់ សរៃសǆំ ែដលកƒុងចំេǁមេǆះƙបែហលƺ៣៦៩០០០ ƙបេភទ ƺរុកſƺតិǋនǈ ž ។",
    actual: "រុក្ខវិទ្យា",
  },
];

/** Genuine, well-formed Khmer prose. Nothing here may ever be condemned. */
const HEALTHY_KHMER = [
  "ការអប់រំគឺជាមូលដ្ឋានគ្រឹះនៃការអភិវឌ្ឍសង្គម។ សាលាគរុកោសល្យភូមិភាគមានតួនាទីសំខាន់ក្នុងការបណ្ដុះបណ្ដាលគ្រូបង្រៀនដែលមានសមត្ថភាព។ វិធីសាស្ត្របង្រៀនទំនើបផ្តោតលើសិស្សជាមជ្ឈមណ្ឌល ដោយលើកទឹកចិត្តឱ្យសិស្សចូលរួមយ៉ាងសកម្មក្នុងដំណើរការសិក្សា។",
  "កម្មវិធីសិក្សាលម្អិតសម្រាប់មុខវិជ្ជាគណិតវិទ្យា ថ្នាក់ទី៧ ត្រូវបានរៀបចំឡើងដោយក្រសួងអប់រំ យុវជន និងកីឡា។ ខ្លឹមសារសំខាន់ៗរួមមាន ចំនួនគត់ ប្រភាគ ធរណីមាត្រ និងស្ថិតិ។ គ្រូបង្រៀនត្រូវប្រើប្រាស់សម្ភារឧបទ្ទេសដើម្បីជួយសម្រួលដល់ការយល់ដឹងរបស់សិស្ស។",
].map((s) => s.repeat(2));

const ENGLISH_PROSE =
  "A question that often plagues novice researchers is just how large their samples for the research should be. There is no clear-cut answer, for the correct sample size depends on the purpose of the study and the nature of the population under scrutiny. However, it is possible to give some advice on this matter. Generally speaking, the larger the sample the better.";

describe("analyzeTextHealth — Khmer damage detection", () => {
  it.each(DAMAGED_SAMPLES)("condemns $label", ({ stored }) => {
    const health = analyzeTextHealth(stored);
    expect(health.script).toMatch(/khmer|mixed/);
    expect(health.verdict).toBe("damaged");
    expect(health.reasons.length).toBeGreaterThan(0);
  });

  it.each(HEALTHY_KHMER.map((text, i) => ({ i, text })))(
    "clears well-formed Khmer prose #$i",
    ({ text }) => {
      const health = analyzeTextHealth(text);
      expect(health.script).toBe("khmer");
      expect(health.reasons).toEqual([]);
      expect(health.verdict).toBe("healthy");
    },
  );

  it("names the damage mode rather than reporting a bare failure", () => {
    // Mode 1: the coeng marks are simply gone.
    expect(analyzeTextHealth(DAMAGED_SAMPLES[0].stored).reasons).toContain("khmer-coeng-missing");
    // Mode 2: they are present but spaced off the cluster.
    expect(analyzeTextHealth(DAMAGED_SAMPLES[2].stored).reasons).toContain("khmer-coeng-detached");
    // Mode 3: the font emitted Latin-Extended code points inside Khmer runs.
    expect(analyzeTextHealth(DAMAGED_SAMPLES[3].stored).reasons).toContain("khmer-legacy-font");
  });

  it("does not apply the Khmer rules to Latin text", () => {
    const health = analyzeTextHealth(ENGLISH_PROSE.repeat(2));
    expect(health.script).toBe("latin");
    expect(health.verdict).toBe("healthy");
    expect(health.reasons).toEqual([]);
  });

  it("reports `unknown` — not `healthy` — for a sample too short to judge", () => {
    const health = analyzeTextHealth("ការអប់រំ");
    expect(health.length).toBeLessThan(CALIBRATION.minSampleLength);
    expect(health.verdict).toBe("unknown");
  });

  it("treats an English quotation inside Khmer prose as normal, not as a broken font", () => {
    const mixed = `${HEALTHY_KHMER[0]} The Royal Botanic Gardens, Kew, United Kingdom. ${HEALTHY_KHMER[1]}`;
    expect(analyzeTextHealth(mixed).reasons).not.toContain("khmer-legacy-font");
  });

  it("is empty-input safe", () => {
    const health = analyzeTextHealth("");
    expect(health.verdict).toBe("unknown");
    expect(health.khmerRatio).toBe(0);
    expect(health.coengDensity).toBe(0);
  });
});
