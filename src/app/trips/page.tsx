'use client'
import { useEffect, useState, useCallback } from 'react'
import { collection, getDocs, query, orderBy, limit, doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Trip } from '@/types'
import { StatusBadge, EmptyState, TableSkeleton } from '@/components/shared'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Car, Search, Download, RefreshCw, Edit2, X, Check } from 'lucide-react'
import { toast } from 'sonner'
import { exportToCSV } from '@/lib/export'

type TripFilter = 'all' | 'searching' | 'tripAccepted' | 'tripStarted' | 'completed' | 'cancelled'

export default function TripsPage() {
  const [trips, setTrips]         = useState<Trip[]>([])
  const [filtered, setFiltered]   = useState<Trip[]>([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState<TripFilter>('all')
  const [search, setSearch]       = useState('')
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')
  const [editTrip, setEditTrip]   = useState<Trip | null>(null)
  const [newFare, setNewFare]     = useState('')
  const [fareReason, setFareReason] = useState('')
  const [saving, setSaving]       = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'trips'), orderBy('createdAt', 'desc'), limit(500)))
      setTrips(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Trip[])
    } catch { } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    let result = trips
    if (filter !== 'all') {
      if (filter === 'cancelled') result = result.filter(t => t.status.toLowerCase().includes('cancel'))
      else result = result.filter(t => t.status === filter)
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
    if (dateFrom) {
      const from = new Date(dateFrom)
      result = result.filter(t => {
        const d = t.createdAt?.toDate?.() || new Date(t.createdAt)
        return d >= from
      })
    }
    if (dateTo) {
      const to = new Date(dateTo); to.setHours(23,59,59)
      result = result.filter(t => {
        const d = t.createdAt?.toDate?.() || new Date(t.createdAt)
        return d <= to
      })
    }
    setFiltered(result)
  }, [trips, filter, search, dateFrom, dateTo])

  const handleFareOverride = async () => {
    if (!editTrip || !newFare) return
    const amount = parseFloat(newFare)
    if (isNaN(amount) || amount < 0) { toast.error('Enter valid fare'); return }
    setSaving(true)
    try {
      await updateDoc(doc(db, 'trips', editTrip.id), {
        actualFare:      amount,
        fareOverride:    true,
        fareOverrideReason: fareReason || 'Admin adjustment',
        fareOverrideAt:  new Date(),
      })
      toast.success(`Fare updated to ${formatCurrency(amount)}`)
      setEditTrip(null); setNewFare(''); setFareReason('')
      load()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const handleExport = () => {
    const rows = filtered.map(t => ({
      id:             t.id,
      status:         t.status,
      serviceType:    t.serviceType,
      driverName:     t.driverName || '',
      passengerName:  t.passengerName || '',
      pickupAddress:  t.pickupAddress,
      dropoffAddress: t.dropoffAddress,
      estimatedFare:  t.estimatedFare,
      actualFare:     t.actualFare || '',
      platformFee:    t.actualFare ? (t.actualFare * 0.15).toFixed(2) : '',
      createdAt:      t.createdAt?.toDate?.()?.toLocaleDateString('en-GH') || '',
    }))
    exportToCSV(rows, 'trips')
  }

  const filters: { key: TripFilter; label: string }[] = [
    { key: 'all',          label: 'All' },
    { key: 'searching',    label: 'Searching' },
    { key: 'tripAccepted', label: 'Accepted' },
    { key: 'tripStarted',  label: 'Active' },
    { key: 'completed',    label: 'Completed' },
    { key: 'cancelled',    label: 'Cancelled' },
  ]

  const totalRevenue = filtered.filter(t => t.status === 'completed').reduce((s, t) => s + ((t.actualFare || t.estimatedFare || 0) * 0.15), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>Trips</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
            {filtered.length} trips · Platform revenue: <strong style={{ color: '#4ade80' }}>{formatCurrency(totalRevenue)}</strong>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.2)', borderRadius: '8px', padding: '8px 14px', color: '#4ade80', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
            <Download size={14} /> Export CSV
          </button>
          <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 14px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Status filters */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {filters.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: '7px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
            fontSize: '12px', fontWeight: 600,
            background: filter === f.key ? '#16a34a' : 'var(--surface-alt)',
            color: filter === f.key ? '#fff' : 'var(--text-secondary)',
          }}>{f.label}</button>
        ))}
      </div>

      {/* Date range + search */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 600 }}>From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{
            padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)',
            background: 'var(--surface-alt)', color: 'var(--text-primary)', fontSize: '12px', cursor: 'pointer'
          }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 600 }}>To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{
            padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)',
            background: 'var(--surface-alt)', color: 'var(--text-primary)', fontSize: '12px', cursor: 'pointer'
          }} />
        </div>
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(''); setDateTo('') }} style={{ fontSize: '11px', color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            Clear dates
          </button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 12px' }}>
          <Search size={13} style={{ color: 'var(--text-tertiary)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search trips..."
            style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '12px', width: '160px' }} />
        </div>
      </div>

      {/* Table */}
      {loading ? <TableSkeleton rows={8} cols={7} /> : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <EmptyState icon={<Car size={24} />} title="No trips found" description="Try adjusting filters or date range" />
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
                    <th>Platform Fee</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(trip => {
                    const fare = trip.actualFare || trip.estimatedFare || 0
                    const fee  = fare * 0.15
                    return (
                      <tr key={trip.id}>
                        <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--text-tertiary)' }}>
                          {trip.id.slice(0, 8)}...
                        </td>
                        <td style={{ maxWidth: '130px' }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>
                            {trip.pickupAddress || '—'}
                          </div>
                        </td>
                        <td style={{ maxWidth: '130px' }}>
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
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 700, color: '#4ade80' }}>{formatCurrency(fare)}</span>
                            {trip.fareOverride && (
                              <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>OVERRIDDEN</span>
                            )}
                          </div>
                        </td>
                        <td style={{ fontSize: '12px', color: '#a78bfa', fontWeight: 600 }}>{formatCurrency(fee)}</td>
                        <td><StatusBadge status={trip.status} /></td>
                        <td style={{ fontSize: '11px' }}>{formatDate(trip.createdAt)}</td>
                        <td>
                          {trip.status === 'completed' && (
                            <button onClick={() => { setEditTrip(trip); setNewFare(String(trip.actualFare || trip.estimatedFare || '')) }}
                              style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: 'rgba(251,191,36,0.12)', color: '#fbbf24', cursor: 'pointer', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Edit2 size={10} /> Adjust Fare
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Fare override modal */}
      {editTrip && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px', padding: '28px', width: '90%', maxWidth: '400px', boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>Adjust Trip Fare</h3>
              <button onClick={() => setEditTrip(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}><X size={18} /></button>
            </div>

            {/* Trip summary */}
            <div style={{ background: 'var(--surface-alt)', borderRadius: '10px', padding: '12px', marginBottom: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <div style={{ marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📍 {editTrip.pickupAddress}</div>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🏁 {editTrip.dropoffAddress}</div>
              <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Driver: <strong>{editTrip.driverName || '—'}</strong></span>
                <span>Original: <strong style={{ color: '#4ade80' }}>{formatCurrency(editTrip.estimatedFare)}</strong></span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                  New Fare (GHS)
                </label>
                <input type="number" value={newFare} onChange={e => setNewFare(e.target.value)}
                  placeholder="0.00" min="0" step="0.01"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '18px', fontWeight: 700, outline: 'none' }}
                />
                {newFare && (
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                    Platform fee: {formatCurrency(parseFloat(newFare) * 0.15)} · Driver gets: {formatCurrency(parseFloat(newFare) * 0.85)}
                  </div>
                )}
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                  Reason for adjustment
                </label>
                <input value={fareReason} onChange={e => setFareReason(e.target.value)}
                  placeholder="e.g. Passenger dispute resolved"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => setEditTrip(null)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
              <button onClick={handleFareOverride} disabled={saving || !newFare} style={{
                flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
                background: 'linear-gradient(135deg, #16a34a, #15803d)',
                color: '#fff', cursor: saving || !newFare ? 'not-allowed' : 'pointer',
                fontSize: '13px', fontWeight: 700, opacity: saving || !newFare ? 0.7 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
              }}>
                <Check size={14} />{saving ? 'Saving...' : 'Apply Override'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
