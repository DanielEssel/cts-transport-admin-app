'use client'
// The admin shell for every section: active-admin gate, grouped sidebar,
// top bar with title and breadcrumb, alerts and theme. Access is unchanged:
// a signed-out user or one without an active admins record goes to /login.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Sidebar } from '@/components/layout/Sidebar'
import { AdminAlertsBell } from '@/components/layout/AdminAlertsBell'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { navContext } from '@/components/layout/nav'
import { ChevronRight, Menu } from 'lucide-react'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, admin, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (!loading && (!user || !admin)) router.push('/login')
  }, [user, admin, loading, router])

  // Close the mobile menu on navigation.
  useEffect(() => { setSidebarOpen(false) }, [pathname])

  const { group, link, detail } = navContext(pathname)
  const pageTitle = link?.label ?? (pathname.split('/').filter(Boolean)[0]?.replace(/-/g, ' ') || 'Dashboard')

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div role="status" style={{ textAlign: 'center' }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%',
          border: '3px solid var(--primary)', borderTopColor: 'transparent',
          animation: 'spin 0.8s linear infinite', margin: '0 auto 14px'
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>Loading CTSGo Admin…</p>
      </div>
    </div>
  )

  if (!user || !admin) return null

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>
      <div className="shell-sidebar" style={{ width: '248px', flexShrink: 0, height: '100vh' }}>
        <Sidebar />
      </div>

      {sidebarOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }} role="dialog" aria-modal="true" aria-label="Navigation">
          <div style={{ position: 'absolute', inset: 0, background: 'var(--overlay)' }} onClick={() => setSidebarOpen(false)} />
          <div style={{ position: 'relative', zIndex: 1, boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}>
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100vh', overflow: 'hidden' }}>
        <header style={{
          minHeight: '64px', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', padding: '0 20px', gap: '12px', flexShrink: 0,
        }}>
          <button className="shell-menu-button btn btn-secondary" onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation" style={{ padding: '0 9px' }}>
            <Menu size={18} />
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            {group && (
              <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                <span>{group}</span>
                {detail && link && (<>
                  <ChevronRight size={12} aria-hidden />
                  <Link href={link.href} style={{ color: 'var(--accent-text)', textDecoration: 'none', fontWeight: 600 }}>{link.label}</Link>
                </>)}
              </nav>
            )}
            <h1 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {detail ? `${link?.label ?? pageTitle} details` : pageTitle}
            </h1>
          </div>

          <AdminAlertsBell />
          <ThemeToggle />
          <div aria-label="Signed in as" style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingLeft: '8px', borderLeft: '1px solid var(--border)' }}>
            <div aria-hidden style={{
              width: '34px', height: '34px', borderRadius: '50%', background: 'var(--primary-dim)', color: 'var(--accent-text)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px',
            }}>
              {(admin.fullName || admin.email || 'A').trim().charAt(0).toUpperCase()}
            </div>
            <div className="shell-user-text" style={{ lineHeight: 1.25 }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{admin.fullName || 'Admin'}</div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>{admin.role === 'super_admin' ? 'Super admin' : 'Admin'}</div>
            </div>
          </div>
        </header>

        <main className="shell-main" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '24px' }}>
          <div style={{ maxWidth: '1440px', margin: '0 auto' }}>{children}</div>
        </main>
      </div>
    </div>
  )
}
