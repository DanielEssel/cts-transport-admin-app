'use client'
import { useEffect, useState, useCallback } from 'react'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/lib/firebase'
import { Withdrawal } from '@/types'
import { StatusBadge, EmptyState, TableSkeleton, StatsCard } from '@/components/shared'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { Wallet, Search, RefreshCw, CheckCircle, XCircle, CreditCard, Download } from 'lucide-react'
import { exportToCSV } from '@/lib/export'
import { canResolvePayout, payoutStateLabel, MIN_EVIDENCE_LENGTH } from '@/lib/withdrawal-actions'

// The deployed payout path (initiateBridgePayout) sends each payout to Bridge
// as soon as the driver requests it, so this page never approves, rejects or
// sends money. Its one decision is recording a payout's result through the
// server function resolveUnconfirmedPayout, which checks that the caller is an
// active admin, verifies with Bridge, settles or refunds once with a ledger
// entry, and writes the audit record. Nothing on this page writes a
// withdrawal, a transaction or a balance directly, and nothing marks a payout
// paid or failed without Bridge evidence.
type FilterStatus = 'all' | 'pending' | 'processing' | 'completed' | 'rejected' | 'failed'
type ActionType = 'resolve'

export default function WithdrawalsPage() {
  const { admin } = useAuth()
  const isSuper = admin?.role === 'super_admin'
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [filtered, setFiltered] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterStatus>('pending')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Withdrawal | null>(null)
  const [actionType, setActionType] = useState<ActionType | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [resolveOutcome, setResolveOutcome] = useState<'paid' | 'failed'>('paid')
  const [evidence, setEvidence] = useState('')

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
      result = result.filter(w => (w.phoneNumber ?? w.phone)?.includes(q) || w.userId.includes(q) || (w.method ?? '').toLowerCase().includes(q))
    }
    setFiltered(result)
  }, [withdrawals, filter, search])

  const closeDialog = () => {
    setSelected(null); setActionType(null); setEvidence(''); setResolveOutcome('paid')
  }

  const handleAction = async () => {
    if (!selected || actionType !== 'resolve') return
    const withdrawalId = selected.id
    if (evidence.trim().length < MIN_EVIDENCE_LENGTH) {
      toast.error('Record the Bridge reference or support ticket before resolving.')
      return
    }
    setActionLoading(true)
    try {
      await httpsCallable(functions, 'resolveUnconfirmedPayout')({
        withdrawalId, outcome: resolveOutcome, evidence: evidence.trim(),
      })
      toast.success(resolveOutcome === 'paid' ? 'Payout confirmed as paid.' : 'Payout recorded as failed. The amount was returned.')
      closeDialog()
      load()
    } catch (e: any) {
      // The server explains what it refused (e.g. a payout still in progress,
      // an unknown outcome to confirm with Bridge first); show it as is.
      toast.error(e?.message ?? 'The request failed.')
      load()
    }
    finally { setActionLoading(false) }
  }

  const pending    = withdrawals.filter(w => w.status === 'pending')
  const paid       = withdrawals.filter(w => w.status === 'completed')
  const totalPending = pending.reduce((s, w) => s + w.amount, 0)
  const totalPaid    = paid.reduce((s, w) => s + w.amount, 0)

  const filterBtns: { key: FilterStatus; label: string }[] = [
    { key: 'all',      label: 'All' },
    { key: 'pending',    label: 'Pending' },
    { key: 'processing', label: 'Sent / to confirm' },
    { key: 'completed',  label: 'Paid' },
    { key: 'failed',     label: 'Failed' },
    { key: 'rejected',   label: 'Rejected' },
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
          icon={<Wallet size={16} />} iconColor="var(--tone-warning-fg)" iconBg="rgba(217,119,6,0.12)" />
        <StatsCard title="Pending Amount" value={formatCurrency(totalPending)}
          icon={<CreditCard size={16} />} iconColor="var(--tone-danger-fg)" iconBg="rgba(239,68,68,0.12)" />
        <StatsCard title="Total Paid Out" value={formatCurrency(totalPaid)}
          icon={<CheckCircle size={16} />} iconColor="var(--accent-text)" iconBg="rgba(22,163,74,0.12)" />
      </div>

      {/* Filters & Search */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {filterBtns.map(btn => (
          <button key={btn.key} onClick={() => setFilter(btn.key)} style={{
            padding: '7px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
            fontSize: '12px', fontWeight: 600,
            background: filter === btn.key ? 'var(--primary-dark)' : 'var(--surface-alt)',
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
                          color: w.role === 'driver' ? 'var(--accent-text)' : 'var(--tone-info-fg)'
                        }}>{w.role}</span>
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--tone-danger-fg)', fontSize: '14px' }}>
                        {formatCurrency(w.amount)}
                      </td>
                      <td style={{ fontSize: '12px', fontWeight: 600 }}>{w.method}</td>
                      <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>
                        {w.phoneNumber || w.phone || '—'}
                      </td>
                      <td>
                        <StatusBadge status={w.status} />
                        {payoutStateLabel(w) && (
                          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '3px' }}>{payoutStateLabel(w)}</div>
                        )}
                      </td>
                      <td style={{ fontSize: '11px' }}>{formatDate(w.createdAt)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {w.status === 'pending' && (
                            // Only the retired withdrawal endpoints created
                            // "pending" requests; nothing here can pay one.
                            <span title="Created by a retired withdrawal method; no payout was sent."
                              style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                              No action
                            </span>
                          )}
                          {canResolvePayout(w) && !isSuper && (
                            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                              Only a super admin can approve or resolve withdrawals.
                            </span>
                          )}
                          {canResolvePayout(w) && isSuper && (
                            <button onClick={() => { setSelected(w); setActionType('resolve') }}
                              style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: 'rgba(217,119,6,0.15)', color: 'var(--tone-warning-fg)', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}>
                              Confirm result
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

      {actionType === 'resolve' && selected && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={closeDialog} />
          <div style={{
            position: 'relative', background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '20px', padding: '28px', width: '90%', maxWidth: '440px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', gap: '14px'
          }}>
            <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Confirm the payout result
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {`Check this ${formatCurrency(selected.amount)} payout in the Bridge merchant portal first. ` +
                'Record the Bridge reference or support ticket as evidence; it is kept in the audit log.'}
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['paid', 'failed'] as const).map(o => (
                <button key={o} onClick={() => setResolveOutcome(o)} style={{
                  flex: 1, padding: '8px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700,
                  border: '1px solid var(--border)',
                  background: resolveOutcome === o ? (o === 'paid' ? 'var(--primary-dark)' : '#ef4444') : 'var(--surface-alt)',
                  color: resolveOutcome === o ? '#fff' : 'var(--text-secondary)',
                }}>
                  {o === 'paid' ? 'Bridge paid it' : 'Bridge did not pay'}
                </button>
              ))}
            </div>
            <textarea
              value={evidence}
              onChange={e => setEvidence(e.target.value)}
              placeholder="Bridge reference or support ticket (required)"
              maxLength={500}
              rows={3}
              style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', color: 'var(--text-primary)', fontSize: '13px', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={closeDialog} style={{
                padding: '9px 18px', borderRadius: '8px', border: '1px solid var(--border)',
                background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px', fontWeight: 600
              }}>Cancel</button>
              <button onClick={handleAction}
                disabled={actionLoading || evidence.trim().length < MIN_EVIDENCE_LENGTH}
                style={{
                  padding: '9px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#fff',
                  background: resolveOutcome === 'failed' ? '#ef4444' : 'var(--primary-dark)',
                  opacity: actionLoading || evidence.trim().length < MIN_EVIDENCE_LENGTH ? 0.5 : 1,
                }}>
                {actionLoading ? 'Working…' : 'Record result'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
