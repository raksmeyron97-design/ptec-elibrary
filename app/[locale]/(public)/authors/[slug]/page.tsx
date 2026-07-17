import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { PTEC_LIBRARY_NAME, SITE_URL } from "@/lib/seo/site";
import { localeAlternates } from "@/lib/seo/alternates";
import { slugify } from "@/lib/books";
import { createServiceClient } from "@/lib/supabase/server";

export const revalidate = 3600;

type PageProps = { params: Promise<{ slug: string; locale: string }> };

function truncate(text: string | null | undefined, max = 155) {
  const clean = text?.replace(/\s+/g, " ").trim() ?? "";
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

async function resolveAuthor(slug: string) {
  const supabase = createServiceClient();
  const [{ data: bookAuthors }, { data: publicationAuthors }] = await Promise.all([
    supabase.from("authors").select("id, name, bio").order("name", { ascending: true }).limit(1000),
    supabase.from("publication_authors").select("id, full_name, full_name_km, bio, bio_km").order("full_name", { ascending: true }).limit(1000),
  ]);

  const bookAuthor = (bookAuthors ?? []).find((a) => slugify(a.name) === slug);
  const publicationAuthor = (publicationAuthors ?? []).find((a) => slugify(a.full_name) === slug || (a.full_name_km && slugify(a.full_name_km) === slug));
  const name = bookAuthor?.name ?? publicationAuthor?.full_name ?? publicationAuthor?.full_name_km ?? null;
  if (!name) return null;

  const [{ data: books }, { data: publications }, { data: theses }, { data: catalog }] = await Promise.all([
    bookAuthor
      ? supabase
          .from("books")
          .select("id, slug, title, description")
          .eq("is_published", true)
          .eq("author_id", bookAuthor.id)
          .order("download_count", { ascending: false })
          .limit(16)
      : Promise.resolve({ data: [] as any[] }),
    supabase
      .from("publications_with_stats")
      .select("id, slug, title, abstract, author_names")
      .eq("is_published", true)
      .ilike("author_names", `%${name}%`)
      .order("view_count", { ascending: false })
      .limit(16),
    supabase
      .from("research_reports")
      .select("id, slug, title, abstract, author_names")
      .eq("is_published", true)
      .ilike("author_names", `%${name}%`)
      .order("view_count", { ascending: false })
      .limit(16),
    supabase
      .from("catalog_books")
      .select("id, slug, title, description, author")
      .eq("is_active", true)
      .ilike("author", `%${name}%`)
      .order("title", { ascending: true })
      .limit(16),
  ]);

  return {
    name,
    bio: bookAuthor?.bio ?? publicationAuthor?.bio ?? publicationAuthor?.bio_km ?? null,
    slug,
    items: [
      ...(books ?? []).map((item: any) => ({
        type: "E-book",
        title: item.title,
        href: `/books/${item.slug}`,
        excerpt: item.description,
      })),
      ...(publications ?? []).map((item: any) => ({
        type: "Publication",
        title: item.title,
        href: `/publications/${item.slug}`,
        excerpt: item.abstract,
      })),
      ...(theses ?? []).map((item: any) => ({
        type: "Thesis",
        title: item.title,
        href: `/theses/${item.slug ?? item.id}`,
        excerpt: item.abstract,
      })),
      ...(catalog ?? []).map((item: any) => ({
        type: "Physical book",
        title: item.title,
        href: `/catalogs/${item.slug ?? item.id}`,
        excerpt: item.description,
      })),
    ],
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const author = await resolveAuthor(slug);
  if (!author) return { title: "Author not found" };

  const title = `${author.name} | Author`;
  const description = truncate(author.bio, 155) || `Browse PTEC Digital Library resources by ${author.name}.`;
  const alternates = localeAlternates(`/authors/${author.slug}`, locale);
  const canonical = alternates.canonical;

  return {
    title,
    description,
    alternates,
    openGraph: {
      title,
      description,
      type: "profile",
      url: canonical,
      siteName: PTEC_LIBRARY_NAME,
    },
    twitter: { card: "summary", title, description },
  };
}

export default async function AuthorPage({ params }: PageProps) {
  const { slug } = await params;
  const author = await resolveAuthor(slug);
  if (!author) notFound();

  const authorUrl = `${SITE_URL}/authors/${author.slug}`;
  const breadcrumbs = breadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Authors", path: "/books" },
    { name: author.name },
  ]);

  return (
    <main className="min-h-screen bg-bg-body px-4 py-10 sm:px-6 md:px-12">
      <JsonLd data={breadcrumbs} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          name: `${author.name} resources`,
          url: authorUrl,
          mainEntity: {
            "@type": "Person",
            name: author.name,
            description: truncate(author.bio, 300) || undefined,
          },
        }}
      />
      <div className="mx-auto max-w-5xl">
        <nav className="mb-5 text-[13px] font-medium text-text-muted">
          <Link href="/" className="hover:text-brand">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/books" className="hover:text-brand">Authors</Link>
        </nav>
        <header className="mb-8">
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-brand">Author</p>
          <h1 className="mt-2 text-3xl font-bold text-text-heading sm:text-4xl">{author.name}</h1>
          {author.bio && (
            <p className="mt-3 max-w-2xl text-[15px] leading-7 text-text-muted">{author.bio}</p>
          )}
        </header>

        {author.items.length === 0 ? (
          <div className="rounded-2xl border border-divider bg-bg-surface p-8 text-center text-text-muted">
            No public resources are attached to this author yet.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {author.items.map((item) => (
              <Link
                key={`${item.type}-${item.href}`}
                href={item.href}
                className="rounded-xl border border-divider bg-bg-surface p-4 transition-colors hover:border-brand/40"
              >
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand">
                  {item.type}
                </span>
                <h2 className="mt-2 line-clamp-2 text-[15px] font-bold text-text-heading">{item.title}</h2>
                {item.excerpt && <p className="mt-2 line-clamp-2 text-[12.5px] leading-5 text-text-body">{truncate(item.excerpt, 130)}</p>}
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
