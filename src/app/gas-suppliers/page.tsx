'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Factory, Plus, Search, RefreshCw } from 'lucide-react'
import { EmptyState, StatsCard, StatusBadge, TableSkeleton } from '@/components/shared'
import { formatDateShort } from '@/lib/utils'
import { SUPPLIER_STATUSES, label, type Supplier, type SupplierStatus } from '@/lib/gas-suppliers'
import { countStations, listSuppliers } from '@/lib/gas-supplier-data'
import { SupplierForm } from '@/components/features/gas-suppliers/SupplierForm'
import { Notice, OrdersBadge, buttonStyle } from '@/components/features/gas-suppliers/ui'
import { gasLoadError } from '@/lib/gas-supplier-ops'

type Row = Supplier & { stationCount: number | null }

export default function GasSuppliersPage() {
  const router = useRouter()
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
        {(['all', ...SUPPLIER_STATUSES] as const).map((st) => (
          <button key={st} onClick={() => setStatus(st)} style={{
            padding: '7px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
            background: status === st ? 'var(--primary-dark)' : 'var(--surface-alt)', color: status === st ? '#fff' : 'var(--text-secondary)',
          }}>
            {st === 'all' ? 'All' : label(st)} <span style={{ opacity: 0.7 }}>({st === 'all' ? rows.length : count(st)})</span>
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 12px' }}>
          <Search size={13} style={{ color: 'var(--text-tertiary)' }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, contact, ID…"
            style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '12px', width: '180px' }} />
        </div>
      </div>

      {loadError && <Notice tone="danger">{loadError}</Notice>}

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
                    <th>Status</th><th>Orders</th><th>Created</th><th>Updated</th>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {creating && (
        <SupplierForm onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); router.push(`/gas-suppliers/${id}`) }} />
      )}
    </div>
  )
}
