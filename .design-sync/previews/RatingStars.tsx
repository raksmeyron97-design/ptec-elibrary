import { RatingStars } from 'ptec-e-library';

export function RatingStarsPreview() {
  return (
    <div style={{ padding: 24, background: 'var(--color-bg-canvas, #f8f9fa)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
        {[5.0, 4.5, 3.8, 2.5, 1.0, 0.0].map((rating) => (
          <div key={rating} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <RatingStars rating={rating} />
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)', width: 80 }}>
              {rating === 0 ? 'No reviews' : `${rating} / 5`}
            </span>
          </div>
        ))}
      </div>

      <div style={{ borderTop: '1px solid var(--color-divider, #e5e7eb)', paddingTop: 16 }}>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>Compact (book cards)</p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {[4.8, 4.2, 3.5].map((rating) => (
            <RatingStars key={rating} rating={rating} compact />
          ))}
        </div>
      </div>
    </div>
  );
}
