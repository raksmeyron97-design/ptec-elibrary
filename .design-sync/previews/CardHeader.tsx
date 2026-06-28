import { Card, CardHeader, Badge } from 'ptec-e-library';

export function CardHeaderPreview() {
  return (
    <div style={{ padding: 24, background: 'var(--color-bg-canvas, #f8f9fa)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card style={{ width: 320 }}>
        <CardHeader>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Book Details</span>
        </CardHeader>
      </Card>

      <Card style={{ width: 320 }}>
        <CardHeader>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Recent Uploads</span>
            <Badge variant="brand">12 new</Badge>
          </div>
        </CardHeader>
      </Card>

      <Card style={{ width: 320 }}>
        <CardHeader>
          <span style={{ fontSize: 15, fontWeight: 600 }}>ព​ត៌​មាន​សៀ​វ​ភៅ</span>
        </CardHeader>
      </Card>
    </div>
  );
}
