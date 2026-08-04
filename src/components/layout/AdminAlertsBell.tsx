'use client'
import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where, orderBy, limit, doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useRouter } from 'next/navigation'

interface Alert {
  id: string
  type: string
  driverId: string
  driverName: string
  message: string
  read: boolean
  createdAt?: { seconds: number }
}

export function AdminAlertsBell() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [open, setOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const q = query(
      collection(db, 'admin_alerts'),
      where('read', '==', false),
      orderBy('createdAt', 'desc'),
      limit(20)
    )
    return onSnapshot(q, snap => {
      setAlerts(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Alert[])
    })
  }, [])

  const openAlert = async (a: Alert) => {
    await updateDoc(doc(db, 'admin_alerts', a.id), { read: true })
    setOpen(false)
    router.push(`/drivers?highlight=${a.driverId}`)
  }

  const count = alerts.length

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ position: 'relative', background: 'var(--surface-alt)', border: '1px solid #1e293b', borderRadius: '8px', padding: '8px', cursor: 'pointer', color: 'var(--text-secondary)', lineHeight: 0 }}
      >
        🔔
        {count > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            background: '#ef4444', color: '#fff',
            fontSize: '10px', fontWeight: 700,
            minWidth: '16px', height: '16px', borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px',
          }}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '44px',
          width: '320px', maxHeight: '400px', overflow: 'auto',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)', zIndex: 100,
        }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
            Pending Reviews ({count})
          </div>
          {count === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--text-tertiary)' }}>
              All caught up
            </div>
          ) : (
            alerts.map(a => (
              <div
                key={a.id}
                onClick={() => openAlert(a)}
                style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: '12px' }}
              >
                <div style={{ fontWeight: 600, marginBottom: '2px', color: 'var(--text-primary)' }}>{a.driverName}</div>
                <div style={{ color: 'var(--text-tertiary)' }}>{a.message}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
