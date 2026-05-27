'use client'
import { useEffect, useState, useCallback } from 'react'
import { collection, getDocs, query, orderBy, doc, getDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Avatar, EmptyState, TableSkeleton } from '@/components/shared'
import { formatDateShort, formatCurrency } from '@/lib/utils'
import { Users, Search, Wallet, Plus, Minus, X } from 'lucide-react'
import { toast } from 'sonner'

interface Passenger {
  uid: string
  firstName?: string
  lastName?: string
  displayName?: string
  phoneNumber?: string
  email?: string
  photoURL?: string
  createdAt?: any
  walletBalance?: number
}

export default function PassengersPage() {
  const [passengers, setPassengers]   = useState<Passenger[]>([])
  const [filtered, setFiltered]       = useState<Passenger[]>([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [walletModal, setWalletModal] = useState<Passenger | null>(null)
  const [walletAction, setWalletAction] = useState<'topup' | 'deduct'>('topup')
  const [walletAmount, setWalletAmount] = useState('')
  const [walletReason, setWalletReason] = useState('')
  const [walletLoading, setWalletLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')))
      const data = await Promise.all(snap.docs.map(async d => {
        const user = { uid: d.id, ...d.data() } as Passenger
        try {
          const walletDoc = await getDoc(doc(db, 'wallets', d.id))
          return { ...user, walletBalance: walletDoc.exists() ? walletDoc.data().balance : 0 }
        } catch { return { ...user, walletBalance: 0 } }
      }))
      setPassengers(data)
    } catch { toast.error('Failed to load passengers') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!search) { setFiltered(passengers); return }
    const q = search.toLowerCase()
    setFiltered(passengers.filter(p =>
      p.firstName?.toLowerCase().includes(q) ||
      p.lastName?.toLowerCase().includes(q) ||
      p.displayName?.toLowerCase().includes(q) ||
      p.phoneNumber?.includes(q) ||
      p.email?.toLowerCase().includes(q)
    ))
  }, [search, passengers])

  const handleWalletAction = async () => {
    if (!walletModal || !walletAmount) return
    const amount = parseFloat(walletAmount)
    if (isNaN(amount) || amount <= 0) { toast.error('Enter a valid amount'); return }

    setWalletLoading(true)
    try {
      const walletRef = doc(db, 'wallets', walletModal.uid)
      const walletDoc = await getDoc(walletRef)
      const currentBalance = walletDoc.exists() ? walletDoc.data().balance : 0

      if (walletAction === 'deduct' && amount > currentBalance) {
        toast.error('Amount exceeds wallet balance'); return
      }

      const newBalance = walletAction === 'topup'
        ? currentBalance + amount
        : currentBalance - amount

      if (walletDoc.exists()) {
        await updateDoc(walletRef, { balance: newBalance, updatedAt: serverTimestamp() })
      } else {
        await addDoc(collection(db, 'wallets'), { userId: walletModal.uid, balance: newBalance, currency: 'GHS', createdAt: serverTimestamp() })
      }

      // Log transaction
      await addDoc(collection(db, 'transactions'), {
        userId:      walletModal.uid,
        type:        walletAction === 'topup' ? 'credit' : 'debit',
        amount,
        currency:    'GHS',
        description: walletReason || (walletAction === 'topup' ? 'Admin top-up' : 'Admin deduction'),
        source:      'admin',
        status:      'completed',
        createdAt:   serverTimestamp(),
      })

      toast.success(`Wallet ${walletAction === 'topup' ? 'topped up' : 'deducted'} successfully`)
      setWalletModal(null)
      setWalletAmount('')
      setWalletReason('')
      load()
    } catch (e: any) { toast.error(e.message) }
    finally { setWalletLoading(false) }
  }

  const displayName = (p: Passenger) =>
    p.displayName || [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Unknown'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>Passengers</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>{passengers.length} registered passengers</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 14px' }}>
          <Search size={13} style={{ color: 'var(--text-tertiary)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search passengers..."
            style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '13px', width: '200px' }}
          />
        </div>
      </div>

      {loading ? <TableSkeleton rows={8} cols={5} /> : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <EmptyState icon={<Users size={24} />} title="No passengers found" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ background: 'var(--surface)' }}>
                <thead>
                  <tr>
                    <th>Passenger</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Wallet Balance</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.uid}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Avatar name={displayName(p)} photoUrl={p.photoURL} size={32} />
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{displayName(p)}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: "'JetBrains Mono', monospace" }}>{p.uid.slice(0, 10)}...</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>{p.phoneNumber || '—'}</td>
                      <td style={{ fontSize: '12px' }}>{p.email || '—'}</td>
                      <td>
                        <span style={{ fontWeight: 700, color: '#4ade80', fontSize: '13px' }}>
                          {formatCurrency(p.walletBalance || 0)}
                        </span>
                      </td>
                      <td style={{ fontSize: '11px' }}>{formatDateShort(p.createdAt)}</td>
                      <td>
                        <button onClick={() => { setWalletModal(p); setWalletAction('topup') }}
                          style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: 'rgba(22,163,74,0.12)', color: '#4ade80', cursor: 'pointer', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Wallet size={11} /> Wallet
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

      {/* Wallet modal */}
      {walletModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '20px', padding: '28px', width: '90%', maxWidth: '400px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Manage Wallet
              </h3>
              <button onClick={() => setWalletModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
                <X size={18} />
              </button>
            </div>

            {/* Current balance */}
            <div style={{ background: 'var(--surface-alt)', borderRadius: '12px', padding: '14px', marginBottom: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Current Balance</div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#4ade80', fontFamily: "'Syne', sans-serif" }}>
                {formatCurrency(walletModal.walletBalance || 0)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{displayName(walletModal)}</div>
            </div>

            {/* Action toggle */}
            <div style={{ display: 'flex', background: 'var(--surface-alt)', borderRadius: '10px', padding: '4px', marginBottom: '16px' }}>
              {(['topup', 'deduct'] as const).map(action => (
                <button key={action} onClick={() => setWalletAction(action)} style={{
                  flex: 1, padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  fontSize: '13px', fontWeight: 700,
                  background: walletAction === action
                    ? (action === 'topup' ? '#16a34a' : '#ef4444')
                    : 'transparent',
                  color: walletAction === action ? '#fff' : 'var(--text-secondary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                }}>
                  {action === 'topup' ? <Plus size={13} /> : <Minus size={13} />}
                  {action === 'topup' ? 'Top Up' : 'Deduct'}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>Amount (GHS)</label>
                <input type="number" value={walletAmount} onChange={e => setWalletAmount(e.target.value)}
                  placeholder="0.00" min="0.01" step="0.01"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '16px', fontWeight: 700, outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>Reason</label>
                <input value={walletReason} onChange={e => setWalletReason(e.target.value)}
                  placeholder="e.g. Refund for cancelled trip"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => setWalletModal(null)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
              <button onClick={handleWalletAction} disabled={walletLoading || !walletAmount} style={{
                flex: 1, padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 700,
                background: walletAction === 'topup' ? 'linear-gradient(135deg, #16a34a, #15803d)' : '#ef4444',
                color: '#fff', opacity: walletLoading || !walletAmount ? 0.7 : 1
              }}>
                {walletLoading ? 'Processing...' : walletAction === 'topup' ? 'Top Up' : 'Deduct'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
