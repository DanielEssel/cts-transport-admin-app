'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ClipboardCheck, Factory, Plus, Search, RefreshCw } from 'lucide-react'
import { EmptyState, StatsCard, StatusBadge, TableSkeleton } from '@/components/shared'
import { formatDateShort } from '@/lib/utils'
import { label, type Supplier, type SupplierStatus } from '@/lib/gas-suppliers'
import { countStations, listSuppliers } from '@/lib/gas-supplier-data'
import { SupplierForm } from '@/components/features/gas-suppliers/SupplierForm'
import { Notice, OrdersBadge, buttonStyle } from '@/components/features/gas-suppliers/ui'
import { gasLoadError } from '@/lib/gas-supplier-ops'
import { SupplierReview } from '@/components/features/gas-suppliers/SupplierReview'
import { useAuth } from '@/lib/auth-context'

type Row = Supplier & { stationCount: number | null }

// Tabs in working order: the review queue first.
const STATUS_TABS = ['all', 'pending_verification', 'draft', 'approved', 'rejected', 'suspended'] as const

export default function GasSuppliersPage() {
  const router = useRouter()
  const { admin } = useAuth()
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<SupplierStatus | 'all'>('all')
  const [creating, setCreating] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const suppliers = await listSuppliers()
      const counts = await Promise.all(suppliers.map((s) => countStations(s.id).catch(() => null)))
      setRows(suppliers.map((s, i) => ({ ...s, stationCount: counts[i] })))
    } catch (e: any) {
      console.error('loadSuppliers', e)
      setRows([])
      setLoadError(gasLoadError(e, 'gas_suppliers', 'Gas suppliers'))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((s) => (status === 'all' || s.status === status) && (!q || [
      s.id, s.legalName, s.tradingName, s.contact?.name, s.contact?.phone, s.contact?.email,
    ].some((v) => v?.toLowerCase().includes(q))))
  }, [rows, search, status])

  const count = (st: SupplierStatus) => rows.filter((s) => s.status === st).length
  const queue = useMemo(() => rows.filter((s) => s.status === 'pending_verification'), [rows])
  const reviewed = rows.find((s) => s.id === reviewing) ?? null
  const queueIndex = reviewed ? queue.findIndex((s) => s.id === reviewed.id) : -1

  // After a decision in the review queue, move to the next supplier still
  // awaiting verification; a quick view simply closes.
  const afterDecision = async () => {
    const next = queueIndex >= 0 ? queue.find((s) => s.id !== reviewing)?.id ?? null : null
    await load()
    setReviewing(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '220px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>Gas Suppliers</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Onboard and verify Gas suppliers, their stations and their prices.</p>
        </div>
        <button onClick={load} style={buttonStyle('secondary')}><RefreshCw size={13} /> Refresh</button>
        <button onClick={() => setCreating(true)} style={buttonStyle('primary')}><Plus size={14} /> New supplier</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
        <StatsCard title="Suppliers" value={rows.length} icon={<Factory size={16} />} iconColor="#fb923c" iconBg="rgba(249,115,22,0.12)" loading={loading} />
        <StatsCard title="Awaiting verification" value={count('pending_verification')} icon={<Factory size={16} />} iconColor="var(--tone-warning-fg)" iconBg="rgba(234,179,8,0.12)" loading={loading} />
        <StatsCard title="Approved" value={count('approved')} icon={<Factory size={16} />} iconColor="var(--accent-text)" iconBg="rgba(22,163,74,0.12)" loading={loading} />
        <StatsCard title="Taking orders" value={rows.filter((s) => s.ordersEnabled).length} icon={<Factory size={16} />} iconColor="var(--tone-info-fg)" iconBg="rgba(96,165,250,0.12)" loading={loading} />
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="segmented" role="group" aria-label="Filter by status" style={{ flexWrap: 'wrap' }}>
          {STATUS_TABS.map((st) => (
            <button key={st} onClick={() => setStatus(st)} aria-pressed={status === st}>
              {st === 'all' ? 'All' : label(st)}{' '}
              <span style={{ fontWeight: 700, color: st === 'pending_verification' && count(st) > 0 ? 'var(--tone-warning-fg)' : 'var(--text-tertiary)' }}>
                {st === 'all' ? rows.length : count(st)}
              </span>
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 12px' }}>
          <Search size={13} style={{ color: 'var(--text-tertiary)' }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, contact, ID…"
            style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '12px', width: '180px' }} />
        </div>
      </div>

      {loadError && <Notice tone="danger">{loadError}</Notice>}

      {!loading && queue.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '12px 16px', borderRadius: 'var(--radius-card)', background: 'var(--tone-warning-bg)', border: '1px solid var(--border)' }}>
          <ClipboardCheck size={18} color="var(--tone-warning-fg)" />
          <div style={{ flex: 1, minWidth: '200px', fontSize: '13px', color: 'var(--tone-warning-fg)', fontWeight: 600 }}>
            {queue.length} {queue.length === 1 ? 'supplier is' : 'suppliers are'} awaiting verification.
          </div>
          <button className="btn btn-primary" onClick={() => setReviewing(queue[0].id)}>Start review</button>
        </div>
      )}

      {loading ? <TableSkeleton rows={6} cols={7} /> : loadError ? null : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <EmptyState icon={<Factory size={24} />} title={rows.length ? 'No suppliers match' : 'No suppliers yet'}
              description={rows.length ? 'Try another filter or search.' : 'Create a draft supplier to start onboarding.'} />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Supplier</th><th>Operating model</th><th>Contact</th><th>Stations</th>
                    <th>Status</th><th>Orders</th><th>Created</th><th>Updated</th><th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} onClick={() => router.push(`/gas-suppliers/${s.id}`)} style={{ cursor: 'pointer' }}>
                      <td>
                        <Link href={`/gas-suppliers/${s.id}`} onClick={(e) => e.stopPropagation()}
                          style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none' }}>
                          {s.tradingName || s.legalName}
                        </Link>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                          {s.tradingName ? `${s.legalName} · ` : ''}<span style={{ fontFamily: 'var(--font-mono)' }}>{s.id}</span>
                        </div>
                      </td>
                      <td style={{ fontSize: '12px' }}>{label(s.operatingModel)}</td>
                      <td style={{ fontSize: '12px' }}>
                        <div>{s.contact?.name || '—'}</div>
                        <div style={{ color: 'var(--text-tertiary)' }}>{[s.contact?.phone, s.contact?.email].filter(Boolean).join(' · ') || '—'}</div>
                      </td>
                      <td>{s.stationCount ?? '—'}</td>
                      <td><StatusBadge status={s.status} /></td>
                      <td><OrdersBadge on={s.ordersEnabled} /></td>
                      <td style={{ fontSize: '11px' }}>{formatDateShort(s.createdAt)}</td>
                      <td style={{ fontSize: '11px' }}>{formatDateShort(s.updatedAt)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button onClick={(e) => { e.stopPropagation(); setReviewing(s.id) }}
                          className={`btn ${s.status === 'pending_verification' ? 'btn-primary' : 'btn-secondary'}`} style={{ minHeight: '30px', fontSize: '12px' }}>
                          {s.status === 'pending_verification' ? 'Review' : 'Quick view'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {reviewed && admin && (
        <SupplierReview supplier={reviewed} stationCount={reviewed.stationCount} admin={admin}
          position={queueIndex >= 0 ? `${queueIndex + 1} of ${queue.length} awaiting verification` : undefined}
          onClose={() => setReviewing(null)} onChanged={afterDecision} />
      )}

      {creating && (
        <SupplierForm onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); router.push(`/gas-suppliers/${id}`) }} />
      )}
    </div>
  )
}
