import { ThemeToggle } from 'ptec-e-library';

export function ThemeTogglePreview() {
  return (
    <div style={{ padding: 24, background: 'var(--color-bg-canvas, #f8f9fa)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 44, height: 44, borderRadius: 8,
            background: 'white', border: '1px solid var(--color-divider, #e5e7eb)',
          }}
        >
          <ThemeToggle />
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          Toggles between light and dark theme.<br />
          Icon shown depends on current system preference.
        </div>
      </div>

      <div
        style={{
          marginTop: 20, padding: '12px 16px', borderRadius: 8,
          background: '#172554', display: 'flex', alignItems: 'center', gap: 16,
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 44, height: 44, borderRadius: 8,
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
          }}
        >
          <ThemeToggle />
        </div>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>In the PTEC dark navbar</span>
      </div>
    </div>
  );
}
