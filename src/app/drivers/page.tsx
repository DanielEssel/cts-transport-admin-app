'use client'
import { useEffect, useState, useCallback } from 'react'
import { collection, getDocs, query, where, orderBy, doc, updateDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/lib/firebase'
import { Driver } from '@/types'
import { StatusBadge, Avatar, EmptyState, TableSkeleton, ConfirmDialog } from '@/components/shared'
import { formatDateShort, formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import { UserCheck, Search, Filter, CheckCircle, XCircle, Ban, RefreshCw, Eye } from 'lucide-react'
import { DriverDetailModal } from '@/components/features/DriverDetailModal'

type FilterType = 'all' | 'pending' | 'approved' | 'suspended'
type ServiceFilter = 'all' | 'okada' | 'taxi' | 'delivery'

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [filtered, setFiltered] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>('all')
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null)
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'suspend' | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({})
  const [viewDriver, setViewDriver] = useState<Driver | null>(null)

  const loadDrivers = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'drivers'), orderBy('createdAt', 'desc')))
      const data = snap.docs.map(d => ({ uid: d.id, ...d.data() })) as Driver[]
      setDrivers(data)
    } catch (e) { toast.error('Failed to load drivers') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadDrivers() }, [loadDrivers])

  useEffect(() => {
    let result = drivers
    if (filter === 'pending') result = result.filter(d => !d.isApproved && d.signupStep !== 'suspended' && d.signupStep !== 'rejected' && (d.signupStep === 'documents_submitted' || d.signupStep === 'pending_review' || Object.keys(d.documents || {}).length > 0))
    if (filter === 'approved') result = result.filter(d => d.isApproved)
    if (filter === 'suspended') result = result.filter(d => d.signupStep === 'suspended')
    if (filter === 'rejected')  result = result.filter(d => d.signupStep === 'rejected' || d.documentsRejected)
    if (serviceFilter !== 'all') result = result.filter(d => d.serviceType === serviceFilter)
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(d =>
        d.displayName?.toLowerCase().includes(q) ||
        d.phone?.includes(q) ||
        d.email?.toLowerCase().includes(q)
      )
    }
    setFiltered(result)
  }, [drivers, filter, serviceFilter, search])

  const handleApprove = async () => {
    if (!selectedDriver) return
    setActionLoading(true)
    try {
      const approveDriver = httpsCallable(functions, 'approveDriver')
      await approveDriver({ driverUid: selectedDriver.uid, action: 'approve' })
      toast.success(`${selectedDriver.displayName} approved successfully`)
      setSelectedDriver(null); setActionType(null)
      loadDrivers()
    } catch (e: any) { toast.error(e.message || 'Approval failed') }
    finally { setActionLoading(false) }
  }

  const handleReject = async () => {
    if (!selectedDriver) return
    setActionLoading(true)
    try {
      const approveDriver = httpsCallable(functions, 'approveDriver')
      await approveDriver({ driverUid: selectedDriver.uid, action: 'reject', rejectionReasons })
      toast.success(`${selectedDriver.displayName} rejected`)
      setSelectedDriver(null); setActionType(null); setRejectionReasons({})
      loadDrivers()
    } catch (e: any) { toast.error(e.message || 'Rejection failed') }
    finally { setActionLoading(false) }
  }

  const handleSuspend = async () => {
    if (!selectedDriver) return
    setActionLoading(true)
    try {
      await updateDoc(doc(db, 'drivers', selectedDriver.uid), {
        signupStep: 'suspended', isApproved: false, isAvailable: false, isOnline: false
      })
      toast.success(`${selectedDriver.displayName} suspended`)
      setSelectedDriver(null); setActionType(null)
      loadDrivers()
    } catch (e: any) { toast.error(e.message || 'Suspend failed') }
    finally { setActionLoading(false) }
  }

  const handleUnsuspend = async (driver: Driver) => {
    try {
      await updateDoc(doc(db, 'drivers', driver.uid), { signupStep: 'approved', isApproved: true })
      toast.success(`${driver.displayName} unsuspended`)
      loadDrivers()
    } catch (e: any) { toast.error(e.message) }
  }

  const filterBtns: { key: FilterType; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: drivers.length },
    { key: 'pending', label: 'Pending', count: drivers.filter(d => !d.isApproved && d.signupStep !== 'suspended').length },
    { key: 'approved', label: 'Approved', count: drivers.filter(d => d.isApproved).length },
    { key: 'suspended', label: 'Suspended', count: drivers.filter(d => d.signupStep === 'suspended').length },
    { key: 'rejected',  label: 'Rejected',  count: drivers.filter(d => d.signupStep === 'rejected' || d.documentsRejected).length },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>Driver Management</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>{drivers.length} total drivers registered</p>
        </div>
        <button onClick={loadDrivers} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: '8px',
          padding: '8px 14px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px'
        }}>
          <RefreshCw size={14} />Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {filterBtns.map(btn => (
          <button key={btn.key} onClick={() => setFilter(btn.key)} style={{
            padding: '7px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
            fontSize: '12px', fontWeight: 600,
            background: filter === btn.key ? '#16a34a' : 'var(--surface-alt)',
            color: filter === btn.key ? '#fff' : 'var(--text-secondary)',
          }}>
            {btn.label} <span style={{ opacity: 0.7 }}>({btn.count})</span>
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          {/* Service filter */}
          <select value={serviceFilter} onChange={e => setServiceFilter(e.target.value as ServiceFilter)} style={{
            background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: '8px',
            padding: '7px 12px', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer'
          }}>
            <option value="all">All Services</option>
            <option value="okada">Okada</option>
            <option value="taxi">Taxi</option>
            <option value="delivery">Delivery</option>
          </select>

          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 12px' }}>
            <Search size={13} style={{ color: 'var(--text-tertiary)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search drivers..."
              style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '12px', width: '160px' }}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? <TableSkeleton rows={8} cols={6} /> : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <EmptyState icon={<UserCheck size={24} />} title="No drivers found" description="Try adjusting your filters" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ background: 'var(--surface)' }}>
                <thead>
                  <tr>
                    <th>Driver</th>
                    <th>Phone</th>
                    <th>Service</th>
                    <th>Status</th>
                    <th>Online</th>
                    <th>Rating</th>
                    <th>Trips</th>
                    <th>Earnings</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(driver => (
                    <tr key={driver.uid}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Avatar name={driver.displayName || 'Driver'} photoUrl={driver.photoUrl} size={32} />
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{driver.displayName}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{driver.email || '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>{driver.phone}</td>
                      <td>
                        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'capitalize', padding: '3px 8px', background: 'var(--surface-alt)', borderRadius: '6px', color: 'var(--text-secondary)' }}>
                          {driver.serviceType}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={driver.signupStep === 'suspended' ? 'suspended' : driver.isApproved ? 'approved' : 'pending'} />
                      </td>
                      <td>
                        <StatusBadge status={driver.isOnline ? 'online' : 'offline'} />
                      </td>
                      <td style={{ fontWeight: 600, color: '#fbbf24' }}>
                        {driver.rating ? `⭐ ${driver.rating.toFixed(1)}` : '—'}
                      </td>
                      <td>{driver.completedTrips || driver.totalTrips || 0}</td>
                      <td style={{ color: '#4ade80', fontWeight: 600 }}>
                        {driver.totalEarnings ? formatCurrency(driver.totalEarnings) : '—'}
                      </td>
                      <td style={{ fontSize: '11px' }}>{formatDateShort(driver.createdAt)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {/* View button — opens DriverDetailModal */}
                          <button onClick={() => setViewDriver(driver)}
                            style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: 'rgba(99,102,241,0.12)', color: '#818cf8', cursor: 'pointer', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Eye size={11} />View
                          </button>
                          {!driver.isApproved && driver.signupStep !== 'suspended' && (
                            <button onClick={() => { setSelectedDriver(driver); setActionType('approve') }}
                              style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: 'rgba(22,163,74,0.15)', color: '#4ade80', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}>
                              Approve
                            </button>
                          )}
                          {!driver.isApproved && driver.signupStep !== 'suspended' && (
                            <button onClick={() => { setSelectedDriver(driver); setActionType('reject') }}
                              style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: 'rgba(239,68,68,0.12)', color: '#f87171', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}>
                              Reject
                            </button>
                          )}
                          {driver.isApproved && driver.signupStep !== 'suspended' && (
                            <button onClick={() => { setSelectedDriver(driver); setActionType('suspend') }}
                              style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: 'rgba(234,179,8,0.12)', color: '#fbbf24', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}>
                              Suspend
                            </button>
                          )}
                          {driver.signupStep === 'suspended' && (
                            <button onClick={() => handleUnsuspend(driver)}
                              style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: 'rgba(22,163,74,0.15)', color: '#4ade80', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}>
                              Unsuspend
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={actionType === 'approve' && !!selectedDriver}
        title={`Approve ${selectedDriver?.displayName}?`}
        description="This will verify the driver's account and allow them to accept trips."
        confirmLabel="Approve Driver"
        confirmColor="#16a34a"
        onConfirm={handleApprove}
        onCancel={() => { setSelectedDriver(null); setActionType(null) }}
        loading={actionLoading}
      />
      <ConfirmDialog
        open={actionType === 'suspend' && !!selectedDriver}
        title={`Suspend ${selectedDriver?.displayName}?`}
        description="This driver will be unable to accept any trips or go online."
        confirmLabel="Suspend Driver"
        confirmColor="#f59e0b"
        onConfirm={handleSuspend}
        onCancel={() => { setSelectedDriver(null); setActionType(null) }}
        loading={actionLoading}
      />

      {/* Driver detail modal */}
      {viewDriver && (
        <DriverDetailModal
          driver={viewDriver}
          onClose={() => setViewDriver(null)}
          onApprove={() => { setSelectedDriver(viewDriver); setActionType('approve') }}
          onReject={() => { setSelectedDriver(viewDriver); setActionType('reject') }}
          onSuspend={() => { setSelectedDriver(viewDriver); setActionType('suspend') }}
        />
      )}

      {/* Reject dialog (custom) */}
      {actionType === 'reject' && selectedDriver && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={() => { setSelectedDriver(null); setActionType(null) }} />
          <div style={{
            position: 'relative', background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '20px', padding: '28px', width: '90%', maxWidth: '480px'
          }}>
            <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Reject {selectedDriver.displayName}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Optionally add rejection reasons per document:
            </p>
            {['drivers_license', 'national_id', 'vehicle_registration', 'insurance', 'police_clearance'].map(doc => (
              <div key={doc} style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>
                  {doc.replace(/_/g, ' ')}
                </label>
                <input
                  placeholder="Reason (optional)"
                  value={rejectionReasons[doc] || ''}
                  onChange={e => setRejectionReasons(p => ({ ...p, [doc]: e.target.value }))}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: '8px',
                    background: 'var(--surface-alt)', border: '1px solid var(--border)',
                    color: 'var(--text-primary)', fontSize: '12px', outline: 'none'
                  }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => { setSelectedDriver(null); setActionType(null); setRejectionReasons({}) }}
                style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>
                Cancel
              </button>
              <button onClick={handleReject} disabled={actionLoading}
                style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>
                {actionLoading ? 'Rejecting...' : 'Reject Driver'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}