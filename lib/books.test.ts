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
    expect(book.pdfUrl).toBe('https://example.com/file.pdf');
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
