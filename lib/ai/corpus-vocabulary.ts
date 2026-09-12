// lib/ai/corpus-vocabulary.ts
// Loads the committed vocabulary (corpus-vocabulary.json) and prepares it for
// lookup, once per process. Pure apart from the JSON import — no `server-only`,
// so the benchmark and the unit tests reach the same object the router does.
//
// THE FILE IS COMPACT AND THE OBJECT IS NOT, on purpose. Written out one
// object per term the vocabulary is 1.1 MB; as two term→count maps it is
// ~260 KB, and `script`/`source` are constant within each map, so the loader
// puts them back rather than storing 16,000 copies of the word "page_text".
//
// Rebuild with `npx tsx scripts/build-corpus-vocabulary.ts`. The file records
// when it was built and how many records it saw, so a vocabulary that has
// fallen behind the collection is a fact you can read rather than a suspicion.

import raw from "./corpus-vocabulary.json";
import { prepareVocabulary, type PreparedVocabulary, type Vocabulary, type VocabularyEntry } from "./spellcheck";

interface VocabularyFile {
  generatedAt: string;
  corpusRecords: number;
  /** Latin words drawn from page text → how many records use each. */
  pageTerms: Record<string, number>;
  /** Titles, bylines and taxonomy names, in either script → how many name it. */
  entityTerms: Record<string, number>;
}

const KHMER = /[ក-៿]/u;

function expand(file: VocabularyFile): Vocabulary {
  const entries: VocabularyEntry[] = [];
  for (const [term, records] of Object.entries(file.pageTerms)) {
    entries.push({ term, records, script: "latin", source: "page_text" });
  }
  for (const [term, records] of Object.entries(file.entityTerms)) {
    entries.push({ term, records, script: KHMER.test(term) ? "khmer" : "latin", source: "entity" });
  }
  return { generatedAt: file.generatedAt, corpusRecords: file.corpusRecords, entries };
}

let prepared: PreparedVocabulary | null = null;

/** The corpus vocabulary, prepared for lookup. Built once and reused. */
export function corpusVocabulary(): PreparedVocabulary {
  prepared ??= prepareVocabulary(expand(raw as VocabularyFile));
  return prepared;
}

/** When the vocabulary was built, and against how many records. For the trace and the docs. */
export function vocabularyProvenance(): { generatedAt: string; corpusRecords: number; terms: number } {
  const file = raw as VocabularyFile;
  return {
    generatedAt: file.generatedAt,
    corpusRecords: file.corpusRecords,
    terms: Object.keys(file.pageTerms).length + Object.keys(file.entityTerms).length,
  };
}
