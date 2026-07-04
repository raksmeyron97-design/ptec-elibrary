import { describe, it, expect } from 'vitest';
import { toAPA, toBibTeX, toRIS, toCitationLine, authorList } from './citations';
import type { Publication } from './publications';

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
  publication_date: '2026-03-15',
  abstract: 'A study of   digital pedagogy\nacross programs.',
  abstract_km: null,
  keywords: ['pedagogy', 'STEM'],
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
        { author: { id: 'a1', full_name: 'Only Author', full_name_km: null, orcid: null, email: null }, author_order: 1, is_corresponding: true, affiliation_ids: [] },
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
