'use client'
import { useEffect, useState, useCallback } from 'react'
import { collection, getDocs, query, orderBy, doc, updateDoc, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Withdrawal } from '@/types'
import { StatusBadge, EmptyState, TableSkeleton, StatsCard, ConfirmDialog } from '@/components/shared'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { Wallet, Search, RefreshCw, CheckCircle, XCircle, CreditCard, Download } from 'lucide-react'
import { exportToCSV } from '@/lib/export'

type FilterStatus = 'all' | 'pending' | 'approved' | 'rejected' | 'paid'

export default function WithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [filtered, setFiltered] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterStatus>('pending')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Withdrawal | null>(null)
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'paid' | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'withdrawals'), orderBy('createdAt', 'desc')))
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Withdrawal[]
      setWithdrawals(data)
    } catch { toast.error('Failed to load withdrawals') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    let result = withdrawals
    if (filter !== 'all') result = result.filter(w => w.status === filter)
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(w => w.phoneNumber?.includes(q) || w.userId.includes(q) || w.method.toLowerCase().includes(q))
    }
    setFiltered(result)
  }, [withdrawals, filter, search])

  const handleAction = async () => {
    if (!selected || !actionType) return
    setActionLoading(true)
    try {
      const newStatus = actionType === 'approve' ? 'approved' : actionType === 'reject' ? 'rejected' : 'paid'
      await updateDoc(doc(db, 'withdrawals', selected.id), { status: newStatus, processedAt: new Date() })
      // If paid — also update transaction record
      if (actionType === 'paid' && selected.txId) {
        await updateDoc(doc(db, 'transactions', selected.txId), { status: 'completed' })
      }
      toast.success(`Withdrawal ${newStatus}`)
      setSelected(null); setActionType(null)
      load()
    } catch (e: any) { toast.error(e.message) }
    finally { setActionLoading(false) }
  }

  const pending    = withdrawals.filter(w => w.status === 'pending')
  const paid       = withdrawals.filter(w => w.status === 'paid')
  const totalPending = pending.reduce((s, w) => s + w.amount, 0)
  const totalPaid    = paid.reduce((s, w) => s + w.amount, 0)

  const filterBtns: { key: FilterStatus; label: string }[] = [
    { key: 'all',      label: 'All' },
    { key: 'pending',  label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'paid',     label: 'Paid' },
    { key: 'rejected', label: 'Rejected' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>Withdrawals</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Manage driver and passenger payout requests</p>
        </div>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 14px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>
          <RefreshCw size={14} />Refresh
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        <StatsCard title="Pending Requests" value={pending.length}
          icon={<Wallet size={16} />} iconColor="#fbbf24" iconBg="rgba(217,119,6,0.12)" />
        <StatsCard title="Pending Amount" value={formatCurrency(totalPending)}
          icon={<CreditCard size={16} />} iconColor="#f87171" iconBg="rgba(239,68,68,0.12)" />
        <StatsCard title="Total Paid Out" value={formatCurrency(totalPaid)}
          icon={<CheckCircle size={16} />} iconColor="#4ade80" iconBg="rgba(22,163,74,0.12)" />
      </div>

      {/* Filters & Search */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {filterBtns.map(btn => (
          <button key={btn.key} onClick={() => setFilter(btn.key)} style={{
            padding: '7px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
            fontSize: '12px', fontWeight: 600,
            background: filter === btn.key ? '#16a34a' : 'var(--surface-alt)',
            color: filter === btn.key ? '#fff' : 'var(--text-secondary)',
          }}>
            {btn.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 12px' }}>
          <Search size={13} style={{ color: 'var(--text-tertiary)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by phone or method..."
            style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '12px', width: '200px' }}
          />
        </div>
      </div>

      {/* Table */}
      {loading ? <TableSkeleton rows={8} cols={6} /> : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <EmptyState icon={<Wallet size={24} />} title="No withdrawals found" description="Try changing the filter" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ background: 'var(--surface)' }}>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Mobile Number</th>
                    <th>Status</th>
                    <th>Requested</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(w => (
                    <tr key={w.id}>
                      <td style={{ fontSize: '12px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-secondary)' }}>
                        {w.userId.slice(0, 10)}...
                      </td>
                      <td>
                        <span style={{
                          padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                          background: w.role === 'driver' ? 'rgba(22,163,74,0.12)' : 'rgba(2,132,199,0.12)',
                          color: w.role === 'driver' ? '#4ade80' : '#60a5fa'
                        }}>{w.role}</span>
                      </td>
                      <td style={{ fontWeight: 700, color: '#f87171', fontSize: '14px' }}>
                        {formatCurrency(w.amount)}
                      </td>
                      <td style={{ fontSize: '12px', fontWeight: 600 }}>{w.method}</td>
                      <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>
                        {w.phoneNumber || '—'}
                      </td>
                      <td><StatusBadge status={w.status} /></td>
                      <td style={{ fontSize: '11px' }}>{formatDate(w.createdAt)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {w.status === 'pending' && (
                            <>
                              <button onClick={() => { setSelected(w); setActionType('approve') }}
                                style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: 'rgba(22,163,74,0.15)', color: '#4ade80', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}>
                                Approve
                              </button>
                              <button onClick={() => { setSelected(w); setActionType('reject') }}
                                style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: 'rgba(239,68,68,0.12)', color: '#f87171', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}>
                                Reject
                              </button>
                            </>
                          )}
                          {w.status === 'approved' && (
                            <button onClick={() => { setSelected(w); setActionType('paid') }}
                              style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: 'rgba(22,163,74,0.15)', color: '#4ade80', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}>
                              Mark Paid
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

      <ConfirmDialog
        open={!!actionType && !!selected}
        title={actionType === 'approve' ? 'Approve Withdrawal?' : actionType === 'reject' ? 'Reject Withdrawal?' : 'Mark as Paid?'}
        description={
          actionType === 'approve'
            ? `Approve ${formatCurrency(selected?.amount || 0)} withdrawal to ${selected?.phoneNumber}?`
            : actionType === 'reject'
            ? `Reject this withdrawal request? The amount will be returned.`
            : `Confirm that ${formatCurrency(selected?.amount || 0)} has been sent to ${selected?.phoneNumber}?`
        }
        confirmLabel={actionType === 'approve' ? 'Approve' : actionType === 'reject' ? 'Reject' : 'Mark as Paid'}
        confirmColor={actionType === 'reject' ? '#ef4444' : '#16a34a'}
        onConfirm={handleAction}
        onCancel={() => { setSelected(null); setActionType(null) }}
        loading={actionLoading}
      />
    </div>
  )
}
