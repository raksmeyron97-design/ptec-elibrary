import JsonLd from "@/components/seo/JsonLd";
import { PTEC_LIBRARY_NAME, PTEC_NAME, SITE_URL } from "@/lib/seo/site";

type NameInput = string | string[] | null | undefined;

type BookJsonLdProps = {
  title: string;
  url: string;
  author?: NameInput;
  description?: string | null;
  image?: string | null;
  language?: string | null;
  isbn?: string | null;
  datePublished?: string | null;
  keywords?: string[] | null;
  pages?: number | null;
  aggregateRating?: {
    ratingValue: number | string;
    reviewCount: number;
  } | null;
};

type ScholarlyArticleJsonLdProps = {
  title: string;
  url: string;
  authors?: NameInput;
  abstract?: string | null;
  image?: string | null;
  datePublished?: string | null;
  dateCreated?: string | null;
  keywords?: string[] | null;
  doi?: string | null;
  department?: string | null;
  references?: string[] | null;
  language?: string | null;
};

function cleanText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || undefined;
}

function namesFromInput(value: NameInput): string[] {
  if (!value) return [];
  const values = Array.isArray(value) ? value : value.split(/[,;|]/);
  return values.map((name) => cleanText(name)).filter(Boolean) as string[];
}

function personList(value: NameInput) {
  const names = namesFromInput(value);
  if (names.length === 0) {
    return {
      "@type": "Organization",
      name: "Unknown Author",
    };
  }

  return names.map((name) => ({
    "@type": "Person",
    name,
  }));
}

function compactSchema(schema: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(schema).filter(([, value]) => {
      if (value === undefined || value === null || value === "") return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    }),
  );
}

const ptecPublisher = {
  "@type": "EducationalOrganization",
  name: PTEC_NAME,
  url: SITE_URL,
};

const libraryProvider = {
  "@type": "Library",
  name: PTEC_LIBRARY_NAME,
  url: SITE_URL,
  parentOrganization: ptecPublisher,
};

export function BookJsonLd({
  title,
  url,
  author,
  description,
  image,
  language,
  isbn,
  datePublished,
  keywords,
  pages,
  aggregateRating,
}: BookJsonLdProps) {
  const keywordList = keywords?.filter(Boolean) ?? [];
  const cleanIsbn = isbn && isbn !== "N/A" ? isbn : undefined;
  const schema = compactSchema({
    "@context": "https://schema.org",
    "@type": "Book",
    name: title,
    headline: title,
    author: personList(author),
    publisher: ptecPublisher,
    provider: libraryProvider,
    inLanguage: language || "en",
    description: cleanText(description) || title,
    image: image || `${SITE_URL}/og-default.png`,
    url,
    mainEntityOfPage: url,
    isbn: cleanIsbn,
    numberOfPages: pages && pages > 0 ? pages : undefined,
    bookFormat: "https://schema.org/EBook",
    isAccessibleForFree: true,
    keywords: keywordList.length > 0 ? keywordList.join(", ") : undefined,
    datePublished: datePublished || undefined,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/OnlineOnly",
      url,
    },
    readAction: {
      "@type": "ReadAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: url,
      },
    },
    aggregateRating: aggregateRating
      ? {
          "@type": "AggregateRating",
          ratingValue: String(aggregateRating.ratingValue),
          reviewCount: aggregateRating.reviewCount,
        }
      : undefined,
  });

  return <JsonLd data={schema} />;
}

export function ScholarlyArticleJsonLd({
  title,
  url,
  authors,
  abstract,
  image,
  datePublished,
  dateCreated,
  keywords,
  doi,
  department,
  references,
  language,
}: ScholarlyArticleJsonLdProps) {
  const keywordList = keywords?.filter(Boolean) ?? [];
  const schema = compactSchema({
    "@context": "https://schema.org",
    "@type": "ScholarlyArticle",
    headline: title,
    name: title,
    author: personList(authors),
    publisher: ptecPublisher,
    provider: libraryProvider,
    isPartOf: {
      "@type": "CreativeWorkSeries",
      name: "PTEC Student Theses",
      publisher: ptecPublisher,
    },
    about: department
      ? {
          "@type": "Thing",
          name: department,
        }
      : undefined,
    abstract: cleanText(abstract),
    description: cleanText(abstract) || title,
    image: image || `${SITE_URL}/og-default.png`,
    url,
    mainEntityOfPage: url,
    datePublished: datePublished || dateCreated || undefined,
    dateCreated: dateCreated || undefined,
    inLanguage: language || "en",
    isAccessibleForFree: true,
    keywords: keywordList.length > 0 ? keywordList.join(", ") : undefined,
    citation: references && references.length > 0 ? references : undefined,
    identifier: doi
      ? {
          "@type": "PropertyValue",
          propertyID: "DOI",
          value: doi,
        }
      : undefined,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/OnlineOnly",
      url,
    },
  });

  return <JsonLd data={schema} />;
}
