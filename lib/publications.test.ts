import { describe, it, expect } from 'vitest';
import { mapRowToPublication } from './publications';

const baseRow = {
  id: 'pub-1',
  slug: 'digital-pedagogy-2026',
  title: 'Digital Pedagogy Adoption',
  article_type: 'article',
  journal_name: 'PTEC Journal of Education',
  volume: '12',
  issue_no: '3',
  page_start: '101',
  page_end: '118',
  doi: '10.1234/ptec.2026.001',
  publication_date: '2026-03-15',
  abstract: 'A study of digital pedagogy.',
  keywords: ['pedagogy', 'STEM'],
  language: 'en',
  cover_url: 'https://cdn.example.com/cover.webp',
  pdf_url: 'https://cdn.example.com/article.pdf',
  references: [{ index: 1, text: 'Smith, J. (2024). Teacher training.' }],
  is_published: true,
  published_at: '2026-03-20T00:00:00Z',
  view_count: 42,
  download_count: 7,
  created_at: '2026-03-01T00:00:00Z',
};

describe('mapRowToPublication', () => {
  it('maps the publications_with_stats view shape (author_names string)', () => {
    const pub = mapRowToPublication({
      ...baseRow,
      author_names: 'Sok San, Chan Dara',
    });

    expect(pub.id).toBe('pub-1');
    expect(pub.slug).toBe('digital-pedagogy-2026');
    expect(pub.title).toBe('Digital Pedagogy Adoption');
    expect(pub.article_type).toBe('article');
    expect(pub.journal_name).toBe('PTEC Journal of Education');
    expect(pub.author_names).toBe('Sok San, Chan Dara');
    expect(pub.keywords).toEqual(['pedagogy', 'STEM']);
    expect(pub.references).toEqual([{ index: 1, text: 'Smith, J. (2024). Teacher training.' }]);
    expect(pub.is_published).toBe(true);
    expect(pub.view_count).toBe(42);
    expect(pub.download_count).toBe(7);
    // View shape has no embedded relations
    expect(pub.authorships).toBeUndefined();
    expect(pub.files).toBeUndefined();
  });

  it('maps the embedded-select shape (publication_authorships + publication_files)', () => {
    const pub = mapRowToPublication({
      ...baseRow,
      publication_authorships: [
        {
          author_order: 2,
          is_corresponding: false,
          affiliation_ids: [],
          publication_authors: {
            id: 'a2',
            full_name: 'Chan Dara',
            full_name_km: null,
            orcid: null,
            email: null,
          },
        },
        {
          author_order: 1,
          is_corresponding: true,
          affiliation_ids: ['aff-1'],
          publication_authors: {
            id: 'a1',
            full_name: 'Sok San',
            full_name_km: 'សុខ សាន',
            orcid: '0000-0001-2345-6789',
            email: 'sok.san@ptec.edu.kh',
          },
        },
      ],
      publication_files: [
        { id: 'f2', label: 'Dataset', file_url: 'https://cdn/x2.pdf', file_type: 'pdf', size_bytes: 100, sort_order: 1 },
        { id: 'f1', label: 'Supporting Information', file_url: 'https://cdn/x1.pdf', file_type: 'pdf', size_bytes: 200, sort_order: 0 },
      ],
    });

    // Authorships sorted by author_order
    expect(pub.authorships).toHaveLength(2);
    expect(pub.authorships?.[0].author.full_name).toBe('Sok San');
    expect(pub.authorships?.[0].is_corresponding).toBe(true);
    expect(pub.authorships?.[0].affiliation_ids).toEqual(['aff-1']);
    expect(pub.authorships?.[1].author.full_name).toBe('Chan Dara');

    // Byline derived from sorted embedded authors when no aggregate present
    expect(pub.author_names).toBe('Sok San, Chan Dara');

    // Files sorted by sort_order
    expect(pub.files?.map((f) => f.id)).toEqual(['f1', 'f2']);
  });

  it('prefers the view aggregate over deriving from embedded authors', () => {
    const pub = mapRowToPublication({
      ...baseRow,
      author_names: 'From View',
      publication_authorships: [
        {
          author_order: 1,
          is_corresponding: false,
          affiliation_ids: [],
          publication_authors: { id: 'a1', full_name: 'Embedded Author' },
        },
      ],
    });
    expect(pub.author_names).toBe('From View');
  });

  it('applies safe defaults for missing optional fields', () => {
    const pub = mapRowToPublication({
      id: 'pub-2',
      slug: 'minimal',
      title: 'Minimal Row',
      created_at: '2026-01-01T00:00:00Z',
    });

    expect(pub.article_type).toBe('article');
    expect(pub.language).toBe('en');
    expect(pub.keywords).toEqual([]);
    expect(pub.references).toEqual([]);
    expect(pub.is_published).toBe(false);
    expect(pub.view_count).toBe(0);
    expect(pub.download_count).toBe(0);
    expect(pub.author_names).toBeNull();
    expect(pub.doi).toBeNull();
    expect(pub.cover_url).toBeNull();
    expect(pub.pdf_url).toBeNull();
    // Detail-page enrichment fields (migration 0056)
    expect(pub.publisher).toBeNull();
    expect(pub.isbn).toBeNull();
    expect(pub.subjects).toEqual([]);
    expect(pub.table_of_contents).toEqual([]);
    expect(pub.learning_outcomes).toEqual([]);
    expect(pub.faqs).toEqual([]);
  });

  it('maps the enrichment fields when present', () => {
    const pub = mapRowToPublication({
      ...baseRow,
      publisher: 'PTEC Press',
      isbn: '978-9924-01-234-5',
      subjects: ['Education'],
      table_of_contents: [{ title: 'Introduction', page: '1' }],
      learning_outcomes: ['Explain adoption drivers'],
      faqs: [{ question: 'Who is this for?', answer: 'Teacher educators.' }],
    });

    expect(pub.publisher).toBe('PTEC Press');
    expect(pub.isbn).toBe('978-9924-01-234-5');
    expect(pub.subjects).toEqual(['Education']);
    expect(pub.table_of_contents).toEqual([{ title: 'Introduction', page: '1' }]);
    expect(pub.learning_outcomes).toEqual(['Explain adoption drivers']);
    expect(pub.faqs).toEqual([{ question: 'Who is this for?', answer: 'Teacher educators.' }]);
  });

  it('normalises a non-array references value to an empty list', () => {
    const pub = mapRowToPublication({ ...baseRow, references: null });
    expect(pub.references).toEqual([]);
  });
});
