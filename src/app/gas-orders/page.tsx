'use client'
import { useEffect, useState, useCallback } from 'react'
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { GasOrder } from '@/types'
import { StatusBadge, EmptyState, TableSkeleton, StatsCard } from '@/components/shared'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Flame, Search } from 'lucide-react'
import { toast } from 'sonner'
import { GasFilter, matchesGasFilter } from '@/lib/gas-order-filters'

export default function GasOrdersPage() {
  const [orders, setOrders] = useState<GasOrder[]>([])
  const [filtered, setFiltered] = useState<GasOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<GasFilter>('all')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'gas_orders'), orderBy('createdAt', 'desc'), limit(200)))
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })) as GasOrder[])
    } catch (e: any) { console.error('loadGasOrders', e); toast.error(`Failed to load gas orders: ${e?.code || e?.message || e}`) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    let result = orders
    if (filter !== 'all') result = result.filter(o => matchesGasFilter(o.status, filter))
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(o =>
        o.deliveryAddress?.toLowerCase().includes(q) ||
        o.cylinderSize?.toLowerCase().includes(q) ||
        o.id.includes(q)
      )
    }
    setFiltered(result)
  }, [orders, filter, search])

  const totalRevenue = orders.filter(o => o.status === 'delivered').reduce((s, o) => s + o.totalPrice, 0)

  const filters: { key: GasFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pendingApproval', label: 'Pending' },
    { key: 'driverAssigned', label: 'Assigned' },
    { key: 'delivered', label: 'Delivered' },
    { key: 'cancelled', label: 'Cancelled' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>Gas Orders</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>{orders.length} gas cylinder orders</p>
      </div>

      {/* Mini stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        <StatsCard title="Total Orders" value={orders.length}
          icon={<Flame size={16} />} iconColor="var(--tone-warning-fg)" iconBg="rgba(249,115,22,0.12)" />
        <StatsCard title="Delivered" value={orders.filter(o => o.status === 'delivered').length}
          icon={<Flame size={16} />} iconColor="var(--accent-text)" iconBg="rgba(22,163,74,0.12)" />
        <StatsCard title="Gas Revenue" value={formatCurrency(totalRevenue)}
          icon={<Flame size={16} />} iconColor="var(--tone-warning-fg)" iconBg="rgba(249,115,22,0.12)" />
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {filters.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: '7px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
            fontSize: '12px', fontWeight: 600,
            background: filter === f.key ? '#d97706' : 'var(--surface-alt)',
            color: filter === f.key ? '#fff' : 'var(--text-secondary)',
          }}>{f.label}</button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 12px' }}>
          <Search size={13} style={{ color: 'var(--text-tertiary)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search orders..."
            style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '12px', width: '160px' }}
          />
        </div>
      </div>

      {loading ? <TableSkeleton rows={8} cols={6} /> : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <EmptyState icon={<Flame size={24} />} title="No gas orders found" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ background: 'var(--surface)' }}>
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Cylinder</th>
                    <th>Qty</th>
                    <th>Delivery Address</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o => (
                    <tr key={o.id}>
                      <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {o.id.slice(0, 10)}...
                      </td>
                      <td>
                        <span style={{ fontSize: '12px', fontWeight: 700, padding: '2px 10px', background: 'rgba(217,119,6,0.12)', borderRadius: '6px', color: 'var(--tone-warning-fg)' }}>
                          {o.cylinderSize}
                        </span>
                      </td>
                      <td style={{ fontSize: '13px', fontWeight: 700 }}>{o.quantity}</td>
                      <td style={{ maxWidth: '180px' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>
                          {o.deliveryAddress || '—'}
                        </div>
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--tone-warning-fg)' }}>{formatCurrency(o.totalPrice)}</td>
                      <td><StatusBadge status={o.status} /></td>
                      <td style={{ fontSize: '11px' }}>{formatDate(o.createdAt)}</td>
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
