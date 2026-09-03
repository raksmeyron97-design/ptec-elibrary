import { describe, it, expect } from 'vitest';
import { mapRowToBook } from './books';
import { slugify } from './book-utils';

describe('slugify', () => {
  it('should format simple strings', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('should remove special characters', () => {
    expect(slugify('The @ Great! Gatsby')).toBe('the-great-gatsby');
  });

  it('should collapse multiple spaces', () => {
    expect(slugify('A   Long   Title')).toBe('a-long-title');
  });
});

describe('mapRowToBook — file url and download policy', () => {
  const withFile = (over: Record<string, unknown> = {}) => ({
    id: 'db-123',
    slug: 'x',
    title: 'X',
    book_files: [{ format: 'pdf', file_url: 'https://cdn.example/secret/book.pdf' }],
    ...over,
  });

  // book_files.file_url is fetched with no credentials, so anyone holding the
  // string can retrieve the PDF forever — no session, no rate limit, no
  // download policy, no log. A Book is serialized into Client Components and
  // Server Action results, so putting the raw url on it publishes the file.
  it('never exposes the raw storage url', () => {
    const book = mapRowToBook(withFile());
    expect(book.pdfUrl).toBe('/api/books/db-123/file');
    expect(book.pdfUrl).not.toContain('cdn.example');
  });

  it('falls back to the raw url only when there is no id to build a proxy url from', () => {
    const row = withFile();
    delete (row as Record<string, unknown>).id;
    expect(mapRowToBook(row).pdfUrl).toBe('https://cdn.example/secret/book.pdf');
  });

  it('reports no pdf when the book has no file', () => {
    expect(mapRowToBook(withFile({ book_files: [] })).pdfUrl).toBeNull();
  });

  it.each([
    ['column absent', {}, true],
    ['null', { allow_download: null }, true],
    ['true', { allow_download: true }, true],
    ['false', { allow_download: false }, false],
  ])('reads allow_download %s as %s', (_label, over, expected) => {
    expect(mapRowToBook(withFile(over)).allowDownload).toBe(expected);
  });
});

describe('mapRowToBook', () => {
  it('should map a complete DB row correctly', () => {
    const mockRow = {
      id: 'db-123',
      slug: 'test-book',
      title: 'Test Book',
      authors: { name: 'John Doe' },
      isbn: '1234567890',
      departments: { name: 'Science' },
      categories: { name: 'Physics' },
      language: 'English',
      published_at: '2023-01-01',
      avg_rating: 4.5,
      pages: 100,
      description: 'A test book.',
      cover_color: 'bg-red-500',
      cover_url: 'https://example.com/cover.jpg',
      download_count: 10,
      view_count: 20,
      book_files: [{ format: 'pdf', file_url: 'https://example.com/file.pdf' }]
    };

    const book = mapRowToBook(mockRow);

    expect(book.title).toBe('Test Book');
    expect(book.author).toBe('John Doe');
    expect(book.department).toBe('Science');
    expect(book.year).toBe(2023);
    // The PROXY url, never the raw storage url — see bookFileHref().
    expect(book.pdfUrl).toBe('/api/books/db-123/file');
    expect(book.rating).toBe(4.5);
  });

  it('should handle missing optional fields with defaults', () => {
    const mockRow = {
      slug: 'minimal-book',
      title: 'Minimal Book'
    };

    const book = mapRowToBook(mockRow);

    expect(book.author).toBe('Unknown');
    expect(book.isbn).toBe('N/A');
    expect(book.department).toBe('General');
    // 0 = unknown year. Defaulting to the current year would fabricate a
    // publication date in displays and citations (2026-07-11 metadata audit).
    expect(book.year).toBe(0);
    expect(book.pdfUrl).toBeNull();
    expect(book.rating).toBe(0);
  });
});
