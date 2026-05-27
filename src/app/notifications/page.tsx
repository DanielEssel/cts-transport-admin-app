'use client'
import { useState } from 'react'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/lib/firebase'
import { toast } from 'sonner'
import { Bell, Send, Users, UserCheck, User, CheckCircle } from 'lucide-react'

type Target = 'all_passengers' | 'all_drivers' | 'specific_user'

export default function NotificationsPage() {
  const [title, setTitle]     = useState('')
  const [message, setMessage] = useState('')
  const [target, setTarget]   = useState<Target>('all_passengers')
  const [userId, setUserId]   = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult]   = useState<{ sent: number; failed: number } | null>(null)

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title || !message) { toast.error('Title and message required'); return }
    if (target === 'specific_user' && !userId) { toast.error('User ID required'); return }

    setSending(true)
    setResult(null)
    try {
      const broadcast = httpsCallable(functions, 'broadcastNotification')
      const res = await broadcast({ title, message, target, userId }) as any
      const data = res.data

      if (data.success) {
        toast.success(`Sent to ${data.sent} device${data.sent !== 1 ? 's' : ''}`)
        setResult({ sent: data.sent, failed: data.failed })
        setTitle(''); setMessage('')
      } else {
        toast.error(data.message || 'No devices found')
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  const targetOptions = [
    { key: 'all_passengers' as Target, icon: <Users size={16} />,     label: 'All Passengers', desc: 'Send to all registered passengers' },
    { key: 'all_drivers'   as Target, icon: <UserCheck size={16} />,  label: 'All Drivers',    desc: 'Send to all registered drivers' },
    { key: 'specific_user' as Target, icon: <User size={16} />,       label: 'Specific User',  desc: 'Send to one user by UID' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '680px' }}>
      <div>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>Broadcast Notifications</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Send push notifications to passengers and drivers</p>
      </div>

      <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Target */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '12px' }}>Send To</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {targetOptions.map(opt => (
              <button key={opt.key} type="button" onClick={() => setTarget(opt.key)} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                background: target === opt.key ? 'rgba(22,163,74,0.12)' : 'var(--surface-alt)',
                outline: target === opt.key ? '1px solid #16a34a' : '1px solid transparent',
                textAlign: 'left'
              }}>
                <div style={{ color: target === opt.key ? '#4ade80' : 'var(--text-tertiary)' }}>{opt.icon}</div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: target === opt.key ? '#4ade80' : 'var(--text-primary)' }}>{opt.label}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{opt.desc}</div>
                </div>
                {target === opt.key && (
                  <div style={{ marginLeft: 'auto', width: '16px', height: '16px', borderRadius: '50%', background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff' }} />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* User ID */}
        {target === 'specific_user' && (
          <div>
            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>User / Driver UID</label>
            <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="Firebase UID..."
              style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none', fontFamily: "'JetBrains Mono', monospace" }}
            />
          </div>
        )}

        {/* Message */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Important Update from CTSRide"
              style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '14px', outline: 'none' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>Message</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} placeholder="Your notification message..."
              style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6 }}
            />
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{message.length} characters</div>
          </div>
        </div>

        {/* Preview */}
        {(title || message) && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px' }}>
            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '12px' }}>Preview</label>
            <div style={{ background: 'var(--surface-alt)', borderRadius: '12px', padding: '14px 16px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #16a34a, #15803d)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Bell size={16} style={{ color: '#fff' }} />
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '3px' }}>{title || 'Title'}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{message || 'Message...'}</div>
              </div>
            </div>
          </div>
        )}

        {/* Result */}
        {result && (
          <div style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)', borderRadius: '12px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CheckCircle size={18} style={{ color: '#4ade80' }} />
            <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
              <strong style={{ color: '#4ade80' }}>{result.sent}</strong> notifications delivered
              {result.failed > 0 && <span style={{ color: '#f87171', marginLeft: '8px' }}>{result.failed} failed</span>}
            </div>
          </div>
        )}

        <button type="submit" disabled={sending} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          padding: '14px', borderRadius: '12px', border: 'none',
          cursor: sending ? 'not-allowed' : 'pointer',
          background: 'linear-gradient(135deg, #16a34a, #15803d)',
          color: '#fff', fontWeight: 700, fontSize: '14px',
          boxShadow: '0 4px 16px rgba(22,163,74,0.3)',
          opacity: sending ? 0.8 : 1
        }}>
          <Send size={16} />
          {sending ? 'Sending...' : 'Send Notification'}
        </button>
      </form>
    </div>
  )
}
