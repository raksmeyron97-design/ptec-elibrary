import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { PTEC_LIBRARY_NAME, SITE_URL } from "@/lib/seo/site";
import { localeAlternates } from "@/lib/seo/alternates";
import { createServiceClient } from "@/lib/supabase/server";

export const revalidate = 3600;

type PageProps = { params: Promise<{ slug: string; locale: string }> };

function truncate(text: string, max = 155) {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

async function getSubjectBundle(slug: string) {
  const supabase = createServiceClient();
  const { data: category } = await supabase
    .from("categories")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (!category) return null;

  const [{ data: books }, { data: theses }, { data: publications }, { data: catalog }] = await Promise.all([
    supabase
      .from("books")
      .select("id, slug, title, description, authors(name)")
      .eq("is_published", true)
      .eq("category_id", category.id)
      .order("download_count", { ascending: false })
      .limit(12),
    supabase
      .from("research_reports")
      .select("id, slug, title, abstract, author_names")
      .eq("is_published", true)
      .or(`subject.ilike.%${category.name}%,program.ilike.%${category.name}%,faculty.ilike.%${category.name}%`)
      .order("view_count", { ascending: false })
      .limit(8),
    supabase
      .from("publications_with_stats")
      .select("id, slug, title, abstract, author_names")
      .eq("is_published", true)
      .contains("subjects", [category.name])
      .order("view_count", { ascending: false })
      .limit(8),
    supabase
      .from("catalog_books")
      .select("id, slug, title, description, author")
      .eq("is_active", true)
      .ilike("category", `%${category.name}%`)
      .order("title", { ascending: true })
      .limit(8),
  ]);

  return {
    category,
    items: [
      ...(books ?? []).map((item: any) => ({
        type: "E-book",
        title: item.title,
        href: `/books/${item.slug}`,
        author: item.authors?.name,
        excerpt: item.description,
      })),
      ...(theses ?? []).map((item: any) => ({
        type: "Thesis",
        title: item.title,
        href: `/theses/${item.slug ?? item.id}`,
        author: item.author_names,
        excerpt: item.abstract,
      })),
      ...(publications ?? []).map((item: any) => ({
        type: "Publication",
        title: item.title,
        href: `/publications/${item.slug}`,
        author: item.author_names,
        excerpt: item.abstract,
      })),
      ...(catalog ?? []).map((item: any) => ({
        type: "Physical book",
        title: item.title,
        href: `/catalogs/${item.slug ?? item.id}`,
        author: item.author,
        excerpt: item.description,
      })),
    ],
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const bundle = await getSubjectBundle(slug);
  if (!bundle) return { title: "Subject not found" };

  const title = `${bundle.category.name} Resources`;
  const description = `Browse PTEC Digital Library books, theses, publications, and catalog records about ${bundle.category.name}.`;
  const alternates = localeAlternates(`/subjects/${bundle.category.slug}`, locale);
  const canonical = alternates.canonical;

  return {
    title,
    description,
    alternates,
    openGraph: {
      title,
      description,
      type: "website",
      url: canonical,
      siteName: PTEC_LIBRARY_NAME,
    },
    twitter: { card: "summary", title, description },
  };
}

export default async function SubjectPage({ params }: PageProps) {
  const { slug } = await params;
  const bundle = await getSubjectBundle(slug);
  if (!bundle) notFound();

  const subjectUrl = `${SITE_URL}/subjects/${bundle.category.slug}`;
  const breadcrumbs = breadcrumbSchema([
    { name: "Home", path: "/home" },
    { name: "Subjects", path: "/books" },
    { name: bundle.category.name },
  ]);

  return (
    <main className="min-h-screen bg-bg-body px-4 py-10 sm:px-6 md:px-12">
      <JsonLd data={breadcrumbs} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: `${bundle.category.name} Resources`,
          url: subjectUrl,
          about: { "@type": "Thing", name: bundle.category.name },
          isPartOf: { "@type": "WebSite", name: PTEC_LIBRARY_NAME, url: SITE_URL },
        }}
      />
      <div className="mx-auto max-w-5xl">
        <nav className="mb-5 text-[13px] font-medium text-text-muted">
          <Link href="/home" className="hover:text-brand">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/books" className="hover:text-brand">Subjects</Link>
        </nav>
        <header className="mb-8">
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-brand">Subject</p>
          <h1 className="mt-2 text-3xl font-bold text-text-heading sm:text-4xl">{bundle.category.name}</h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-7 text-text-muted">
            Public resources in the PTEC Digital Library connected to this subject.
          </p>
        </header>

        {bundle.items.length === 0 ? (
          <div className="rounded-2xl border border-divider bg-bg-surface p-8 text-center text-text-muted">
            No public resources are attached to this subject yet.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {bundle.items.map((item) => (
              <Link
                key={`${item.type}-${item.href}`}
                href={item.href}
                className="rounded-xl border border-divider bg-bg-surface p-4 transition-colors hover:border-brand/40"
              >
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand">
                  {item.type}
                </span>
                <h2 className="mt-2 line-clamp-2 text-[15px] font-bold text-text-heading">{item.title}</h2>
                {item.author && <p className="mt-1 line-clamp-1 text-[12.5px] text-text-muted">{item.author}</p>}
                {item.excerpt && <p className="mt-2 line-clamp-2 text-[12.5px] leading-5 text-text-body">{truncate(item.excerpt, 130)}</p>}
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
