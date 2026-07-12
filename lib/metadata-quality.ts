// Metadata-quality checklist (verification workflow, roadmap Task 1).
// Pure module: given a raw content row, evaluates the editorial checklist
// and produces a weighted score + the list of missing/weak fields shown in
// the review queue. Deliberately lenient about *historical* resources —
// only fields a reviewer can realistically supply are `required`; the rest
// are `recommended` and cost score without blocking publication.

export type QualityResourceType = "book" | "thesis" | "publication";

export type ChecklistStatus = "ok" | "missing" | "weak";

export interface ChecklistItem {
  key: string;
  label: string;
  status: ChecklistStatus;
  required: boolean;
  hint?: string;
}

export interface QualityReport {
  score: number; // 0–100
  grade: "A" | "B" | "C" | "D";
  items: ChecklistItem[];
  missingRequired: string[];
}

type Row = Record<string, unknown>;

function str(row: Row, key: string): string {
  const v = row[key];
  return typeof v === "string" ? v.trim() : "";
}

function num(row: Row, key: string): number | null {
  const v = row[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function arr(row: Row, key: string): string[] {
  const v = row[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
}

function present(value: string): ChecklistStatus {
  return value ? "ok" : "missing";
}

interface ItemSpec {
  key: string;
  label: string;
  required: boolean;
  weight: number;
  evaluate: (row: Row) => { status: ChecklistStatus; hint?: string };
}

const YEAR_RE = /\b(1[89]|20)\d{2}\b/;

function yearStatus(value: string | null): { status: ChecklistStatus; hint?: string } {
  if (!value) return { status: "missing" };
  // year=0 sentinel (unknown year) and clearly invalid values count as weak,
  // not ok — reviewers should confirm rather than trust them.
  if (!YEAR_RE.test(value)) return { status: "weak", hint: "Year looks invalid — confirm against the source" };
  return { status: "ok" };
}

function authorField(type: QualityResourceType): ItemSpec["evaluate"] {
  return (row) => {
    if (type === "book") {
      const joined = row.authors as { name?: string } | { name?: string }[] | null | undefined;
      const name = Array.isArray(joined) ? joined[0]?.name : joined?.name;
      return { status: present((name ?? str(row, "author_name") ?? "").trim()) };
    }
    if (type === "thesis") return { status: present(str(row, "author_names")) };
    return { status: present(str(row, "author_names")) }; // publications: pre-joined display string
  };
}

function specsFor(type: QualityResourceType): ItemSpec[] {
  const common: ItemSpec[] = [
    { key: "title", label: "Title", required: true, weight: 3, evaluate: (r) => ({ status: present(str(r, "title")) }) },
    { key: "author", label: "Author / contributor", required: true, weight: 3, evaluate: authorField(type) },
    { key: "language", label: "Language", required: true, weight: 2, evaluate: (r) => ({ status: present(str(r, "language")) }) },
    {
      key: "year", label: "Publication year", required: false, weight: 2,
      evaluate: (r) => yearStatus(str(r, "published_at") || str(r, "publication_date") || str(r, "academic_year") || null),
    },
    {
      key: "description", label: "Description / abstract", required: false, weight: 2,
      evaluate: (r) => {
        const text = str(r, "description") || str(r, "abstract");
        if (!text) return { status: "missing" };
        if (text.length < 40) return { status: "weak", hint: "Very short — expand for search and citations" };
        return { status: "ok" };
      },
    },
    {
      key: "license", label: "Rights / license", required: false, weight: 2,
      evaluate: (r) => {
        const lic = str(r, "license");
        if (!lic || lic === "unknown") return { status: "weak", hint: "License 'unknown' keeps this out of external repository feeds" };
        return { status: "ok" };
      },
    },
    { key: "cover", label: "Cover / preview image", required: false, weight: 1, evaluate: (r) => ({ status: present(str(r, "cover_url")) }) },
    { key: "source", label: "Source / attribution", required: false, weight: 1, evaluate: (r) => ({ status: present(str(r, "source_attribution") || str(r, "source")) }) },
  ];

  if (type === "book") {
    return [
      ...common,
      { key: "category", label: "Category", required: false, weight: 2, evaluate: (r) => ({ status: r.category_id ? "ok" : "missing" }) },
      { key: "isbn", label: "ISBN", required: false, weight: 1, evaluate: (r) => ({ status: present(str(r, "isbn")) }) },
      {
        key: "pages", label: "Page count", required: false, weight: 1,
        evaluate: (r) => {
          const p = num(r, "pages");
          if (!p || p <= 1) return { status: "weak", hint: "Page count missing or placeholder (1)" };
          return { status: "ok" };
        },
      },
      { key: "keywords", label: "Keywords / tags", required: false, weight: 1, evaluate: (r) => ({ status: arr(r, "tags").length ? "ok" : "missing" }) },
    ];
  }

  if (type === "thesis") {
    return [
      ...common,
      { key: "institution", label: "Department / institution", required: false, weight: 2, evaluate: (r) => ({ status: r.department_id ? "ok" : "missing" }) },
      { key: "advisor", label: "Advisor", required: false, weight: 1, evaluate: (r) => ({ status: present(str(r, "advisor_name")) }) },
      { key: "file", label: "File (PDF)", required: true, weight: 3, evaluate: (r) => ({ status: present(str(r, "file_url")) }) },
      {
        key: "file_size", label: "File size", required: false, weight: 1,
        evaluate: (r) => ({ status: num(r, "file_size_kb") ? "ok" : "missing" }),
      },
      { key: "keywords", label: "Keywords", required: false, weight: 1, evaluate: (r) => ({ status: arr(r, "keywords").length ? "ok" : "missing" }) },
      { key: "doi", label: "DOI / identifier", required: false, weight: 1, evaluate: (r) => ({ status: present(str(r, "doi")) }) },
    ];
  }

  // publication
  return [
    ...common,
    { key: "journal", label: "Journal / publisher", required: false, weight: 2, evaluate: (r) => ({ status: present(str(r, "journal_name")) }) },
    { key: "doi", label: "DOI", required: false, weight: 2, evaluate: (r) => ({ status: present(str(r, "doi")) }) },
    { key: "keywords", label: "Keywords", required: false, weight: 1, evaluate: (r) => ({ status: arr(r, "keywords").length ? "ok" : "missing" }) },
    { key: "file", label: "File (PDF)", required: false, weight: 1, evaluate: (r) => ({ status: present(str(r, "pdf_url")) }) },
  ];
}

/**
 * Citation-readiness: the minimum set needed to render a non-fabricated
 * citation (title + author + year). Shown as its own checklist line because
 * "can we cite this without inventing data?" is the reviewer's core question.
 */
function citationReadiness(items: ChecklistItem[]): ChecklistItem {
  const need = ["title", "author", "year"];
  const bad = items.filter((i) => need.includes(i.key) && i.status !== "ok");
  return {
    key: "citation",
    label: "Citation preview complete",
    required: false,
    status: bad.length === 0 ? "ok" : "weak",
    hint: bad.length ? `Citation will omit: ${bad.map((b) => b.label.toLowerCase()).join(", ")}` : undefined,
  };
}

export function evaluateQuality(type: QualityResourceType, row: Row): QualityReport {
  const specs = specsFor(type);
  let earned = 0;
  let total = 0;

  const items: ChecklistItem[] = specs.map((spec) => {
    const { status, hint } = spec.evaluate(row);
    total += spec.weight;
    if (status === "ok") earned += spec.weight;
    else if (status === "weak") earned += spec.weight / 2;
    return { key: spec.key, label: spec.label, status, required: spec.required, hint };
  });

  items.push(citationReadiness(items));

  const score = total > 0 ? Math.round((earned / total) * 100) : 0;
  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 55 ? "C" : "D";
  const missingRequired = items.filter((i) => i.required && i.status === "missing").map((i) => i.label);

  return { score, grade, items, missingRequired };
}
