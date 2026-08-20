import { BookCover } from 'ptec-e-library';

// The generated fallback cover — deterministic per title (category theme +
// seed-based motif). Shown wherever a book has no uploaded cover image.
export function CardCovers() {
  return (
    <div style={{ display: 'flex', gap: 16, padding: 24, background: 'var(--color-bg-canvas, #f8f9fa)' }}>
      <div style={{ width: 150 }}>
        <BookCover title="Introduction to Pedagogy" author="Dr. Sophea Chan" label="Education" />
      </div>
      <div style={{ width: 150 }}>
        <BookCover title="វិធីសាស្ត្របង្រៀនគណិតវិទ្យា" author="លោកគ្រូ វិសាល" label="Mathematics" />
      </div>
      <div style={{ width: 150 }}>
        <BookCover title="Khmer Literature Through the Ages" author="Prof. Dara Kim" label="Literature" />
      </div>
    </div>
  );
}

export function DetailVariant() {
  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', padding: 24, background: 'var(--color-bg-canvas, #f8f9fa)' }}>
      <div style={{ width: 220 }}>
        <BookCover
          title="ប្រវត្តិសាស្ត្រកម្ពុជា"
          author="វិទ្យាស្ថានគរុកោសល្យ"
          label="History"
          variant="detail"
        />
      </div>
      <div style={{ fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 220 }}>
        Detail variant — used on the book detail page. Same book always renders
        the same theme and motif placement.
      </div>
    </div>
  );
}

export function ThumbRow() {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 24, background: 'var(--color-bg-canvas, #f8f9fa)' }}>
      <div style={{ width: 56 }}>
        <BookCover title="Teaching Science in Primary School" label="Science" variant="thumb" />
      </div>
      <div style={{ width: 56 }}>
        <BookCover title="ភាសាខ្មែរថ្នាក់ទី១" label="Language" variant="thumb" />
      </div>
      <div style={{ width: 56 }}>
        <BookCover title="Classroom Management Basics" label="Education" variant="thumb" />
      </div>
      <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Thumb variant — lists and search results</span>
    </div>
  );
}
