import { Card, CardHeader, CardContent, Badge, Button } from 'ptec-e-library';

export function CardPreview() {
  return (
    <div style={{ padding: 24, background: 'var(--color-bg-canvas, #f8f9fa)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      <Card style={{ width: 280 }}>
        <CardHeader>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 15 }}>Introduction to Pedagogy</strong>
            <Badge variant="brand">PDF</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 12 }}>
            A foundational guide for teacher education students at PTEC.
          </p>
          <Button variant="primary" size="sm">Download</Button>
        </CardContent>
      </Card>

      <Card interactive style={{ width: 280 }}>
        <CardHeader>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 15 }}>វិចារណ​ករ​ន​ការ​សិក្សា</strong>
            <Badge variant="success">New</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 12 }}>
            ជំនាញ​ថ្មី​សម្រាប់​ការ​បង្រៀន​ក្នុង​សហគមន៍
          </p>
          <Button variant="secondary" size="sm">មើល​ព័ត៌មាន</Button>
        </CardContent>
      </Card>
    </div>
  );
}
