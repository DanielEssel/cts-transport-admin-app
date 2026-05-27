'use client'
import { useEffect, useState, useCallback } from 'react'
import { collection, getDocs, query, orderBy, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { StatusBadge, EmptyState, TableSkeleton } from '@/components/shared'
import { formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { Headphones, Search, Send, X, RefreshCw, MessageSquare } from 'lucide-react'

interface Ticket {
  id: string
  userId: string
  subject: string
  message: string
  category: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  priority: 'low' | 'medium' | 'high'
  userRole: 'passenger' | 'driver'
  createdAt: any
  adminReply?: string
  repliedAt?: any
}

type TicketFilter = 'all' | 'open' | 'in_progress' | 'resolved'

export default function SupportPage() {
  const [tickets, setTickets]       = useState<Ticket[]>([])
  const [filtered, setFiltered]     = useState<Ticket[]>([])
  const [loading, setLoading]       = useState(true)
  const [filter, setFilter]         = useState<TicketFilter>('open')
  const [search, setSearch]         = useState('')
  const [selected, setSelected]     = useState<Ticket | null>(null)
  const [reply, setReply]           = useState('')
  const [replying, setReplying]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'supportTickets'), orderBy('createdAt', 'desc')))
      setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Ticket[])
    } catch { toast.error('Failed to load tickets') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    let result = tickets
    if (filter !== 'all') result = result.filter(t => t.status === filter)
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(t =>
        t.subject?.toLowerCase().includes(q) ||
        t.message?.toLowerCase().includes(q) ||
        t.userId?.includes(q)
      )
    }
    setFiltered(result)
  }, [tickets, filter, search])

  const handleReply = async () => {
    if (!selected || !reply.trim()) return
    setReplying(true)
    try {
      await updateDoc(doc(db, 'supportTickets', selected.id), {
        adminReply: reply,
        status: 'resolved',
        repliedAt: serverTimestamp(),
      })
      toast.success('Reply sent and ticket resolved')
      setReply('')
      setSelected(null)
      load()
    } catch (e: any) { toast.error(e.message) }
    finally { setReplying(false) }
  }

  const handleStatusChange = async (ticket: Ticket, status: string) => {
    try {
      await updateDoc(doc(db, 'supportTickets', ticket.id), { status })
      toast.success(`Ticket marked as ${status}`)
      load()
    } catch (e: any) { toast.error(e.message) }
  }

  const priorityColor = (p: string) =>
    p === 'high' ? '#f87171' : p === 'medium' ? '#fbbf24' : '#94a3b8'

  const filters: { key: TicketFilter; label: string }[] = [
    { key: 'all',         label: `All (${tickets.length})` },
    { key: 'open',        label: `Open (${tickets.filter(t => t.status === 'open').length})` },
    { key: 'in_progress', label: `In Progress (${tickets.filter(t => t.status === 'in_progress').length})` },
    { key: 'resolved',    label: `Resolved (${tickets.filter(t => t.status === 'resolved').length})` },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>Support Tickets</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Manage driver and passenger support requests</p>
        </div>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 14px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>
          <RefreshCw size={14} />Refresh
        </button>
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
            placeholder="Search tickets..."
            style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '12px', width: '160px' }}
          />
        </div>
      </div>

      {loading ? <TableSkeleton rows={6} cols={5} /> : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <EmptyState icon={<Headphones size={24} />} title="No tickets found" description="All caught up!" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ background: 'var(--surface)' }}>
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>User</th>
                    <th>Role</th>
                    <th>Category</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(ticket => (
                    <tr key={ticket.id}>
                      <td>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
                          {ticket.subject || 'No subject'}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ticket.message}
                        </div>
                      </td>
                      <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}>
                        {ticket.userId?.slice(0, 10)}...
                      </td>
                      <td>
                        <span style={{
                          fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px',
                          background: ticket.userRole === 'driver' ? 'rgba(22,163,74,0.12)' : 'rgba(2,132,199,0.12)',
                          color: ticket.userRole === 'driver' ? '#4ade80' : '#60a5fa'
                        }}>{ticket.userRole || 'passenger'}</span>
                      </td>
                      <td style={{ fontSize: '12px', textTransform: 'capitalize' }}>{ticket.category || 'General'}</td>
                      <td>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: priorityColor(ticket.priority || 'low') }}>
                          {(ticket.priority || 'low').toUpperCase()}
                        </span>
                      </td>
                      <td><StatusBadge status={ticket.status} /></td>
                      <td style={{ fontSize: '11px' }}>{formatDate(ticket.createdAt)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => { setSelected(ticket); setReply(ticket.adminReply || '') }}
                            style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}>
                            Reply
                          </button>
                          {ticket.status === 'open' && (
                            <button onClick={() => handleStatusChange(ticket, 'in_progress')}
                              style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: 'rgba(251,191,36,0.12)', color: '#fbbf24', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}>
                              Start
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

      {/* Reply modal */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '20px', padding: '28px', width: '90%', maxWidth: '520px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.4)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Reply to Ticket
              </h3>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
                <X size={18} />
              </button>
            </div>

            {/* Original message */}
            <div style={{ background: 'var(--surface-alt)', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {selected.subject}
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {selected.message}
              </p>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '8px' }}>
                {formatDate(selected.createdAt)}
              </div>
            </div>

            {/* Reply input */}
            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>
              Your Reply
            </label>
            <textarea
              value={reply} onChange={e => setReply(e.target.value)}
              rows={5} placeholder="Type your response to the user..."
              style={{
                width: '100%', padding: '12px', borderRadius: '10px',
                background: 'var(--surface-alt)', border: '1px solid var(--border)',
                color: 'var(--text-primary)', fontSize: '13px', outline: 'none',
                resize: 'vertical', fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6,
                marginBottom: '16px'
              }}
            />

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setSelected(null)} style={{
                padding: '10px 18px', borderRadius: '8px', border: '1px solid var(--border)',
                background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px'
              }}>Cancel</button>
              <button onClick={handleReply} disabled={replying || !reply.trim()} style={{
                padding: '10px 20px', borderRadius: '8px', border: 'none',
                background: 'linear-gradient(135deg, #16a34a, #15803d)',
                color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: '6px',
                opacity: replying || !reply.trim() ? 0.7 : 1
              }}>
                <Send size={13} />
                {replying ? 'Sending...' : 'Send Reply & Resolve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
