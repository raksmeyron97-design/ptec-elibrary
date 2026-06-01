// lib/books.ts
// ──────────────────────────────────────────────────────────────
// Server-only data layer. This file uses node:fs / node:path, so it
// must ONLY be imported from Server Components / Server Actions —
// never from a "use client" file.
//
// Pure, browser-safe helpers (slugify, departments, the Book type,
// coverColors) live in ./book-utils and are re-exported here for
// backward compatibility, so existing imports from "@/lib/books"
// keep working.
// ──────────────────────────────────────────────────────────────

import fs from "node:fs";
import path from "node:path";

import {
  type Book,
  departments,
  coverColors,
  slugify,
} from "./book-utils";

// Re-export pure utils so existing `@/lib/books` imports still work.
export { departments, coverColors, slugify };
export type { Book };

// ── Shared Supabase row → Book mapper ─────────────────────────
// Used by both /books (list) and /books/[slug] (detail) pages
// so the mapping logic lives in one place only.
export function mapRowToBook(row: any): Book {
  const files = Array.isArray(row.book_files) ? row.book_files : [];
  const pdfFile = files.find((f: any) => f.format === "pdf") ?? files[0] ?? null;

  return {
    slug:          row.slug,
    title:         row.title,
    author:        row.authors?.name     ?? "Unknown",
    isbn:          row.isbn              ?? "N/A",
    department:    row.department        ?? "General",
    category:      row.categories?.name  ?? "General",
    language:      row.language          ?? "English",
    year:          row.published_at
                     ? new Date(row.published_at).getFullYear()
                     : new Date().getFullYear(),
    format:        "PDF",
    availability:  "Digital",
    rating:        Number(row.rating)    || 5,
    pages:         row.pages             ?? 1,
    summary:       row.description       ?? "",
    cover:         row.cover_color       ?? "bg-[#0a1629]",
    coverUrl:      row.cover_url         ?? null,
    pdfUrl:        pdfFile?.file_url     ?? null,
    uploadedAt:    row.published_at      ?? undefined,
    downloadCount: row.download_count    ?? 0,
    viewCount:     row.view_count        ?? 0,
    dbId:          row.id                ?? null,
    tags:          Array.isArray(row.tags)
                     ? row.tags
                     : [row.department, row.categories?.name, row.language, row.authors?.name]
                         .filter(Boolean)
                         .map((t: string) => t.toLowerCase()),
  };
}

const uploadedBooksPath = path.join(process.cwd(), "lib", "uploaded-books.json");

export const sampleBooks: Book[] = [
  {
    slug: "child-centered-pedagogy",
    title: "Child-Centered Pedagogy for Cambodian Classrooms",
    author: "PTEC Faculty Team",
    isbn: "978-99963-41-20-1",
    department: "Pedagogy",
    category: "Teaching Methods",
    language: "English / Khmer",
    year: 2025,
    format: "PDF",
    availability: "Digital",
    rating: 4.8,
    pages: 214,
    summary:
      "Practical lesson routines, reflective prompts, and classroom observation tools for active learning in primary and lower secondary schools.",
    cover: "bg-[#0f766e]",
    pdfUrl: "",
    tags: ["lesson planning", "active learning", "assessment"],
  },
  {
    slug: "primary-math-methods",
    title: "Primary Mathematics Methods 12+4",
    author: "Sokha Chan",
    isbn: "978-9924-88-304-5",
    department: "Primary Education",
    category: "Mathematics",
    language: "Khmer",
    year: 2024,
    format: "Print",
    availability: "Available",
    rating: 4.6,
    pages: 188,
    summary:
      "A teacher-training guide for number sense, geometry, problem solving, manipulatives, and formative assessment.",
    cover: "bg-[#2563eb]",
    pdfUrl: "",
    tags: ["math", "primary", "12+4"],
  },
  {
    slug: "educational-psychology",
    title: "Educational Psychology and Learner Development",
    author: "Dr. Lina Pov",
    isbn: "978-99950-77-18-8",
    department: "Pedagogy",
    category: "Psychology",
    language: "English",
    year: 2023,
    format: "PDF",
    availability: "Digital",
    rating: 4.7,
    pages: 302,
    summary:
      "Core theories of learning, motivation, classroom climate, inclusion, and adolescent development for teacher candidates.",
    cover: "bg-[#7c3aed]",
    pdfUrl: "",
    tags: ["psychology", "inclusion", "motivation"],
  },
  {
    slug: "science-lab-safety",
    title: "Science Lab Safety and Inquiry Activities",
    author: "Mao Rithy",
    isbn: "978-9924-51-012-5",
    department: "Science",
    category: "Science",
    language: "English / Khmer",
    year: 2025,
    format: "PDF",
    availability: "Digital",
    rating: 4.5,
    pages: 146,
    summary:
      "Low-cost experiments, safety checklists, and inquiry-based teaching sequences for biology, chemistry, and physics.",
    cover: "bg-[#16a34a]",
    pdfUrl: "",
    tags: ["science", "lab", "inquiry"],
  },
  {
    slug: "academic-english-teachers",
    title: "Academic English for Teacher Trainees",
    author: "PTEC Language Department",
    isbn: "978-99963-52-90-0",
    department: "Language",
    category: "English",
    language: "English",
    year: 2024,
    format: "Audio",
    availability: "Available",
    rating: 4.4,
    pages: 176,
    summary:
      "Reading, presentation, and academic vocabulary units designed for BA+1 and 12+4 teacher education programs.",
    cover: "bg-[#db2777]",
    pdfUrl: "",
    tags: ["english", "speaking", "academic skills"],
  },
  {
    slug: "digital-learning-toolkit",
    title: "Digital Learning Toolkit for Future Teachers",
    author: "ICT in Education Unit",
    isbn: "978-9924-73-811-6",
    department: "Technology",
    category: "ICT",
    language: "English / Khmer",
    year: 2026,
    format: "Video",
    availability: "Digital",
    rating: 4.9,
    pages: 92,
    summary:
      "A compact toolkit for blended learning, open educational resources, accessibility, and classroom media production.",
    cover: "bg-[#0891b2]",
    pdfUrl: "",
    tags: ["ICT", "OER", "blended learning"],
  },
  {
    slug: "action-research-guide",
    title: "Action Research Guide for Practicum",
    author: "Research Office",
    isbn: "978-99963-84-14-7",
    department: "Research",
    category: "Research",
    language: "English",
    year: 2025,
    format: "PDF",
    availability: "Digital",
    rating: 4.7,
    pages: 128,
    summary:
      "Templates and examples for classroom action research questions, data collection, ethics, and final reporting.",
    cover: "bg-[#ca8a04]",
    pdfUrl: "",
    tags: ["research", "practicum", "data"],
  },
  {
    slug: "lower-secondary-khmer-literacy",
    title: "Lower Secondary Khmer Literacy Strategies",
    author: "Kunthea Em",
    isbn: "978-9924-90-226-5",
    department: "Lower Secondary",
    category: "Literacy",
    language: "Khmer",
    year: 2023,
    format: "Print",
    availability: "Borrowed",
    rating: 4.3,
    pages: 241,
    summary:
      "Strategies for vocabulary, comprehension, writing conferences, and culturally responsive reading instruction.",
    cover: "bg-[#ea580c]",
    pdfUrl: "",
    tags: ["khmer", "literacy", "secondary"],
  },
];

function readUploadedBooks(): Book[] {
  try {
    if (!fs.existsSync(uploadedBooksPath)) {
      return [];
    }

    const content = fs.readFileSync(uploadedBooksPath, "utf8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeUploadedBooks(books: Book[]) {
  fs.mkdirSync(path.dirname(uploadedBooksPath), { recursive: true });
  fs.writeFileSync(uploadedBooksPath, JSON.stringify(books, null, 2));
}

function uniqueSlug(title: string, existingBooks: Book[]) {
  const base = slugify(title);
  let slug = base;
  let index = 2;

  while (existingBooks.some((book) => book.slug === slug)) {
    slug = `${base}-${index}`;
    index += 1;
  }

  return slug;
}

export function getAllBooks() {
  return [...readUploadedBooks(), ...sampleBooks];
}

export const books = getAllBooks();

export function getBookBySlug(slug: string) {
  return getAllBooks().find((book) => book.slug === slug);
}

export function filterBooks(params: {
  q?: string;
  dept?: string;
  format?: string;
  language?: string;
}) {
  const query = params.q?.toLowerCase().trim();
  const dept = params.dept?.toLowerCase().trim();
  const format = params.format?.toLowerCase().trim();
  const language = params.language?.toLowerCase().trim();

  return getAllBooks().filter((book) => {
    const matchesQuery =
      !query ||
      [book.title, book.author, book.isbn, book.category, ...book.tags]
        .join(" ")
        .toLowerCase()
        .includes(query);
    const matchesDept = !dept || book.department.toLowerCase().includes(dept);
    const matchesFormat = !format || book.format.toLowerCase() === format;
    const matchesLanguage =
      !language || book.language.toLowerCase().includes(language);

    return matchesQuery && matchesDept && matchesFormat && matchesLanguage;
  });
}

export function addUploadedBook(input: {
  title: string;
  author: string;
  isbn?: string;
  department: string;
  category: string;
  language: string;
  year: number;
  pages: number;
  summary: string;
  pdfUrl: string;
}) {
  const uploadedBooks = readUploadedBooks();
  const existingBooks = [...uploadedBooks, ...sampleBooks];
  const slug = uniqueSlug(input.title, existingBooks);
  const color = coverColors[uploadedBooks.length % coverColors.length];

  const book: Book = {
    slug,
    title: input.title,
    author: input.author,
    isbn: input.isbn || "N/A",
    department: input.department,
    category: input.category,
    language: input.language,
    year: input.year,
    format: "PDF",
    availability: "Digital",
    rating: 5,
    pages: input.pages,
    summary: input.summary,
    cover: color,
    pdfUrl: input.pdfUrl,
    uploadedAt: new Date().toISOString(),
    tags: [
      input.department,
      input.category,
      input.language,
      input.author,
      input.title,
    ].map((tag) => tag.toLowerCase()),
  };

  writeUploadedBooks([book, ...uploadedBooks]);
  return book;
}