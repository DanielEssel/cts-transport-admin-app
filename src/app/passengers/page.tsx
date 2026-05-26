'use client'
import { useEffect, useState, useCallback } from 'react'
import { collection, getDocs, query, orderBy, doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Passenger } from '@/types'
import { Avatar, EmptyState, TableSkeleton } from '@/components/shared'
import { formatDateShort } from '@/lib/utils'
import { Users, Search, Eye } from 'lucide-react'
import { PassengerDetailModal } from '@/components/features/PassengerDetailModal'

type PassengerRow = Passenger & { walletBalance?: number; tripCount?: number }

export default function PassengersPage() {
  const [passengers, setPassengers] = useState<PassengerRow[]>([])
  const [filtered, setFiltered] = useState<PassengerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [viewPassenger, setViewPassenger] = useState<PassengerRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')))
      const data = await Promise.all(snap.docs.map(async d => {
        const user = { uid: d.id, ...d.data() } as Passenger
        try {
          const walletDoc = await getDoc(doc(db, 'wallets', d.id))
          return {
            ...user,
            walletBalance: walletDoc.exists() ? walletDoc.data().balance : 0,
          }
        } catch {
          return { ...user, walletBalance: 0 }
        }
      }))
      setPassengers(data)
    } catch (e) { console.error(e) }
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
                      <td style={{ fontWeight: 700, color: '#4ade80', fontSize: '13px' }}>
                        GH₵ {(p.walletBalance || 0).toFixed(2)}
                      </td>
                      <td style={{ fontSize: '11px' }}>{formatDateShort(p.createdAt)}</td>
                      <td>
                        <button onClick={() => setViewPassenger(p)}
                          style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: 'rgba(99,102,241,0.12)', color: '#818cf8', cursor: 'pointer', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Eye size={11} />View
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

      {viewPassenger && (
        <PassengerDetailModal
          passenger={viewPassenger}
          onClose={() => setViewPassenger(null)}
        />
      )}
    </div>
  )
}