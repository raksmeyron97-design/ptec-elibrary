import { describe, expect, it } from "vitest";
import {
  EVIDENCE_BOOSTS,
  EVIDENCE_LIMITS,
  applyEvidenceBoosts,
  balanceByDocument,
  contextCeilingFor,
  dedupePages,
  definitionSignal,
  diversify,
  fuseEvidence,
  isKhmerScaffolding,
  minLexicalScore,
  queryTerms,
  requiredTerms,
  sourceCount,
  spreadPages,
  workSimilarityFloor,
  WORK_SIMILARITY_FLOOR,
  type RetrievedEvidence,
} from "./evidence";

function ev(over: Partial<RetrievedEvidence> & { recordId: string; page: number }): RetrievedEvidence {
  return {
    recordType: "book",
    matchType: "semantic",
    title: `Book ${over.recordId}`,
    author: "Author",
    url: `/books/${over.recordId}`,
    text: `text ${over.recordId} p${over.page}`,
    similarity: 0.5,
    score: 0,
    ...over,
  };
}

describe("fuseEvidence", () => {
  it("ranks a page found by both legs above one found by either", () => {
    const lexical = [ev({ recordId: "a", page: 1, matchType: "pdf_exact" }), ev({ recordId: "b", page: 2, matchType: "pdf_exact" })];
    const semantic = [ev({ recordId: "c", page: 3 }), ev({ recordId: "a", page: 1 })];
    const fused = fuseEvidence([lexical, semantic]);
    expect(fused[0].recordId).toBe("a");
    expect(fused[0].score).toBeGreaterThan(fused[1].score);
    expect(fused).toHaveLength(3);
  });

  it("keeps the verbatim window when both legs found the same page", () => {
    const semantic = [ev({ recordId: "a", page: 4, text: "chunk boundary text" })];
    const lexical = [ev({ recordId: "a", page: 4, matchType: "pdf_exact", text: "…the exact phrase…" })];
    const [fused] = fuseEvidence([semantic, lexical]);
    expect(fused.matchType).toBe("pdf_exact");
    expect(fused.text).toBe("…the exact phrase…");
  });

  it("respects rank order within one list", () => {
    const list = [ev({ recordId: "a", page: 1 }), ev({ recordId: "b", page: 1 }), ev({ recordId: "c", page: 1 })];
    expect(fuseEvidence([list]).map((e) => e.recordId)).toEqual(["a", "b", "c"]);
  });

  it("is deterministic for equal scores", () => {
    const a = [ev({ recordId: "b", page: 2 }), ev({ recordId: "a", page: 2 })];
    expect(fuseEvidence([a]).map((e) => e.recordId)).toEqual(fuseEvidence([a]).map((e) => e.recordId));
  });
});

describe("dedupePages", () => {
  it("keeps one entry per record and page", () => {
    const out = dedupePages([ev({ recordId: "a", page: 1 }), ev({ recordId: "a", page: 1 }), ev({ recordId: "a", page: 2 })]);
    expect(out).toHaveLength(2);
  });
});

describe("diversify", () => {
  const pool = [
    ev({ recordId: "a", page: 1, score: 0.9 }),
    ev({ recordId: "a", page: 2, score: 0.8 }),
    ev({ recordId: "a", page: 3, score: 0.7 }),
    ev({ recordId: "b", page: 1, score: 0.6 }),
    ev({ recordId: "c", page: 1, score: 0.5 }),
  ];

  it("prefers three resources over three pages of one", () => {
    const out = diversify(pool, { limit: 3, perResource: 1 });
    expect(out.map((e) => e.recordId)).toEqual(["a", "b", "c"]);
    expect(sourceCount(out)).toBe(3);
  });

  it("keeps depth inside one record when scoped", () => {
    const scoped = pool.filter((e) => e.recordId === "a");
    const out = diversify(scoped, { limit: 4, perResource: 4 });
    expect(out.map((e) => e.page)).toEqual([1, 2, 3]);
  });

  it("fills remaining slots from one record when nothing else is available", () => {
    const thin = [ev({ recordId: "a", page: 1 }), ev({ recordId: "a", page: 2 }), ev({ recordId: "a", page: 3 })];
    expect(diversify(thin, { limit: 3, perResource: 1 })).toHaveLength(3);
  });

  it("returns nothing for a zero limit", () => {
    expect(diversify(pool, { limit: 0, perResource: 1 })).toEqual([]);
  });
});

describe("balanceByDocument", () => {
  it("gives each document its own slice, in the order asked", () => {
    const a = [ev({ recordId: "a", page: 1 }), ev({ recordId: "a", page: 2 }), ev({ recordId: "a", page: 3 })];
    const b = [ev({ recordId: "b", page: 9 })];
    const out = balanceByDocument(
      [{ label: "A", evidence: a }, { label: "B", evidence: b }],
      EVIDENCE_LIMITS.multi_document,
    );
    expect(out.filter((e) => e.documentLabel === "A")).toHaveLength(3);
    expect(out.filter((e) => e.documentLabel === "B")).toHaveLength(1);
    expect(out[0].documentLabel).toBe("A");
  });

  it("never lets one document consume the whole budget", () => {
    const many = Array.from({ length: 10 }, (_, i) => ev({ recordId: "a", page: i + 1 }));
    const out = balanceByDocument(
      [{ label: "A", evidence: many }, { label: "B", evidence: [ev({ recordId: "b", page: 1 })] }],
      EVIDENCE_LIMITS.multi_document,
    );
    expect(out.filter((e) => e.documentLabel === "A").length).toBeLessThanOrEqual(3);
  });
});

describe("spreadPages", () => {
  it("keeps the ranked lead and then samples across the document", () => {
    const pool = Array.from({ length: 20 }, (_, i) => ev({ recordId: "a", page: i + 1, score: 1 - i / 100 }));
    const out = spreadPages(pool, 5);
    expect(out).toHaveLength(5);
    const pages = out.map((e) => e.page);
    expect(pages).toContain(1);
    // Sampling must reach beyond the opening pages.
    expect(Math.max(...pages)).toBeGreaterThan(10);
    expect(new Set(pages).size).toBe(5);
  });

  it("returns everything when the pool is already small", () => {
    const pool = [ev({ recordId: "a", page: 1 }), ev({ recordId: "a", page: 2 })];
    expect(spreadPages(pool, 5)).toHaveLength(2);
  });
});

describe("EVIDENCE_LIMITS", () => {
  it("spends nothing on modes answered from structured data", () => {
    for (const mode of ["lookup", "citation"] as const) {
      expect(EVIDENCE_LIMITS[mode].evidence).toBe(0);
      expect(EVIDENCE_LIMITS[mode].budgetTokens).toBe(0);
    }
  });

  it("buys depth for scoped modes and breadth for comparison", () => {
    expect(EVIDENCE_LIMITS.scoped.perResource).toBeGreaterThanOrEqual(EVIDENCE_LIMITS.scoped.evidence);
    // The breadth rule, stated as the property rather than as one number.
    // `hybrid.perResource` was pinned at exactly 1, which is the strictest
    // possible reading of "prefer several sources" and also stopped a book
    // that genuinely answers the question from contributing a second page.
    // What must hold is that no single record can take half the evidence —
    // that is what keeps an unscoped answer drawing on at least three
    // sources, and it is true of the old shape (1 of 3) and the new one
    // (2 of 5) alike.
    expect(EVIDENCE_LIMITS.hybrid.perResource).toBeLessThan(EVIDENCE_LIMITS.hybrid.evidence / 2);
    expect(EVIDENCE_LIMITS.multi_document.evidence).toBeGreaterThan(EVIDENCE_LIMITS.hybrid.evidence);
  });

  it("keeps every mode's evidence budget bounded", () => {
    for (const limits of Object.values(EVIDENCE_LIMITS)) {
      expect(limits.budgetTokens).toBeLessThanOrEqual(1_800);
      expect(limits.evidence).toBeLessThanOrEqual(6);
    }
  });

  it("raises the context ceiling only as far as the evidence needs", () => {
    // A mode whose evidence fits under the base ceiling does not raise it…
    expect(contextCeilingFor("lookup", 2_000)).toBe(2_000);
    expect(contextCeilingFor("pdf_exact", 2_000)).toBe(2_000);
    // …and a mode that carries a real evidence budget raises it by exactly
    // that budget plus the fixed 1,100 the prompt and history need — never
    // to some larger round number. `hybrid` is in this group now: a
    // cross-collection research question retrieves passages, so it has to pay
    // for them the same way a comparison does.
    expect(contextCeilingFor("hybrid", 2_000)).toBe(EVIDENCE_LIMITS.hybrid.budgetTokens + 1_100);
    expect(contextCeilingFor("multi_document", 2_000)).toBe(2_900);
  });
});


describe("minLexicalScore — a page must share the QUESTION, not a word", () => {
  it("needs both terms of a two-term question", () => {
    // One incidental match was enough before: "cryptocurrency mining rigs"
    // was answered from a page about readability formulas, and "submarine
    // hull design" from a chapter-summary page, on ordinary words while the
    // word that made each question that question appeared nowhere.
    expect(minLexicalScore(["sampling", "interviews"])).toBe(2);
  });

  it("needs a majority of a longer question's terms", () => {
    expect(minLexicalScore(["cryptocurrency", "mining", "rigs"])).toBe(2);
    expect(minLexicalScore(["a", "b", "c", "d"])).toBe(3);
    expect(minLexicalScore(["a", "b", "c", "d", "e", "f"])).toBe(4);
  });

  it("still admits a single-term question on one match", () => {
    // This is the shape a stripped question takes — "sampling", "validity" —
    // and it is also the only shape a mixed Khmer/English question can take
    // once its frame is removed.
    expect(minLexicalScore(["validity"])).toBe(1);
    expect(minLexicalScore([])).toBe(1);
  });

  it("never demands more matches than the question has terms", () => {
    for (let n = 1; n <= 6; n++) {
      const terms = Array.from({ length: n }, (_, i) => `t${i}`);
      expect(minLexicalScore(terms)).toBeLessThanOrEqual(n);
      expect(minLexicalScore(terms)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("the cross-collection mode is not the thinnest one", () => {
  it("gives an unscoped research question more evidence than a bare lookup", () => {
    // `hybrid` answers "what does the literature say about X" across the whole
    // collection and used to get three passages at one per record — less than
    // a single document's own summary. Measured against production, that
    // squeezed a 24-row candidate pool through three slots.
    expect(EVIDENCE_LIMITS.hybrid.evidence).toBeGreaterThan(EVIDENCE_LIMITS.pdf_exact.evidence);
    expect(EVIDENCE_LIMITS.hybrid.candidates).toBeGreaterThan(EVIDENCE_LIMITS.pdf_exact.candidates);
  });

  it("keeps at least three sources reachable in every unscoped mode", () => {
    for (const mode of ["pdf_exact", "semantic", "hybrid"] as const) {
      const { evidence, perResource } = EVIDENCE_LIMITS[mode];
      expect(Math.ceil(evidence / perResource)).toBeGreaterThanOrEqual(3);
    }
  });
});

// ── AI Brain 2 (docs/AI_BRAIN_2_AUDIT.md §4, §5) ─────────────────────────────
describe("requiredTerms — a short topic is one concept", () => {
  it("requires every term of a topic up to three terms", () => {
    // "byzantine fault tolerance" was answered from a page containing "fault"
    // and "tolerance"; "byzantine" appeared nowhere in the library.
    expect(requiredTerms(queryTerms("byzantine fault tolerance"))).toEqual(["byzantine", "tolerance", "fault"]);
    expect(requiredTerms(queryTerms("aortic valve replacement"))).toEqual(["replacement", "aortic", "valve"]);
    expect(requiredTerms(queryTerms("formative assessment"))).toEqual(["assessment", "formative"]);
  });

  it("requires the three most specific terms of a longer question", () => {
    const terms = queryTerms("how children learn to read in primary classrooms");
    expect(requiredTerms(terms)).toEqual(terms.slice(0, 3));
    expect(requiredTerms(terms).every((t) => t.length >= 4)).toBe(true);
  });

  it("keeps the frame verbs out of the terms entirely", () => {
    expect(queryTerms("Explain ethics as the library's books describe it")).not.toContain("explain");
    expect(queryTerms("Explain ethics as the library's books describe it")).not.toContain("describe");
    expect(queryTerms("Across the library's books, how is scaffolding handled")).not.toContain("handled");
  });
});

describe("definitionSignal", () => {
  it("recognises a page that defines the term", () => {
    expect(definitionSignal("Validity is the degree to which a test measures what it claims to measure.", ["validity"])).toBe(true);
    expect(definitionSignal("Triangulation refers to the use of multiple data sources.", ["triangulation"])).toBe(true);
    expect(definitionSignal("A case study can be defined as an in-depth exploration.", ["study", "case"])).toBe(true);
  });

  it("does not fire on a mention", () => {
    expect(definitionSignal("We assessed validity in chapter 4 and reliability in chapter 5.", ["validity"])).toBe(false);
    expect(definitionSignal("", ["validity"])).toBe(false);
  });

  it("ignores short and Khmer terms, which have no word boundary to anchor on", () => {
    expect(definitionSignal("art is long", ["art"])).toBe(false);
    expect(definitionSignal("ការវាយតម្លៃ គឺ …", ["ការវាយតម្លៃ"])).toBe(false);
  });
});

describe("applyEvidenceBoosts — explainable, and small next to a rank step", () => {
  it("lifts a defining page above a mentioning page that tied with it", () => {
    const fused = fuseEvidence([
      [ev({ recordId: "mentions", page: 1, matchType: "pdf_exact" })],
      [ev({ recordId: "defines", page: 2, signals: { definition: true } })],
    ]);
    // Each led its own leg: an exact tie before boosts.
    expect(fused[0].score).toBeCloseTo(fused[1].score, 10);
    const boosted = applyEvidenceBoosts(fused);
    expect(boosted[0].recordId).toBe("defines");
    expect(boosted[0].signals?.definition).toBe(true);
  });

  it("never lifts a single-leg page above a page both legs found", () => {
    const both = ev({ recordId: "both", page: 1, matchType: "pdf_exact" });
    const fused = fuseEvidence([
      [both, ev({ recordId: "dense", page: 3, signals: { definition: true, density: 400 } })],
      [both],
    ]);
    const boosted = applyEvidenceBoosts(fused);
    expect(boosted[0].recordId).toBe("both");
    expect(EVIDENCE_BOOSTS.definition + EVIDENCE_BOOSTS.densityMax).toBeLessThan(1 / 61);
  });

  it("caps the density boost", () => {
    const a = applyEvidenceBoosts([ev({ recordId: "a", page: 1, score: 0.01, signals: { density: 40 } })])[0].score;
    const b = applyEvidenceBoosts([ev({ recordId: "b", page: 1, score: 0.01, signals: { density: 4000 } })])[0].score;
    expect(a).toBeCloseTo(b, 10);
  });

  it("records the fusion score on the evidence so a trace can show it", () => {
    const fused = fuseEvidence([[ev({ recordId: "a", page: 1 })]]);
    expect(fused[0].signals?.rrf).toBeCloseTo(1 / 61, 10);
  });
});

// ── Khmer is a language, not a blob ──────────────────────────────────────────
describe("queryTerms — Khmer function runs", () => {
  it("drops a Khmer particle that would otherwise be a required term", () => {
    // `អំពី` is "about". It entered as a content term, and because runs sort
    // longest-first a Khmer clause lands inside `requiredTerms` — which is
    // applied as a SQL conjunction, so an English page had to contain a Khmer
    // particle before it could be evidence.
    expect(queryTerms("books អំពី formative assessment")).not.toContain("អំពី");
    expect(queryTerms("books អំពី formative assessment")).toEqual(
      expect.arrayContaining(["assessment", "formative"]),
    );
  });

  it("keeps a Khmer TOPIC whole", () => {
    expect(queryTerms("គណិតវិទ្យា")).toEqual(["គណិតវិទ្យា"]);
    expect(queryTerms("ការស្រាវជ្រាវសកម្មភាព")).toEqual(["ការស្រាវជ្រាវសកម្មភាព"]);
    expect(queryTerms("ការវាយតម្លៃសិស្ស")).toEqual(["ការវាយតម្លៃសិស្ស"]);
  });

  it("matches a whole run only — never a prefix, never a substring", () => {
    // The reason the rule is whole-run. Khmer has no word boundaries, so
    // stripping `ជា` from a suffix would cut `មុខវិជ្ជា` ("subject") down to
    // `មុខវិជ្`, and `ការ` from a prefix would cut `ការស្រាវជ្រាវ` ("research")
    // down to `ស្រាវជ្រាវ` — inside the one term carrying the question.
    expect(queryTerms("មុខវិជ្ជា")).toEqual(["មុខវិជ្ជា"]);
    expect(queryTerms("ការស្រាវជ្រាវ")).toEqual(["ការស្រាវជ្រាវ"]);
    // …while the bare particles themselves carry nothing and are dropped.
    expect(queryTerms("ជា")).toEqual([]);
    expect(queryTerms("តើ អំពី នេះ")).toEqual([]);
  });

  it("leaves the Latin half of a mixed question intact", () => {
    const terms = queryTerms("តើមាន book អំពី qualitative research ទេ");
    expect(terms).toEqual(expect.arrayContaining(["qualitative", "research"]));
    expect(terms.some((t) => /[ក-៿]/u.test(t))).toBe(false);
  });
});

describe("isKhmerScaffolding", () => {
  it("decomposes a compound of function words", () => {
    // Neither of these is in the list as a whole; each is two or three
    // entries run together, which is how Khmer is written.
    expect(isKhmerScaffolding("តើមាន")).toBe(true);
    expect(isKhmerScaffolding("ខ្ញុំចង់រៀន")).toBe(true);
    expect(isKhmerScaffolding("សៀវភៅនេះនិយាយអំពីអ្វី")).toBe(true);
  });

  it("refuses the moment any part of the run is not scaffolding", () => {
    // The safety property. `វិជ្ជា` ends in `ជា` and `មានន័យ` starts with
    // `មាន`; both survive whole, because the rule is all-or-nothing.
    expect(isKhmerScaffolding("មុខវិជ្ជា")).toBe(false);
    expect(isKhmerScaffolding("មានន័យ")).toBe(false);
    expect(isKhmerScaffolding("ការស្រាវជ្រាវ")).toBe(false);
    expect(isKhmerScaffolding("គណិតវិទ្យា")).toBe(false);
    expect(isKhmerScaffolding("គរុកោសល្យ")).toBe(false);
  });
});

describe("workSimilarityFloor", () => {
  it("holds Khmer to a higher floor than Latin", () => {
    // Not a preference — a measurement. The embedder places a thinly
    // represented script in a tighter region, so Khmer scores higher in BOTH
    // directions and one floor applies two different policies.
    expect(workSimilarityFloor("qualitative research methods")).toBe(WORK_SIMILARITY_FLOOR.latin);
    expect(workSimilarityFloor("គរុកោសល្យ")).toBe(WORK_SIMILARITY_FLOOR.khmer);
    expect(WORK_SIMILARITY_FLOOR.khmer).toBeGreaterThan(WORK_SIMILARITY_FLOOR.latin);
  });

  it("takes the stricter floor for a mixed query", () => {
    // The Khmer run is what shifts the vector, and the safe error is the
    // strict one: a dropped semantic hit is a result the keyword leg already
    // failed to match by name, where a loose floor is a confident answer about
    // a subject the library does not hold.
    expect(workSimilarityFloor("រក books អំពី formative assessment")).toBe(WORK_SIMILARITY_FLOOR.khmer);
  });

  it("separates both measured distributions", () => {
    // The observed bounds from scripts/calibrate-work-threshold.ts. If either
    // floor drifts outside its band it has stopped filtering, or started
    // refusing subjects the collection holds.
    expect(WORK_SIMILARITY_FLOOR.latin).toBeGreaterThan(0.505); // latin off-topic max
    expect(WORK_SIMILARITY_FLOOR.latin).toBeLessThan(0.589); // latin on-topic min
    expect(WORK_SIMILARITY_FLOOR.khmer).toBeGreaterThan(0.611); // khmer off-topic max
    expect(WORK_SIMILARITY_FLOOR.khmer).toBeLessThan(0.659); // khmer on-topic min
  });
});
