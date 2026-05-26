'use client'
import { useEffect, useState, useCallback } from 'react'
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Trip } from '@/types'
import { StatusBadge, EmptyState, TableSkeleton } from '@/components/shared'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Car, Search } from 'lucide-react'

type TripFilter = 'all' | 'searching' | 'tripAccepted' | 'tripStarted' | 'completed' | 'cancelled'

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [filtered, setFiltered] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<TripFilter>('all')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'trips'), orderBy('createdAt', 'desc'), limit(200)))
      setTrips(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Trip[])
    } catch { } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    let result = trips
    if (filter !== 'all') {
      if (filter === 'cancelled') {
        result = result.filter(t => t.status.toLowerCase().includes('cancel'))
      } else {
        result = result.filter(t => t.status === filter)
      }
    }
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(t =>
        t.pickupAddress?.toLowerCase().includes(q) ||
        t.dropoffAddress?.toLowerCase().includes(q) ||
        t.driverName?.toLowerCase().includes(q) ||
        t.id.includes(q)
      )
    }
    setFiltered(result)
  }, [trips, filter, search])

  const filters: { key: TripFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'searching', label: 'Searching' },
    { key: 'tripAccepted', label: 'Accepted' },
    { key: 'tripStarted', label: 'Active' },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>Trips</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>{trips.length} trips total</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {filters.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: '7px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
            fontSize: '12px', fontWeight: 600,
            background: filter === f.key ? '#16a34a' : 'var(--surface-alt)',
            color: filter === f.key ? '#fff' : 'var(--text-secondary)',
          }}>{f.label}</button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 12px' }}>
          <Search size={13} style={{ color: 'var(--text-tertiary)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search trips..."
            style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '12px', width: '160px' }}
          />
        </div>
      </div>

      {loading ? <TableSkeleton rows={8} cols={7} /> : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <EmptyState icon={<Car size={24} />} title="No trips found" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ background: 'var(--surface)' }}>
                <thead>
                  <tr>
                    <th>Trip ID</th>
                    <th>Pickup</th>
                    <th>Dropoff</th>
                    <th>Driver</th>
                    <th>Service</th>
                    <th>Fare</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(trip => (
                    <tr key={trip.id}>
                      <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {trip.id.slice(0, 10)}...
                      </td>
                      <td style={{ maxWidth: '150px' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>
                          {trip.pickupAddress || '—'}
                        </div>
                      </td>
                      <td style={{ maxWidth: '150px' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>
                          {trip.dropoffAddress || '—'}
                        </div>
                      </td>
                      <td style={{ fontSize: '12px', fontWeight: 600 }}>{trip.driverName || '—'}</td>
                      <td>
                        <span style={{ fontSize: '11px', textTransform: 'capitalize', padding: '2px 8px', background: 'var(--surface-alt)', borderRadius: '6px', color: 'var(--text-secondary)' }}>
                          {trip.serviceType || 'ride'}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700, color: '#4ade80' }}>
                        {formatCurrency(trip.actualFare || trip.estimatedFare || 0)}
                      </td>
                      <td><StatusBadge status={trip.status} /></td>
                      <td style={{ fontSize: '11px' }}>{formatDate(trip.createdAt)}</td>
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
