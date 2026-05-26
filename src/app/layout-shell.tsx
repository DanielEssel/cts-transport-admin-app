'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Sidebar } from '@/components/layout/Sidebar'
import { Menu, Bell, Search } from 'lucide-react'
import { ThemeToggle } from '@/components/layout/ThemeToggle'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, admin, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (!loading && (!user || !admin)) router.push('/login')
  }, [user, admin, loading, router])

  const segments = pathname.split('/').filter(Boolean)
  const pageTitle = segments[segments.length - 1]?.replace(/-/g, ' ') || 'Dashboard'

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '50%',
          border: '3px solid #16a34a', borderTopColor: 'transparent',
          animation: 'spin 0.8s linear infinite', margin: '0 auto 16px'
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>Loading...</p>
      </div>
    </div>
  )

  if (!user || !admin) return null

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Desktop Sidebar */}
      <div style={{ width: '240px', flexShrink: 0, display: 'flex', position: 'sticky', top: 0, height: '100vh' }}>
        <Sidebar />
      </div>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} onClick={() => setSidebarOpen(false)} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Topbar */}
        <header style={{
          height: '60px', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', padding: '0 20px', gap: '14px',
          position: 'sticky', top: 0, zIndex: 10, flexShrink: 0
        }}>
          <button onClick={() => setSidebarOpen(true)} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px',
            display: 'flex', alignItems: 'center'
          }}>
            <Menu size={18} />
          </button>

          <div style={{ flex: 1 }}>
            <h1 style={{
              fontFamily: "'Syne', sans-serif", fontSize: '15px', fontWeight: 700,
              color: 'var(--text-primary)', textTransform: 'capitalize'
            }}>
              {pageTitle}
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px' }}>
            <Search size={12} style={{ color: 'var(--text-tertiary)' }} />
            <input placeholder="Search..." style={{
              background: 'none', border: 'none', outline: 'none',
              color: 'var(--text-secondary)', fontSize: '12px', width: '140px'
            }} />
          </div>

          <ThemeToggle />

          <button style={{
            position: 'relative', background: 'var(--surface-alt)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '7px', cursor: 'pointer', color: 'var(--text-secondary)',
            display: 'flex', alignItems: 'center'
          }}>
            <Bell size={15} />
            <span style={{
              position: 'absolute', top: '5px', right: '5px',
              width: '6px', height: '6px', borderRadius: '50%',
              background: '#ef4444', border: '1px solid #0f1923'
            }} />
          </button>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
