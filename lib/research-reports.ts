export interface ResearchReport {
  id: string;
  title: string;
  abstract: string;
  department_id: string;
  department_name?: string; // Fetched from joined table
  program: string | null;
  faculty: string | null;
  subject: string | null;
  cohort: string | null;
  academic_year: string | null;
  author_names: string | null;
  advisor_name: string | null;
  cover_url: string | null;
  file_url: string | null;
  file_size_kb: number | null;
  is_published: boolean;
  view_count: number;
  download_count: number;
  keywords: string[];
  created_at: string;
}

export function mapRowToResearchReport(row: any): ResearchReport {
  return {
    id: row.id,
    title: row.title,
    abstract: row.abstract,
    department_id: row.department_id,
    department_name: row.departments?.name ?? null,
    program: row.program ?? null,
    faculty: row.faculty ?? null,
    subject: row.subject ?? null,
    cohort: row.cohort,
    academic_year: row.academic_year,
    author_names: row.author_names,
    advisor_name: row.advisor_name,
    cover_url: row.cover_url,
    file_url: row.file_url,
    file_size_kb: row.file_size_kb,
    is_published: row.is_published,
    view_count: row.view_count ?? 0,
    download_count: row.download_count ?? 0,
    keywords: row.keywords ?? [],
    created_at: row.created_at,
  };
}
