'use client'
import { useEffect, useState } from 'react'
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// ── Money model ──────────────────────────────────────────────────────────────
// Passengers only top up; drivers only withdraw; Bridge serves only these apps.
// So money held in Bridge = passenger wallet balances + driver wallet balances
//   + platform commission earned but not yet withdrawn.
// Every cedi is owned by a passenger, a driver, or the company.

interface Totals {
  passengerHeld: number
  driverHeld: number
  platformEarned: number
  totalWithdrawn: number
  pendingTotal: number
}

interface Withdrawal {
  id: string
  userId: string
  userName: string
  role: string
  amount: number
  status: string
  createdAt?: { seconds: number }
}

const GHS = (n: number) =>
  'GH₵' + (n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (ts?: { seconds: number }) =>
  ts ? new Date(ts.seconds * 1000).toLocaleString('en-GH', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }) : '—'

export default function LedgerPage() {
  const [totals, setTotals] = useState<Totals | null>(null)
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(false)
    try {
      // Read the collections we need to sum. For launch volume (hundreds of
      // users) reading-and-summing is fine; at scale, maintain running totals
      // via Cloud Functions.
      const [walletsSnap, driversSnap, ledgerSnap, wdSnap] = await Promise.all([
        getDocs(collection(db, 'wallets')),
        getDocs(collection(db, 'drivers')),
        getDocs(collection(db, 'ledger')),
        getDocs(query(collection(db, 'withdrawals'), orderBy('createdAt', 'desc'), limit(100))),
      ])

      const passengerHeld = walletsSnap.docs.reduce(
        (s, d) => s + (d.data().balance || 0), 0)

      const driverHeld = driversSnap.docs.reduce(
        (s, d) => s + (d.data().walletBalance || 0), 0)

      // Platform commission = sum of platformFee across all ledger entries.
      // Fee is 0 on holds/top-ups and non-zero only on the driver-release
      // (settlement) entry, so summing never double-counts.
      const platformEarned = ledgerSnap.docs.reduce(
        (s, d) => s + (d.data().platformFee || 0), 0)

      const wds = wdSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Withdrawal[]

      const totalWithdrawn = wds
        .filter(w => w.status === 'completed')
        .reduce((s, w) => s + (w.amount || 0), 0)

      const pendingTotal = wds
        .filter(w => w.status === 'pending')
        .reduce((s, w) => s + (w.amount || 0), 0)

      setTotals({ passengerHeld, driverHeld, platformEarned, totalWithdrawn, pendingTotal })
      setWithdrawals(wds)
    } catch (e) {
      console.error('Ledger load failed:', e)
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const totalHeld = totals
    ? totals.passengerHeld + totals.driverHeld + totals.platformEarned
    : 0

  const pending = withdrawals.filter(w => w.status === 'pending')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1000px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>
            Financial Ledger
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
            Money held in the system, by owner, with withdrawal history
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{
            marginLeft: 'auto', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border)',
            background: 'var(--surface-alt)', color: 'var(--text-secondary)', fontSize: '13px',
            fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: '13px' }}>
          Could not load ledger data. Check your connection and try Refresh.
        </div>
      )}

      {loading && !totals ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '14px' }}>
          Loading ledger…
        </div>
      ) : totals && (
        <>
          {/* Total held — hero */}
          <div style={{
            background: 'linear-gradient(135deg, #16a34a, #15803d)', borderRadius: '18px',
            padding: '24px', color: '#fff',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 600, opacity: 0.85, marginBottom: '6px' }}>
              Total Money Held in Bridge Account (derived)
            </div>
            <div style={{ fontSize: '34px', fontWeight: 800, fontFamily: "'Syne', sans-serif" }}>
              {GHS(totalHeld)}
            </div>
            <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '6px' }}>
              Passengers + Drivers + Platform commission
            </div>
          </div>

          {/* Breakdown — who owns the money */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
            <OwnerCard label="Passenger Wallets" value={GHS(totals.passengerHeld)} hint="Topped up, not yet spent" color="#0284c7" />
            <OwnerCard label="Driver Wallets" value={GHS(totals.driverHeld)} hint="Earned, not yet withdrawn" color="#16a34a" />
            <OwnerCard label="Platform Commission" value={GHS(totals.platformEarned)} hint="CTS earnings to date" color="#d97706" />
          </div>

          {/* Flows */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
            <FlowCard label="Total Withdrawn" value={GHS(totals.totalWithdrawn)} hint="Completed driver payouts" />
            <FlowCard label="Pending Payouts" value={GHS(totals.pendingTotal)} hint={`${pending.length} awaiting`} warn={pending.length > 0} />
          </div>

          {/* Pending withdrawals — highlighted */}
          {pending.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid rgba(251,191,36,0.4)', borderRadius: '14px', overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fbbf24' }} />
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Pending Withdrawals ({pending.length})
                </span>
              </div>
              {pending.map(w => (
                <div key={w.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{w.userName || w.userId}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{fmtDate(w.createdAt)} · {w.role}</div>
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#fbbf24' }}>{GHS(w.amount)}</div>
                </div>
              ))}
            </div>
          )}

          {/* Withdrawal history */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Withdrawal History
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginLeft: '8px' }}>
                (last {withdrawals.length})
              </span>
            </div>
            {withdrawals.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', fontSize: '13px', color: 'var(--text-tertiary)' }}>
                No withdrawals yet
              </div>
            ) : (
              <div style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: '11px', textTransform: 'uppercase' }}>
                      <th style={{ padding: '10px 16px', fontWeight: 600 }}>Driver</th>
                      <th style={{ padding: '10px 16px', fontWeight: 600 }}>Amount</th>
                      <th style={{ padding: '10px 16px', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '10px 16px', fontWeight: 600 }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withdrawals.map(w => (
                      <tr key={w.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 16px', color: 'var(--text-primary)', fontWeight: 500 }}>
                          {w.userName || w.userId}
                        </td>
                        <td style={{ padding: '10px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>
                          {GHS(w.amount)}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <StatusChip status={w.status} />
                        </td>
                        <td style={{ padding: '10px 16px', color: 'var(--text-tertiary)' }}>
                          {fmtDate(w.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
            &ldquo;Derived&rdquo; means computed from wallet balances and the commission ledger, not read directly
            from the Bridge merchant account. It should track the real Bridge balance closely; a persistent gap
            indicates an unrecorded transaction worth investigating.
          </p>
        </>
      )}
    </div>
  )
}

function OwnerCard({ label, value, hint, color }: { label: string; value: string; hint: string; color: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: "'Syne', sans-serif" }}>{value}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{hint}</div>
    </div>
  )
}

function FlowCard({ label, value, hint, warn }: { label: string; value: string; hint: string; warn?: boolean }) {
  return (
    <div style={{ background: 'var(--surface)', border: `1px solid ${warn ? 'rgba(251,191,36,0.4)' : 'var(--border)'}`, borderRadius: '14px', padding: '18px' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 800, color: warn ? '#fbbf24' : 'var(--text-primary)', fontFamily: "'Syne', sans-serif" }}>{value}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{hint}</div>
    </div>
  )
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    completed: { bg: 'rgba(22,163,74,0.12)', fg: '#4ade80', label: 'Completed' },
    pending:   { bg: 'rgba(251,191,36,0.12)', fg: '#fbbf24', label: 'Pending' },
    failed:    { bg: 'rgba(239,68,68,0.12)',  fg: '#f87171', label: 'Failed' },
  }
  const s = map[status] || { bg: 'var(--surface-alt)', fg: 'var(--text-tertiary)', label: status }
  return (
    <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '5px', background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  )
}