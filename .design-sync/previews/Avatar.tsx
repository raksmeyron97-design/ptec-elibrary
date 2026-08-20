import { Avatar } from 'ptec-e-library';

// Initials fallback is the common state (readers rarely upload a photo):
// brand-navy circle with up-to-two initials from name, or email prefix.
export function InitialsAndSizes() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: 24, background: 'var(--color-bg-canvas, #f8f9fa)' }}>
      <Avatar url={null} name="Sophea Chan" email="sophea.chan@ptec.edu.kh" size={64} />
      <Avatar url={null} name="Dara Kim" email="dara.kim@ptec.edu.kh" size={48} />
      <Avatar url={null} name="Visal Prum" email="visal.prum@ptec.edu.kh" size={32} />
      <Avatar url={null} name={null} email="reader42@gmail.com" size={32} />
      <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
        64 / 48 / 32 px — initials from name, else the email prefix
      </span>
    </div>
  );
}

export function InListContext() {
  return (
    <div style={{ padding: 24, background: 'var(--color-bg-canvas, #f8f9fa)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 340 }}>
        {[
          { name: 'Sokha Meas', email: 'sokha.meas@ptec.edu.kh', role: 'Librarian' },
          { name: 'Chanthy Ly', email: 'chanthy.ly@ptec.edu.kh', role: 'Staff' },
        ].map((u) => (
          <div key={u.email} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'white', border: '1px solid var(--color-divider, #e5e7eb)', borderRadius: 8, padding: '10px 14px' }}>
            <Avatar url={null} name={u.name} email={u.email} size={40} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-body, #1f2937)' }}>{u.name}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{u.role}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
