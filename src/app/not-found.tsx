export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontFamily: 'sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '48px', fontWeight: 800, color: 'var(--primary-dark)', marginBottom: '8px' }}>404</h1>
        <p style={{ fontSize: '16px' }}>Page not found</p>
        <a href="/dashboard" style={{ color: 'var(--accent-text)', fontSize: '14px', marginTop: '16px', display: 'block' }}>← Back to Dashboard</a>
      </div>
    </div>
  )
}
