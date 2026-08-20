import { SkeletonBlock } from 'ptec-e-library';

// The primitive every composed skeleton is built from — a shimmering block
// sized by className/style. Shown here composing a book-card placeholder.
export function BuildingBlocks() {
  return (
    <div style={{ display: 'flex', gap: 24, padding: 24, background: 'var(--color-bg-canvas, #f8f9fa)' }}>
      <SkeletonBlock style={{ width: 120, height: 160 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, maxWidth: 260 }}>
        <SkeletonBlock style={{ width: '80%', height: 20 }} />
        <SkeletonBlock style={{ width: '55%', height: 14 }} />
        <SkeletonBlock style={{ width: '100%', height: 12 }} />
        <SkeletonBlock style={{ width: '90%', height: 12 }} />
        <SkeletonBlock style={{ width: 110, height: 36, marginTop: 8 }} />
      </div>
    </div>
  );
}
