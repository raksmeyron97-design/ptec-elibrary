// lib/seo/org-nodes.ts
//
// The two schema.org nodes that describe *us* — the institution and the
// library that provides the hosted items. Every JSON-LD builder (books,
// theses, publications, learning paths, posts) emits one or both, so they are
// built from a resolved OrgIdentity here instead of being re-declared as
// module constants in each file (which is how the publisher name in JSON-LD
// drifted away from the published settings in the first place).
//
// Roles, deliberately: PTEC is an `EducationalOrganization`; the library is a
// `Library` whose `parentOrganization` is that institution. For hosted books
// the library is the *provider*, never the publisher — see lib/seo/book-seo.ts.

import type { OrgIdentity } from "@/lib/system-settings/org-identity";

export function organizationNode(org: OrgIdentity) {
  return {
    "@type": "EducationalOrganization",
    name: org.institutionName,
    url: org.url,
  } as const;
}

export function libraryNode(org: OrgIdentity) {
  return {
    "@type": "Library",
    name: org.siteName,
    url: org.url,
    parentOrganization: organizationNode(org),
  } as const;
}
