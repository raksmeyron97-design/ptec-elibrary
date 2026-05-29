// scripts/migrate-books.mjs
// ════════════════════════════════════════════════════════════════
//  Bulk migration: upload many PDFs + create DB records at once.
//
//  HOW TO USE
//  ----------
//  1. Put all your PDF files in one folder, e.g.  ./books-to-import/
//  2. Create a CSV file (books.csv) describing each book — see the
//     expected columns below. The "filename" column must match the
//     PDF file name in the folder exactly.
//  3. Install deps:   npm i -D csv-parse dotenv
//  4. Run:            node scripts/migrate-books.mjs ./books.csv ./books-to-import
//
//  CSV COLUMNS (header row required):
//    filename,title,author,department,category,language,summary,isbn,year,pages
//
//  Example row:
//    math-grade-7.pdf,Mathematics Grade 7,Sokha Chan,Science,Mathematics,Khmer,A guide...,978-..,2024,188
//
//  SAFE TO RE-RUN: it skips books whose slug already exists, so if the
//  script stops halfway you can just run it again.
// ════════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

// ── Config ──────────────────────────────────────────────────────
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY; // server-only key
const BUCKET        = "book-files";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ── Helpers (mirror your app's logic so data stays consistent) ──
function slugify(value) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `book-${Date.now()}`;
}

const coverColors = [
  "bg-[#0f766e]", "bg-[#2563eb]", "bg-[#7c3aed]", "bg-[#16a34a]",
  "bg-[#db2777]", "bg-[#0891b2]", "bg-[#ca8a04]", "bg-[#ea580c]",
  "bg-[#dc2626]", "bg-[#4f46e5]",
];
function pickCoverColor(title) {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return coverColors[Math.abs(hash) % coverColors.length];
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  const csvPath = process.argv[2];
  const pdfDir  = process.argv[3];

  if (!csvPath || !pdfDir) {
    console.error("Usage: node scripts/migrate-books.mjs <books.csv> <pdf-folder>");
    process.exit(1);
  }

  const rows = parse(readFileSync(csvPath, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`📚 ${rows.length} rows found in ${csvPath}\n`);

  let ok = 0, skipped = 0, failed = 0;

  for (const [i, row] of rows.entries()) {
    const label = `[${i + 1}/${rows.length}] ${row.title || row.filename}`;

    try {
      // 1. Validate required fields
      for (const key of ["filename", "title", "author", "department", "category", "language", "summary"]) {
        if (!row[key] || !String(row[key]).trim()) {
          throw new Error(`missing required column "${key}"`);
        }
      }

      const slug = slugify(row.title);

      // 2. Skip if a book with this slug already exists (idempotent)
      const { data: existing } = await supabase
        .from("books").select("id").eq("slug", slug).maybeSingle();
      if (existing) {
        console.log(`⏭️  ${label} — already exists, skipping`);
        skipped++;
        continue;
      }

      // 3. Read the PDF from disk
      const pdfPath = path.join(pdfDir, row.filename);
      if (!existsSync(pdfPath)) {
        throw new Error(`PDF not found: ${pdfPath}`);
      }
      const pdfBytes = await readFile(pdfPath);
      const fileSizeKb = Math.round(pdfBytes.length / 1024);

      // 4. Upload PDF to Supabase Storage
      const storagePath = `pdfs/${Date.now()}-${slug}.pdf`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, pdfBytes, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (upErr) throw new Error(`upload failed: ${upErr.message}`);

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
      const fileUrl = urlData.publicUrl;

      // 5. Upsert author + category
      const { data: authorRow, error: aErr } = await supabase
        .from("authors")
        .upsert({ name: row.author }, { onConflict: "name" })
        .select("id").single();
      if (aErr) throw new Error(`author: ${aErr.message}`);

      const { data: catRow, error: cErr } = await supabase
        .from("categories")
        .upsert({ name: row.category, slug: slugify(row.category) }, { onConflict: "slug" })
        .select("id").single();
      if (cErr) throw new Error(`category: ${cErr.message}`);

      // 6. Insert book
      const year  = Number(row.year)  || new Date().getFullYear();
      const pages = Number(row.pages) || 1;

      const { data: book, error: bErr } = await supabase
        .from("books")
        .insert({
          title:        row.title,
          slug,
          description:  row.summary,
          author_id:    authorRow.id,
          category_id:  catRow.id,
          language:     row.language,
          published_at: `${year}-01-01`,
          is_published: true,
          department:   row.department,
          isbn:         row.isbn?.trim() || null,
          pages,
          cover_color:  pickCoverColor(row.title),
          cover_url:    null,
        })
        .select("id").single();
      if (bErr) throw new Error(`book insert: ${bErr.message}`);

      // 7. Insert book_file
      const { error: fErr } = await supabase.from("book_files").insert({
        book_id:        book.id,
        format:         "pdf",
        file_url:       fileUrl,
        file_size_kb:   fileSizeKb,
        download_count: 0,
      });
      if (fErr) throw new Error(`book_file insert: ${fErr.message}`);

      console.log(`✅ ${label} — ${(fileSizeKb / 1024).toFixed(1)} MB`);
      ok++;
    } catch (err) {
      console.error(`❌ ${label} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n──────────────────────────────`);
  console.log(`Done.  ✅ ${ok}   ⏭️  ${skipped} skipped   ❌ ${failed} failed`);
  if (failed > 0) {
    console.log(`Fix the failed rows and re-run — existing books are skipped automatically.`);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
