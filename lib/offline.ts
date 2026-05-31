export type OfflineBook = {
  id: string;
  slug: string;
  title: string;
  author: string;
  coverUrl: string | null;
  coverColor: string | undefined;
  pdfUrl: string;
  savedAt: number;
};

const OFFLINE_STORAGE_KEY = 'ptec_offline_books';
const MAX_OFFLINE_BOOKS = 10;

export function getOfflineBooks(): OfflineBook[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(OFFLINE_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveOfflineBookMeta(book: OfflineBook) {
  const books = getOfflineBooks();
  const existingIndex = books.findIndex((b) => b.id === book.id);
  if (existingIndex >= 0) {
    books[existingIndex] = book;
  } else {
    books.push(book);
  }
  
  if (books.length > MAX_OFFLINE_BOOKS) {
    books.sort((a, b) => b.savedAt - a.savedAt);
    const removed = books.splice(MAX_OFFLINE_BOOKS);
    removed.forEach(b => removeBookFromCache(b.pdfUrl, b.coverUrl));
  }
  
  localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(books));
}

export function removeOfflineBookMeta(id: string) {
  const books = getOfflineBooks();
  const book = books.find((b) => b.id === id);
  if (book) {
    removeBookFromCache(book.pdfUrl, book.coverUrl);
    const filtered = books.filter((b) => b.id !== id);
    localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(filtered));
  }
}

export function isOfflineBookSaved(id: string): boolean {
  return getOfflineBooks().some((b) => b.id === id);
}

export async function removeBookFromCache(pdfUrl: string, coverUrl: string | null) {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open('offline-books');
    await cache.delete(pdfUrl);
    if (coverUrl) {
      await cache.delete(coverUrl);
      const coverCache = await caches.open('book-covers');
      await coverCache.delete(coverUrl);
    }
  } catch (e) {
    console.error('Failed to remove from cache:', e);
  }
}
