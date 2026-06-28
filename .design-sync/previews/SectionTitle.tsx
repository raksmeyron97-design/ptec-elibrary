import { SectionTitle } from 'ptec-e-library';

export function SectionTitlePreview() {
  return (
    <div style={{ padding: 24, background: 'var(--color-bg-canvas, #f8f9fa)', maxWidth: 480 }}>
      <SectionTitle as="h1">Welcome to PTEC e-Library</SectionTitle>
      <SectionTitle as="h2">Featured Books</SectionTitle>
      <SectionTitle as="h3">Research Reports</SectionTitle>
      <SectionTitle as="h4">Recent Uploads</SectionTitle>
      <div style={{ marginTop: 8, borderTop: '1px solid var(--color-divider, #e5e7eb)', paddingTop: 16 }}>
        <SectionTitle as="h2">ក្រប​ព្រះ​ករុ​ណា​នៃ​ការ​អប់​រំ</SectionTitle>
        <SectionTitle as="h3">សសរ​ស្ដម្ភ​ក្នុង​ការ​ថែ​រក្សា​ការ​ស​ប​ក្ស​ភ័ណ្ឌ</SectionTitle>
      </div>
    </div>
  );
}
