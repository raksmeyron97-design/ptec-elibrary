import { Badge } from 'ptec-e-library';

export function BadgePreview() {
  return (
    <div style={{ padding: 24, background: 'var(--color-bg-canvas, #f8f9fa)', minHeight: 120 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <Badge variant="neutral">Neutral</Badge>
        <Badge variant="brand">Brand</Badge>
        <Badge variant="success">Available</Badge>
        <Badge variant="warning">Limited</Badge>
        <Badge variant="danger">Out of Print</Badge>
        <Badge variant="info">New Arrival</Badge>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <Badge variant="brand">ភាសាខ្មែរ</Badge>
        <Badge variant="success">English</Badge>
        <Badge variant="neutral">PDF</Badge>
        <Badge variant="neutral">ឯកសារ</Badge>
      </div>
    </div>
  );
}
