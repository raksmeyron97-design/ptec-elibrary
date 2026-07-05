// lib/home-partners.ts
// Partner organizations shown on the homepage. INTENTIONALLY EMPTY at launch:
// the strip renders nothing until the real partner list is confirmed with
// PTEC administration (MoEYS, partner TECs, development partners, …).
//
// Logo files go in /public/partners/ (SVG preferred, or PNG ≥160px tall on
// transparent background). If fewer than 4 partners are confirmed, consider
// keeping this list empty and naming them in the footer instead — a sparse
// logo strip reads worse than none.

export type Partner = {
  /** Organization name — used as the image alt text. */
  name: string;
  /** Path under /public, e.g. "/partners/moeys.svg". */
  logo: string;
  /** Optional external site. */
  url?: string;
};

export const HOME_PARTNERS: Partner[] = [
  // { name: "Ministry of Education, Youth and Sport", logo: "/partners/moeys.svg", url: "https://moeys.gov.kh" },
];
