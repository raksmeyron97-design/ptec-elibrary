import { Button } from 'ptec-e-library';

export function ButtonPreview() {
  return (
    <div style={{ padding: 24, background: 'var(--color-bg-canvas, #f8f9fa)', minHeight: 180 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <Button variant="primary">Download PDF</Button>
        <Button variant="secondary">Save Book</Button>
        <Button variant="ghost">View Details</Button>
        <Button variant="gold">Browse Library</Button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <Button variant="primary" size="sm">Small</Button>
        <Button variant="primary" size="md">Medium</Button>
        <Button variant="primary" size="lg">Large</Button>
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
        <Button variant="primary" disabled>Disabled</Button>
        <Button variant="secondary">ទាញយក PDF</Button>
      </div>
    </div>
  );
}
