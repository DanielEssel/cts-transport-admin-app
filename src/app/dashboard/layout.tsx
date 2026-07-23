'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Sidebar } from '@/components/layout/Sidebar'
import { Menu, Bell, Search } from 'lucide-react'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, admin, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (!loading && (!user || !admin)) {
      router.push('/login')
    }
  }, [user, admin, loading, router])

  // Page title from pathname
  const pageTitle = pathname.split('/').filter(Boolean).pop()?.replace(/-/g, ' ') || 'Dashboard'

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '50%',
          border: '3px solid #16a34a', borderTopColor: 'transparent',
          animation: 'spin 0.8s linear infinite', margin: '0 auto 16px'
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>Loading CTS Admin...</p>
      </div>
    </div>
  )

  if (!user || !admin) return null

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Desktop sidebar */}
      <div style={{ display: 'none' }} className="lg-sidebar">
        <Sidebar />
      </div>

      {/* Always visible sidebar on large screens */}
      <div style={{ flexShrink: 0 }} className="hidden lg:flex">
  <div style={{ width: '240px', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}>
    <Sidebar />
  </div>
</div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}
          onClick={() => setSidebarOpen(false)}
        >
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'relative', zIndex: 1 }} onClick={e => e.stopPropagation()}>
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', overflow: 'hidden' }}>
        {/* Top bar */}
        <header style={{
          height: '64px', background: 'var(--surface)',
          borderBottom: '1px solid #1e293b',
          display: 'flex', alignItems: 'center',
          padding: '0 24px', gap: '16px', flexShrink: 0
        }}>
          <button
            onClick={() => setSidebarOpen(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}
          >
            <Menu size={20} />
          </button>

          <div style={{ flex: 1 }}>
            <h1 style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: '16px', fontWeight: 700,
              color: 'var(--text-primary)', textTransform: 'capitalize'
            }}>
              {pageTitle}
            </h1>
          </div>

          {/* Search */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'var(--surface-alt)', border: '1px solid #1e293b',
            borderRadius: '8px', padding: '6px 12px'
          }}>
            <Search size={14} style={{ color: 'var(--text-tertiary)' }} />
            <input
              placeholder="Search..."
              style={{
                background: 'none', border: 'none', outline: 'none',
                color: 'var(--text-secondary)', fontSize: '13px', width: '160px'
              }}
            />
          </div>

          {/* Notification bell */}
          <button style={{
            position: 'relative', background: 'var(--surface-alt)',
            border: '1px solid #1e293b', borderRadius: '8px',
            padding: '8px', cursor: 'pointer', color: 'var(--text-secondary)'
          }}>
            <Bell size={16} />
            <span style={{
              position: 'absolute', top: '6px', right: '6px',
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
