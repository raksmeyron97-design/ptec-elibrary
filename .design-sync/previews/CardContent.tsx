import { Card, CardContent, Button } from 'ptec-e-library';

export function CardContentPreview() {
  return (
    <div style={{ padding: 24, background: 'var(--color-bg-canvas, #f8f9fa)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card style={{ width: 320 }}>
        <CardContent>
          <p style={{ fontSize: 14, color: 'var(--color-text-body)', marginBottom: 12 }}>
            Explore our collection of over 2,000 books available for free download by PTEC students and faculty.
          </p>
          <Button variant="primary" size="sm">Browse Collection</Button>
        </CardContent>
      </Card>

      <Card style={{ width: 320 }}>
        <CardContent>
          <dl style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '6px 12px', fontSize: 13 }}>
            <dt style={{ color: 'var(--color-text-muted)' }}>Author</dt>
            <dd>Dr. Sophea Chan</dd>
            <dt style={{ color: 'var(--color-text-muted)' }}>Year</dt>
            <dd>2023</dd>
            <dt style={{ color: 'var(--color-text-muted)' }}>Language</dt>
            <dd>ខ្មែរ / English</dd>
            <dt style={{ color: 'var(--color-text-muted)' }}>Pages</dt>
            <dd>248</dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
