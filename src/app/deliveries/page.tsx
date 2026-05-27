'use client'
import { useEffect, useState, useCallback } from 'react'
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Delivery } from '@/types'
import { StatusBadge, EmptyState, TableSkeleton } from '@/components/shared'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Package, Search, Download, RefreshCw } from 'lucide-react'
import { exportToCSV } from '@/lib/export'

type DeliveryFilter = 'all' | 'pending' | 'driverAssigned' | 'completed' | 'cancelled'

export default function DeliveriesPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [filtered, setFiltered] = useState<Delivery[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<DeliveryFilter>('all')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'deliveries'), orderBy('createdAt', 'desc'), limit(200)))
      setDeliveries(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Delivery[])
    } catch { } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    let result = deliveries
    if (filter !== 'all') {
      if (filter === 'cancelled') result = result.filter(d => d.status.toLowerCase().includes('cancel'))
      else result = result.filter(d => d.status === filter)
    }
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(d =>
        d.pickupAddress?.toLowerCase().includes(q) ||
        d.dropoffAddress?.toLowerCase().includes(q) ||
        d.driverName?.toLowerCase().includes(q) ||
        d.parcelType?.toLowerCase().includes(q)
      )
    }
    setFiltered(result)
  }, [deliveries, filter, search])

  const filters: { key: DeliveryFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'driverAssigned', label: 'Assigned' },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>Deliveries</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>{deliveries.length} delivery orders</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => exportToCSV(filtered.map(d => ({ id: d.id, status: d.status, pickup: d.pickupAddress, dropoff: d.dropoffAddress, parcel: d.parcelType, driver: d.driverName || '', fare: d.actualFare || d.estimatedFare || 0 })), 'deliveries')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.2)', borderRadius: '8px', padding: '8px 14px', color: '#4ade80', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
            <Download size={14} /> Export CSV
          </button>
          <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {filters.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: '7px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
            fontSize: '12px', fontWeight: 600,
            background: filter === f.key ? '#0284c7' : 'var(--surface-alt)',
            color: filter === f.key ? '#fff' : 'var(--text-secondary)',
          }}>{f.label}</button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 12px' }}>
          <Search size={13} style={{ color: 'var(--text-tertiary)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search deliveries..."
            style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '12px', width: '160px' }}
          />
        </div>
      </div>

      {loading ? <TableSkeleton rows={8} cols={7} /> : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <EmptyState icon={<Package size={24} />} title="No deliveries found" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ background: 'var(--surface)' }}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Pickup</th>
                    <th>Dropoff</th>
                    <th>Parcel</th>
                    <th>Driver</th>
                    <th>Fare</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(d => (
                    <tr key={d.id}>
                      <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {d.id.slice(0, 10)}...
                      </td>
                      <td style={{ maxWidth: '140px' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>
                          {d.pickupAddress || '—'}
                        </div>
                      </td>
                      <td style={{ maxWidth: '140px' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>
                          {d.dropoffAddress || '—'}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: '11px', padding: '2px 8px', background: 'rgba(124,58,237,0.12)', borderRadius: '6px', color: '#a78bfa' }}>
                          {d.parcelType || '—'} · {d.weightTier || ''}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', fontWeight: 600 }}>{d.driverName || '—'}</td>
                      <td style={{ fontWeight: 700, color: '#4ade80' }}>
                        {formatCurrency(d.actualFare || d.estimatedFare || 0)}
                      </td>
                      <td><StatusBadge status={d.status} /></td>
                      <td style={{ fontSize: '11px' }}>{formatDate(d.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
