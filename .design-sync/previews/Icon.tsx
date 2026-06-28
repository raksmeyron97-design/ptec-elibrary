import { Icon } from 'ptec-e-library';

const ALL_ICONS = [
  'account', 'arrow-left', 'bookmark', 'bookmark-plus', 'calendar', 'chevron-right',
  'clock', 'devices', 'file-check', 'globe', 'library', 'mail', 'map-pin', 'pdf',
  'phone', 'school', 'search', 'search-off', 'send', 'star', 'bell', 'download',
  'external-link', 'x', 'share', 'plus-square', 'check', 'spinner', 'trash',
  'sun', 'moon', 'camera', 'alert-triangle', 'edit', 'eye', 'settings',
] as const;

export function IconPreview() {
  return (
    <div style={{ padding: 24, background: 'var(--color-bg-canvas, #f8f9fa)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8 }}>
        {ALL_ICONS.map((name) => (
          <div
            key={name}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              padding: 8, borderRadius: 6, background: 'white',
              border: '1px solid var(--color-divider, #e5e7eb)',
            }}
          >
            <Icon name={name} style={{ fontSize: 22, color: 'var(--color-brand, #1E3A8A)' }} />
            <span style={{ fontSize: 10, color: 'var(--color-text-muted)', textAlign: 'center', wordBreak: 'break-word' }}>
              {name}
            </span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 20, display: 'flex', gap: 16, alignItems: 'center' }}>
        <Icon name="star" style={{ fontSize: 14, color: '#f59e0b' }} />
        <Icon name="star" style={{ fontSize: 20, color: '#f59e0b' }} />
        <Icon name="star" style={{ fontSize: 28, color: '#f59e0b' }} />
        <Icon name="library" style={{ fontSize: 32, color: 'var(--color-brand, #1E3A8A)' }} />
        <Icon name="download" style={{ fontSize: 32, color: 'var(--color-brand, #1E3A8A)' }} />
      </div>
    </div>
  );
}
