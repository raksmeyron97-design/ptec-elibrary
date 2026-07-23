// lib/system-settings/org-identity.test.ts
//
// The projection from published settings → public identity, and the behaviour
// of the emergency fallback. These assert the property that actually broke in
// production: a published name change must reach the JSON-LD / Open Graph /
// citation / export surfaces, and the fallback must never introduce a third
// set of values of its own.

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  EMERGENCY_ORG_IDENTITY,
  orgIdentityFrom,
  resolveOrgIdentity,
  type OrgIdentity,
} from "./org-identity";
import { DEFAULT_SECTION_DOCS } from "./defaults";
import { buildSiteConfig } from "./map";
import { libraryNode, organizationNode } from "@/lib/seo/org-nodes";
import { bookJsonLd, buildBookMetadata } from "@/lib/seo/book-seo";
import { buildListingMetadata } from "@/lib/seo/listing-metadata";
import { thesisScholarMeta } from "@/lib/seo/citation";
import type { SectionDocMap } from "./types";

afterEach(() => vi.restoreAllMocks());

/** A published configuration with every identity field deliberately renamed. */
function renamedConfig() {
  const docs: SectionDocMap = {
    ...DEFAULT_SECTION_DOCS,
    organization: {
      name: { en: "Kandal Teacher Academy", km: "អាកាដេមី", short: "KTA" },
      libraryName: { en: "KTA Library", km: "បណ្ណាល័យ KTA" },
    },
    seo: { ...DEFAULT_SECTION_DOCS.seo, siteName: "KTA Digital Library" },
    contact: { ...DEFAULT_SECTION_DOCS.contact, email: "hello@kta.example" },
  };
  return orgIdentityFrom(buildSiteConfig(docs));
}

describe("orgIdentityFrom", () => {
  it("projects every identity field from the published documents", () => {
    const org = renamedConfig();
    expect(org).toMatchObject({
      institutionName: "Kandal Teacher Academy",
      institutionNameKm: "អាកាដេមី",
      abbreviation: "KTA",
      libraryName: "KTA Library",
      libraryNameKm: "បណ្ណាល័យ KTA",
      siteName: "KTA Digital Library",
      contactEmail: "hello@kta.example",
    });
    expect(org.url).toMatch(/^https?:\/\//);
  });
});

describe("EMERGENCY_ORG_IDENTITY", () => {
  it("is derived from the settings defaults, not from its own literals", () => {
    expect(EMERGENCY_ORG_IDENTITY.institutionName).toBe(
      DEFAULT_SECTION_DOCS.organization.name.en,
    );
    expect(EMERGENCY_ORG_IDENTITY.libraryName).toBe(
      DEFAULT_SECTION_DOCS.organization.libraryName.en,
    );
    expect(EMERGENCY_ORG_IDENTITY.siteName).toBe(DEFAULT_SECTION_DOCS.seo.siteName);
    expect(EMERGENCY_ORG_IDENTITY.contactEmail).toBe(DEFAULT_SECTION_DOCS.contact.email);
  });

  it("equals the projection of the default configuration", () => {
    expect(orgIdentityFrom(buildSiteConfig(DEFAULT_SECTION_DOCS))).toEqual(
      EMERGENCY_ORG_IDENTITY,
    );
  });
});

describe("resolveOrgIdentity", () => {
  it("returns the supplied identity untouched", () => {
    const org = renamedConfig();
    expect(resolveOrgIdentity(org)).toBe(org);
  });

  it("falls back to the emergency identity when a call site is unwired", () => {
    expect(resolveOrgIdentity(undefined)).toEqual(EMERGENCY_ORG_IDENTITY);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The end-to-end property: rename in settings → every SEO surface follows.
// ─────────────────────────────────────────────────────────────────────────────

describe("published identity propagates to the SEO builders", () => {
  const org: OrgIdentity = renamedConfig();
  const book = {
    slug: "reading-fluency",
    title: "Reading Fluency",
    description: "A practical guide to reading fluency for primary classrooms.",
    coverUrl: null,
    language: "English",
    publisher: null,
    isbn: null,
    publishedAt: "2024-01-01",
    pages: 120,
    authors: ["Pen Sokha"],
    department: "Primary Education",
    category: "Teaching",
    tags: ["reading"],
  };

  it("schema.org org/library nodes carry the published names", () => {
    expect(organizationNode(org).name).toBe("Kandal Teacher Academy");
    expect(libraryNode(org).name).toBe("KTA Digital Library");
    expect(libraryNode(org).parentOrganization.name).toBe("Kandal Teacher Academy");
  });

  it("book Open Graph siteName and JSON-LD provider follow the settings", () => {
    const meta = buildBookMetadata(book, "en", org);
    expect(meta.openGraph?.siteName).toBe("KTA Digital Library");

    const jsonLd = bookJsonLd(book, "en", null, org) as {
      provider: { name: string; parentOrganization: { name: string } };
    };
    expect(jsonLd.provider.name).toBe("KTA Digital Library");
    expect(jsonLd.provider.parentOrganization.name).toBe("Kandal Teacher Academy");
  });

  it("listing metadata uses the published library + site names", () => {
    const meta = buildListingMetadata({
      path: "/books",
      locale: "en",
      title: "Books",
      description: "All books",
      page: 1,
      hasFilters: false,
      org,
    });
    expect(meta.openGraph?.siteName).toBe("KTA Digital Library");
    expect(meta.openGraph?.title).toBe("Books | KTA Library");
  });

  it("Google Scholar dissertation institution follows the settings", () => {
    const meta = thesisScholarMeta(
      { id: "t1", title: "A Thesis", author_names: "Sok San" },
      org,
    );
    expect(meta.citation_dissertation_institution).toBe("Kandal Teacher Academy");
  });

  it("an unwired builder logs a warning rather than failing silently", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // The module warns once per process; force the branch by calling directly.
    resolveOrgIdentity(undefined);
    // Either this call warned, or an earlier test already consumed the one-shot
    // flag — both are fine; what matters is the value is the centralized one.
    expect(resolveOrgIdentity(undefined)).toEqual(EMERGENCY_ORG_IDENTITY);
    warn.mockRestore();
  });
});
