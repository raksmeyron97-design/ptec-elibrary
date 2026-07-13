import { describe, it, expect } from 'vitest';
import {
  toAPA, toMLA, toChicago, toIEEE, toBibTeX, toRIS, toCitationLine, authorList,
  apa, bibtex, ris, bibtexKey, citationFileName,
  type CitationWork,
} from './citations';
import {
  bookToCitationWork,
  buildBookCitation,
} from './books/citation';
import {
  thesisToCitationWork,
  buildCitation as buildThesisCitation,
} from './theses/citation';
import type { Publication } from './publications';
import type { Book } from './book-utils';

/**
 * Minimal strict BibTeX entry parser (test-only). Accepts exactly the shape
 * our formatter emits — `@type{key,\n  field = {value},\n…\n}` — and throws
 * on anything malformed, including unbalanced braces inside a value. Passing
 * this parser is what "the BibTeX output parses" means in these tests.
 */
function parseBibTeXEntry(src: string): { type: string; key: string; fields: Record<string, string> } {
  const m = src.match(/^@([A-Za-z]+)\{([^,\s{}]+),\n([\s\S]*)\n\}$/);
  if (!m) throw new Error(`not a BibTeX entry:\n${src}`);
  const [, type, key, body] = m;
  const fields: Record<string, string> = {};
  for (const line of body.split(',\n')) {
    const fm = line.match(/^ {2}([A-Za-z]+) = \{(.*)\}$/);
    if (!fm) throw new Error(`bad field line: ${line}`);
    let depth = 0;
    for (const ch of fm[2]) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      if (depth < 0) throw new Error(`unbalanced braces in ${fm[1]}: ${fm[2]}`);
    }
    if (depth !== 0) throw new Error(`unbalanced braces in ${fm[1]}: ${fm[2]}`);
    fields[fm[1].toLowerCase()] = fm[2];
  }
  return { type, key, fields };
}

const pub: Publication = {
  id: 'pub-1',
  slug: 'digital-pedagogy-2026',
  title: 'Digital Pedagogy Adoption in Cambodian Teacher Education',
  title_km: null,
  article_type: 'article',
  journal_name: 'PTEC Journal of Education',
  volume: '12',
  issue_no: '3',
  page_start: '101',
  page_end: '118',
  article_no: null,
  doi: '10.1234/ptec.2026.001',
  issn: null,
  publication_date: '2026-03-15',
  abstract: 'A study of   digital pedagogy\nacross programs.',
  abstract_km: null,
  keywords: ['pedagogy', 'STEM'],
  publisher: null,
  isbn: null,
  subjects: [],
  table_of_contents: [],
  learning_outcomes: [],
  faqs: [],
  license: 'CC BY 4.0',
  copyright: null,
  language: 'en',
  cover_url: null,
  pdf_url: null,
  references: [],
  is_published: true,
  published_at: '2026-03-20T00:00:00Z',
  view_count: 0,
  download_count: 0,
  created_at: '2026-03-01T00:00:00Z',
  author_names: 'Sok San, Chan Dara',
};

describe('authorList', () => {
  it('splits the comma-joined byline', () => {
    expect(authorList(pub)).toEqual(['Sok San', 'Chan Dara']);
  });

  it('prefers embedded authorships when present', () => {
    const withAuthorships: Publication = {
      ...pub,
      authorships: [
        { author: { id: 'a1', full_name: 'Only Author', full_name_km: null, orcid: null, email: null, bio: null, bio_km: null, photo_url: null }, author_order: 1, is_corresponding: true, affiliation_ids: [] },
      ],
    };
    expect(authorList(withAuthorships)).toEqual(['Only Author']);
  });
});

describe('toCitationLine', () => {
  it('builds "Journal Year, Vol (Issue), pages"', () => {
    expect(toCitationLine(pub)).toBe('PTEC Journal of Education 2026, 12 (3), 101–118');
  });

  it('falls back to article number when there are no pages', () => {
    const noPages = { ...pub, page_start: null, page_end: null, article_no: 'e0042' };
    expect(toCitationLine(noPages)).toBe('PTEC Journal of Education 2026, 12 (3), e0042');
  });
});

describe('toAPA', () => {
  it('produces an APA-style reference with DOI link', () => {
    const apa = toAPA(pub);
    expect(apa).toBe(
      'Sok San, Chan Dara (2026). Digital Pedagogy Adoption in Cambodian Teacher Education. ' +
      'PTEC Journal of Education, 12(3), 101–118. https://doi.org/10.1234/ptec.2026.001',
    );
  });

  it('falls back to the article URL when there is no DOI', () => {
    const noDoi = { ...pub, doi: null };
    expect(toAPA(noDoi)).toContain('/publications/digital-pedagogy-2026');
  });
});

describe('toMLA', () => {
  it('produces an MLA-style reference with venue, year, and pages', () => {
    const mla = toMLA(pub);
    expect(mla).toBe(
      'Sok San, Chan Dara. "Digital Pedagogy Adoption in Cambodian Teacher Education." ' +
      'PTEC Journal of Education, vol. 12, no. 3, 2026, pp. 101–118. ' +
      'https://doi.org/10.1234/ptec.2026.001.',
    );
  });
});

describe('toChicago', () => {
  it('produces a Chicago-style reference with venue and page range', () => {
    const chicago = toChicago(pub);
    expect(chicago).toBe(
      'Sok San, Chan Dara. 2026. "Digital Pedagogy Adoption in Cambodian Teacher Education." ' +
      'PTEC Journal of Education 12 (3): 101–118. https://doi.org/10.1234/ptec.2026.001.',
    );
  });
});

describe('toIEEE', () => {
  it('produces an IEEE-style reference with an [Online] link', () => {
    const ieee = toIEEE(pub);
    expect(ieee).toBe(
      'Sok San, Chan Dara, "Digital Pedagogy Adoption in Cambodian Teacher Education," ' +
      'PTEC Journal of Education, vol. 12, no. 3, pp. 101–118, 2026. ' +
      '[Online]. Available: https://doi.org/10.1234/ptec.2026.001',
    );
  });
});

describe('toBibTeX', () => {
  it('produces a valid @article entry', () => {
    const bib = toBibTeX(pub);
    expect(bib).toMatch(/^@article\{sok2026digital,\n/);
    expect(bib).toContain('  author = {Sok San and Chan Dara}');
    expect(bib).toContain('  journal = {PTEC Journal of Education}');
    expect(bib).toContain('  year = {2026}');
    expect(bib).toContain('  volume = {12}');
    expect(bib).toContain('  number = {3}');
    expect(bib).toContain('  pages = {101–118}');
    expect(bib).toContain('  doi = {10.1234/ptec.2026.001}');
    expect(bib.trim().endsWith('}')).toBe(true);
  });

  it('omits empty fields', () => {
    const minimal = { ...pub, journal_name: null, volume: null, issue_no: null, doi: null, page_start: null, page_end: null };
    const bib = toBibTeX(minimal);
    expect(bib).not.toContain('journal =');
    expect(bib).not.toContain('volume =');
    expect(bib).not.toContain('doi =');
  });
});

describe('toRIS', () => {
  it('produces TY JOUR with one AU line per author and ER terminator', () => {
    const ris = toRIS(pub);
    const lines = ris.split('\n');
    expect(lines[0]).toBe('TY  - JOUR');
    expect(lines).toContain('AU  - Sok San');
    expect(lines).toContain('AU  - Chan Dara');
    expect(lines).toContain('JO  - PTEC Journal of Education');
    expect(lines).toContain('PY  - 2026');
    expect(lines).toContain('VL  - 12');
    expect(lines).toContain('IS  - 3');
    expect(lines).toContain('SP  - 101');
    expect(lines).toContain('EP  - 118');
    expect(lines).toContain('KW  - pedagogy');
    expect(lines).toContain('DO  - 10.1234/ptec.2026.001');
    expect(lines[lines.length - 1]).toBe('ER  - ');
  });

  it('collapses whitespace in the abstract', () => {
    const ris = toRIS(pub);
    expect(ris).toContain('AB  - A study of digital pedagogy across programs.');
  });
});

// ── Generic formatters over CitationWork ─────────────────────────────────────

const fullBookWork: CitationWork = {
  kind: 'book',
  title: 'Teaching Mathematics in Cambodia',
  authors: ['Sok San', 'Chan Dara'],
  year: '2024',
  publisher: 'MoEYS Publishing',
  isbn: '978-9-99-999999-9',
  pageCount: 240,
  language: 'Khmer',
  url: 'https://library.ptec.edu.kh/books/teaching-mathematics',
};

const sparseWork: CitationWork = {
  kind: 'book',
  title: '',
  authors: [],
  year: null,
  url: 'https://library.ptec.edu.kh/books/mystery',
};

const thesisWork: CitationWork = {
  kind: 'thesis',
  title: 'Reading Fluency in Grade 3 Classrooms',
  authors: ['Pen Sokha'],
  year: '2023',
  publisher: 'Phnom Penh Teacher Education College',
  department: 'Primary Education',
  number: 'Cohort 12',
  noteType: 'Thesis',
  keywords: ['literacy', 'primary'],
  abstract: 'A  study\nspanning   two lines.',
  url: 'https://library.ptec.edu.kh/theses/reading-fluency',
};

describe('apa (generic)', () => {
  it('formats a fully-populated book', () => {
    expect(apa(fullBookWork)).toBe(
      'Sok San, Chan Dara (2024). Teaching Mathematics in Cambodia. ' +
      'MoEYS Publishing. https://library.ptec.edu.kh/books/teaching-mathematics',
    );
  });

  it('falls back gracefully on a sparse work', () => {
    expect(apa(sparseWork)).toBe(
      'Unknown author (n.d.). Untitled. https://library.ptec.edu.kh/books/mystery',
    );
  });

  it('adds the bracketed note type for theses', () => {
    expect(apa(thesisWork)).toContain('Reading Fluency in Grade 3 Classrooms [Thesis].');
  });
});

describe('bibtex (generic)', () => {
  it('produces a parseable @book entry for a fully-populated book', () => {
    const entry = parseBibTeXEntry(bibtex(fullBookWork));
    expect(entry.type).toBe('book');
    expect(entry.key).toBe('sok2024teaching');
    expect(entry.fields.author).toBe('Sok San and Chan Dara');
    expect(entry.fields.publisher).toBe('MoEYS Publishing');
    expect(entry.fields.isbn).toBe('978-9-99-999999-9');
    expect(entry.fields.pages).toBe('240');
    expect(entry.fields.url).toBe('https://library.ptec.edu.kh/books/teaching-mathematics');
  });

  it('produces a parseable entry even for a sparse work', () => {
    const entry = parseBibTeXEntry(bibtex(sparseWork));
    expect(entry.type).toBe('book');
    expect(entry.key).toMatch(/^[a-z0-9]+$/);
    expect(entry.fields.url).toBe('https://library.ptec.edu.kh/books/mystery');
    expect(entry.fields.author).toBeUndefined();
    expect(entry.fields.year).toBeUndefined();
    expect(entry.fields.isbn).toBeUndefined();
  });

  it('maps theses to @techreport with institution/type/number/address', () => {
    const entry = parseBibTeXEntry(bibtex(thesisWork));
    expect(entry.type).toBe('techreport');
    expect(entry.fields.institution).toBe('Phnom Penh Teacher Education College');
    expect(entry.fields.type).toBe('Thesis');
    expect(entry.fields.number).toBe('Cohort 12');
    expect(entry.fields.address).toBe('Primary Education');
  });

  it('escapes LaTeX special characters and drops braces', () => {
    const nasty: CitationWork = {
      ...fullBookWork,
      title: '100% of {braces} & $pecial_chars #1 ~here^ \\ end',
      authors: ["O'Brien & Sons"],
    };
    const entry = parseBibTeXEntry(bibtex(nasty));
    expect(entry.fields.title).toBe(
      '100\\% of braces \\& \\$pecial\\_chars \\#1 \\textasciitilde{}here\\textasciicircum{} \\textbackslash{} end',
    );
    expect(entry.fields.author).toBe("O'Brien \\& Sons");
  });

  it('never LaTeX-escapes DOI and URL fields', () => {
    const withDoi: CitationWork = { ...thesisWork, doi: '10.1234/ptec_2023#7' };
    const entry = parseBibTeXEntry(bibtex(withDoi));
    expect(entry.fields.doi).toBe('10.1234/ptec_2023#7');
  });

  it('publication toBibTeX output parses too', () => {
    const entry = parseBibTeXEntry(toBibTeX(pub));
    expect(entry.type).toBe('article');
    expect(entry.key).toBe('sok2026digital');
  });
});

describe('ris (generic)', () => {
  it('produces a valid record for a fully-populated book', () => {
    const lines = ris(fullBookWork).split('\n');
    expect(lines[0]).toBe('TY  - BOOK');
    expect(lines[lines.length - 1]).toBe('ER  - ');
    expect(lines).toContain('AU  - Sok San');
    expect(lines).toContain('AU  - Chan Dara');
    expect(lines).toContain('PB  - MoEYS Publishing');
    expect(lines).toContain('SN  - 978-9-99-999999-9');
    expect(lines).toContain('LA  - Khmer');
    // Every line must be single-line "TAG  - value".
    for (const line of lines) expect(line).toMatch(/^[A-Z][A-Z0-9]  - /);
  });

  it('omits empty tags on a sparse work but keeps TY/UR/ER', () => {
    const lines = ris(sparseWork).split('\n');
    expect(lines).toEqual([
      'TY  - BOOK',
      'UR  - https://library.ptec.edu.kh/books/mystery',
      'ER  - ',
    ]);
  });

  it('uses TY THES for theses and flattens multi-line abstracts', () => {
    const out = ris(thesisWork);
    const lines = out.split('\n');
    expect(lines[0]).toBe('TY  - THES');
    expect(lines).toContain('AB  - A study spanning two lines.');
    expect(lines).toContain('KW  - literacy');
    expect(lines).toContain('KW  - primary');
  });
});

describe('bibtexKey / citationFileName', () => {
  it('builds firstauthor+year+firstword keys', () => {
    expect(bibtexKey(fullBookWork)).toBe('sok2024teaching');
  });

  it('falls back to "citation" when nothing alphanumeric survives (e.g. Khmer-only)', () => {
    expect(bibtexKey({ kind: 'book', title: 'សៀវភៅ', authors: ['សុខ'], year: null, url: 'x' })).toBe('citation');
  });

  it('names files .bib/.ris/.txt with matching mimes', () => {
    expect(citationFileName('bibtex', fullBookWork)).toEqual({ name: 'sok2024teaching.bib', mime: 'application/x-bibtex' });
    expect(citationFileName('ris', fullBookWork)).toEqual({ name: 'sok2024teaching.ris', mime: 'application/x-research-info-systems' });
    expect(citationFileName('apa', fullBookWork)).toEqual({ name: 'sok2024teaching.txt', mime: 'text/plain' });
  });
});

// ── Domain adapters ──────────────────────────────────────────────────────────

const fullBook: Book = {
  slug: 'khmer-grammar',
  title: 'Khmer Grammar Handbook',
  author: 'Vann Molyvann, Pen Sokha',
  isbn: '978-1-23-456789-7',
  publisher: 'PTEC Press',
  department: 'Language',
  category: 'Language',
  language: 'Khmer',
  year: 2022,
  format: 'PDF',
  availability: 'Digital',
  rating: 4.5,
  pages: 312,
  summary: 'A grammar reference.',
  cover: 'bg-[#0f766e]',
  tags: ['grammar'],
};

// mapRowToBook placeholders for missing data: "Unknown" author, "N/A" isbn, pages 1.
const sparseBook: Book = {
  ...fullBook,
  slug: 'mystery-book',
  title: 'Mystery Book',
  author: 'Unknown',
  isbn: 'N/A',
  publisher: null,
  year: 0,
  pages: 1,
};

describe('bookToCitationWork', () => {
  it('uses the real publisher and splits the byline', () => {
    const work = bookToCitationWork(fullBook);
    expect(work.publisher).toBe('PTEC Press');
    expect(work.authors).toEqual(['Vann Molyvann', 'Pen Sokha']);
    expect(work.year).toBe('2022');
    const entry = parseBibTeXEntry(buildBookCitation('bibtex', fullBook));
    expect(entry.type).toBe('book');
    expect(entry.fields.author).toBe('Vann Molyvann and Pen Sokha');
    expect(entry.fields.publisher).toBe('PTEC Press');
  });

  it('treats mapRowToBook placeholders as missing and never fabricates a publisher', () => {
    const work = bookToCitationWork(sparseBook);
    expect(work.isbn).toBeNull();
    expect(work.pageCount).toBeNull();
    expect(work.year).toBeNull();
    // The repository hosts the copy but did not publish the work — a missing
    // publisher must stay missing rather than being invented (2026-07-11 audit).
    expect(work.publisher).toBeNull();
    // "Unknown" is the mapRowToBook placeholder, not a person named Unknown.
    expect(work.authors).toEqual([]);
    const entry = parseBibTeXEntry(buildBookCitation('bibtex', sparseBook));
    expect(entry.fields.isbn).toBeUndefined();
    expect(entry.fields.pages).toBeUndefined();
    expect(entry.fields.publisher).toBeUndefined();
    expect(entry.fields.author).toBeUndefined();
    expect(buildBookCitation('apa', sparseBook)).toContain('(n.d.)');
    expect(buildBookCitation('apa', sparseBook)).toContain('Unknown author');
  });

  it('preserves accented author names end-to-end (Saldaña, Pérez Cañado)', () => {
    const book: Book = { ...fullBook, author: 'Johnny Saldaña, María Luisa Pérez Cañado' };
    const work = bookToCitationWork(book);
    expect(work.authors).toEqual(['Johnny Saldaña', 'María Luisa Pérez Cañado']);
    expect(buildBookCitation('apa', book)).toContain('Johnny Saldaña, María Luisa Pérez Cañado');
    const entry = parseBibTeXEntry(buildBookCitation('bibtex', book));
    expect(entry.fields.author).toBe('Johnny Saldaña and María Luisa Pérez Cañado');
    expect(buildBookCitation('ris', book)).toContain('AU  - Johnny Saldaña');
  });

  it('handles Khmer author names without corrupting them', () => {
    const book: Book = { ...fullBook, author: 'ក្រសួងអប់រំយុវជន និងកីឡា' };
    const work = bookToCitationWork(book);
    expect(work.authors).toEqual(['ក្រសួងអប់រំយុវជន និងកីឡា']);
    expect(buildBookCitation('apa', book)).toContain('ក្រសួងអប់រំយុវជន និងកីឡា (2022)');
    expect(buildBookCitation('ris', book)).toContain('AU  - ក្រសួងអប់រំយុវជន និងកីឡា');
  });

  it('cites organisation authors verbatim', () => {
    const book: Book = { ...fullBook, author: 'American Psychological Association' };
    expect(bookToCitationWork(book).authors).toEqual(['American Psychological Association']);
    expect(buildBookCitation('apa', book)).toMatch(/^American Psychological Association \(2022\)\./);
  });

  it('author display names never carry degrees (degrees live in authors.credentials)', () => {
    // Data invariant enforced by scripts/fix-metadata-2026-07-11.mjs + migration
    // 0083: names like "Set Seng. Ph.D" are cleaned before they reach citations.
    const book: Book = { ...fullBook, author: 'Set Seng' };
    expect(buildBookCitation('apa', book)).toMatch(/^Set Seng \(2022\)\./);
    expect(buildBookCitation('apa', book)).not.toContain('Ph.D');
  });
});

describe('thesisToCitationWork', () => {
  const report = {
    id: '00000000-0000-0000-0000-000000000001',
    slug: 'reading-impact-study',
    title: 'Reading Impact Study',
    author_names: 'Sok San, Chan Dara',
    abstract: 'An abstract.',
    cohort: 12,
    thesis_type: 'research_report',
    keywords: ['reading', 'impact'],
    department: 'Primary Education',
    published_at: '2023-06-01',
  };

  it('derives type, year, and cohort from real fields', () => {
    const work = thesisToCitationWork(report, report.slug);
    expect(work.noteType).toBe('Research Report');
    expect(work.year).toBe('2023');
    expect(work.number).toBe('Cohort 12');
    expect(work.authors).toEqual(['Sok San', 'Chan Dara']);
    expect(buildThesisCitation('apa', report, report.slug)).toBe(
      'Sok San, Chan Dara (2023). Reading Impact Study [Research Report]. ' +
      'Phnom Penh Teacher Education College. https://library.ptec.edu.kh/theses/reading-impact-study',
    );
  });

  it('produces parseable BibTeX and valid RIS for a sparse report', () => {
    const entry = parseBibTeXEntry(buildThesisCitation('bibtex', {}, 'unknown'));
    expect(entry.type).toBe('techreport');
    expect(entry.fields.institution).toBe('Phnom Penh Teacher Education College');
    const lines = buildThesisCitation('ris', {}, 'unknown').split('\n');
    expect(lines[0]).toBe('TY  - THES');
    expect(lines[lines.length - 1]).toBe('ER  - ');
  });
});
