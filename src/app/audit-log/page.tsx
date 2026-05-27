'use client'
import { useEffect, useState, useCallback } from 'react'
import { collection, getDocs, addDoc, query, orderBy, limit, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import { EmptyState, TableSkeleton } from '@/components/shared'
import { formatDate } from '@/lib/utils'
import { ClipboardList, Search, RefreshCw } from 'lucide-react'

interface AuditEntry {
  id: string
  adminUid: string
  adminEmail: string
  action: string
  targetType: string
  targetId: string
  details: string
  createdAt: any
}

const ACTION_COLORS: Record<string, string> = {
  approve_driver:   '#4ade80',
  reject_driver:    '#f87171',
  suspend_driver:   '#fbbf24',
  unsuspend_driver: '#60a5fa',
  approve_withdrawal: '#4ade80',
  reject_withdrawal:  '#f87171',
  mark_paid:          '#a78bfa',
  wallet_topup:       '#4ade80',
  wallet_deduct:      '#f87171',
  send_notification:  '#60a5fa',
  create_promotion:   '#fb923c',
  delete_promotion:   '#f87171',
  update_settings:    '#94a3b8',
  resolve_ticket:     '#4ade80',
}

// Helper to log audit entries - export this and use in other pages
export async function logAudit(adminUid: string, adminEmail: string, action: string, targetType: string, targetId: string, details: string) {
  try {
    await addDoc(collection(db, 'audit_log'), {
      adminUid, adminEmail, action, targetType, targetId, details,
      createdAt: serverTimestamp()
    })
  } catch (e) {
    console.error('Audit log failed:', e)
  }
}

export default function AuditLogPage() {
  const [entries, setEntries]   = useState<AuditEntry[]>([])
  const [filtered, setFiltered] = useState<AuditEntry[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const { admin } = useAuth()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(query(
        collection(db, 'audit_log'),
        orderBy('createdAt', 'desc'),
        limit(500)
      ))
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })) as AuditEntry[])
    } catch { } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    let result = entries
    if (actionFilter !== 'all') result = result.filter(e => e.action === actionFilter)
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(e =>
        e.action?.toLowerCase().includes(q) ||
        e.adminEmail?.toLowerCase().includes(q) ||
        e.targetId?.includes(q) ||
        e.details?.toLowerCase().includes(q)
      )
    }
    setFiltered(result)
  }, [entries, search, actionFilter])

  const uniqueActions = [...new Set(entries.map(e => e.action))].sort()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>Audit Log</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Complete record of all admin actions</p>
        </div>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 14px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>
          <RefreshCw size={14} />Refresh
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} style={{
          padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)',
          background: 'var(--surface-alt)', color: 'var(--text-primary)', fontSize: '12px', cursor: 'pointer'
        }}>
          <option value="all">All Actions</option>
          {uniqueActions.map(a => (
            <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
          ))}
        </select>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 12px' }}>
          <Search size={13} style={{ color: 'var(--text-tertiary)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search logs..."
            style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '12px', width: '180px' }}
          />
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '8px 0' }}>
        <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--border)', marginBottom: '4px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
            {filtered.length} entries {search || actionFilter !== 'all' ? '(filtered)' : ''}
          </span>
        </div>

        {loading ? <div style={{ padding: '16px' }}><TableSkeleton rows={8} cols={5} /></div>
        : filtered.length === 0 ? (
          <EmptyState icon={<ClipboardList size={24} />} title="No audit entries yet" description="Admin actions will appear here" />
        ) : (
          <div>
            {filtered.map((entry, i) => (
              <div key={entry.id} style={{
                padding: '12px 20px',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                display: 'flex', alignItems: 'flex-start', gap: '14px'
              }}>
                {/* Action dot */}
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, marginTop: '5px',
                  background: ACTION_COLORS[entry.action] || '#94a3b8'
                }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '3px', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '12px', fontWeight: 700,
                      color: ACTION_COLORS[entry.action] || 'var(--text-secondary)',
                      textTransform: 'capitalize'
                    }}>
                      {entry.action?.replace(/_/g, ' ')}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>by</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {entry.adminEmail || entry.adminUid?.slice(0, 10)}
                    </span>
                    {entry.targetType && (
                      <>
                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>on</span>
                        <span style={{
                          fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px',
                          background: 'var(--surface-alt)', color: 'var(--text-tertiary)'
                        }}>{entry.targetType}</span>
                      </>
                    )}
                  </div>
                  {entry.details && (
                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '2px' }}>
                      {entry.details}
                    </div>
                  )}
                  {entry.targetId && (
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontFamily: "'JetBrains Mono', monospace" }}>
                      ID: {entry.targetId.slice(0, 20)}...
                    </div>
                  )}
                </div>

                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', flexShrink: 0, textAlign: 'right' }}>
                  {formatDate(entry.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
