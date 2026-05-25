import Link from "next/link";
import { Suspense } from "react";
import BookCard from "@/components/ui/BookCard";
import Icon from "@/components/ui/Icon";
import SearchBar from "@/components/ui/SearchBar";
import { departments, getAllBooks } from "@/lib/books";

export const dynamic = "force-dynamic";

const stats = [
  ["8,400+", "Learning resources"],
  ["7", "Academic collections"],
  ["24/7", "Digital access"],
  ["1,600+", "Trainees served"],
];

const quickFilters = [
  { label: "Pedagogy", href: "/books?dept=pedagogy" },
  { label: "Math 12+4", href: "/books?dept=mathematics" },
  { label: "Research Papers", href: "/research" },
];

export default function HomePage() {
  const books = getAllBooks();
  const featuredBooks = books.slice(0, 4);

  return (
    <>
      {/* ── 1. HERO SECTION (Premium Glassmorphism) ── */}
      <section 
        className="relative overflow-hidden bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/back.png')" }}
      >
        {/* Improved Gradient Overlay for better readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#051324]/95 via-[#0a1b35]/85 to-[#051324]/90 backdrop-blur-[2px]" />

        <div className="relative mx-auto grid max-w-[1400px] gap-12 px-6 py-20 md:px-12 lg:grid-cols-[1.1fr_.9fr] lg:py-28">
          
          {/* Left Content */}
          <div className="flex flex-col justify-center">
            <div className="mb-6 inline-flex w-fit items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[13px] font-semibold uppercase tracking-wide text-cyan-300 backdrop-blur-md">
              <Icon name="school" className="text-[16px]" />
              Phnom Penh Teacher Education College
            </div>
            
            <h1 className="max-w-3xl text-4xl font-extrabold leading-tight text-white md:text-6xl lg:leading-[1.15]">
              PTEC digital library for researchers
            </h1>
            
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-300">
              Search, open, and read PDF books, research papers, and teacher
              education references directly inside the website.
            </p>

            {/* Search Bar Container */}
            <div className="mt-8 max-w-2xl rounded-2xl bg-white p-2.5 shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
              <Suspense fallback={<div className="h-12 w-full animate-pulse rounded-lg bg-slate-100" />}>
                <SearchBar />
              </Suspense>
            </div>

            {/* Quick Filters (New UI Addition) */}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-slate-400">Popular:</span>
              {quickFilters.map((filter) => (
                <Link 
                  key={filter.label} 
                  href={filter.href}
                  className="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm text-slate-200 transition-colors hover:bg-[#007c91] hover:text-white"
                >
                  {filter.label}
                </Link>
              ))}
            </div>

            {/* Stats (Sleeker design) */}
            <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4 max-w-2xl">
              {stats.map(([value, label]) => (
                <div key={label} className="flex flex-col justify-center rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-md transition-colors hover:bg-white/10">
                  <div className="text-3xl font-bold text-white">{value}</div>
                  <div className="mt-1 text-sm font-medium text-slate-400">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Content (Floating Books Grid) */}
          <div className="relative hidden lg:block">
             <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 blur-2xl" />
             <div className="relative grid h-[520px] grid-cols-3 gap-5 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-lg">
              {books.slice(0, 6).map((book, index) => (
                <Link
                  key={book.slug}
                  href={`/books/${book.slug}`}
                  // Improved Book Card UI: hover scale, better shadows, inner ring
                  className={`${book.cover} group relative flex min-h-[220px] flex-col justify-between overflow-hidden rounded-xl p-5 text-white shadow-lg ring-1 ring-white/20 transition-all duration-300 hover:-translate-y-2 hover:shadow-cyan-900/40 hover:ring-white/40 ${
                    index % 2 === 0 ? "mt-6" : "mb-6"
                  }`}
                >
                  {/* Subtle gradient overlay to make text readable */}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/5 to-black/40 opacity-50 transition-opacity group-hover:opacity-70" />
                  
                  <span className="relative z-10 text-[10px] font-bold uppercase tracking-widest text-white/90 drop-shadow-md">
                    {book.category}
                  </span>
                  <span className="relative z-10 text-base font-bold leading-snug drop-shadow-lg">
                    {book.title}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. BROWSE COLLECTIONS (Cleaner, More Whitespace) ── */}
      <section className="bg-white px-6 py-20 md:px-12">
        <div className="mx-auto max-w-[1400px]">
          <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">Browse collections</h2>
              <p className="mt-3 text-[17px] text-slate-600">
                Start with the programme area closest to your coursework.
              </p>
            </div>
            <Link href="/books" className="group flex items-center gap-2 font-semibold text-[#007c91] transition-colors hover:text-[#005f6f]">
              View all resources
              <Icon name="chevron-right" className="transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
          
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {departments.slice(0, 4).map((department) => (
              <Link
                key={department}
                href={`/books?dept=${encodeURIComponent(department.toLowerCase())}`}
                // Refined card: Soft background, icon wrapper, gentle hover lift
                className="group flex flex-col rounded-2xl border border-slate-200 bg-slate-50 p-8 transition-all duration-300 hover:-translate-y-1 hover:border-[#007c91]/30 hover:bg-white hover:shadow-xl hover:shadow-[#007c91]/5"
              >
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-[#007c91]/10 text-[#007c91] transition-colors group-hover:bg-[#007c91] group-hover:text-white">
                  <Icon
                    name={department === "Technology" ? "devices" : "school"}
                    className="text-3xl"
                  />
                </div>
                <h3 className="mb-3 text-xl font-bold text-slate-900">{department}</h3>
                <p className="text-sm leading-relaxed text-slate-600">
                  Curated textbooks, open resources, and practicum references.
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. FEATURED RESOURCES ── */}
      <section className="bg-slate-50 border-t border-slate-200/60 px-6 py-20 md:px-12">
        <div className="mx-auto max-w-[1400px]">
          <div className="mb-12 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">Featured resources</h2>
              <p className="mt-3 text-[17px] text-slate-600">
                High-demand materials for coursework, practicum, and research.
              </p>
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            {featuredBooks.map((book) => (
              <BookCard key={book.slug} book={book} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}