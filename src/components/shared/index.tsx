'use client'
import { ReactNode } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

// ── Stats Card ────────────────────────────────────────────────────────────────
interface StatsCardProps {
  title: string
  value: string | number
  icon: ReactNode
  iconColor?: string
  iconBg?: string
  trend?: { value: number; label: string }
  loading?: boolean
}

export function StatsCard({ title, value, icon, iconColor = '#16a34a', iconBg = '#dcfce7', trend, loading }: StatsCardProps) {
  if (loading) return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px' }}>
      <div className="skeleton" style={{ height: '14px', width: '60%', marginBottom: '12px' }} />
      <div className="skeleton" style={{ height: '32px', width: '40%', marginBottom: '8px' }} />
      <div className="skeleton" style={{ height: '12px', width: '50%' }} />
    </div>
  )

  return (
    <div className="stat-card" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>{title}</span>
        <div style={{
          width: '36px', height: '36px', borderRadius: '10px',
          background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: iconColor
        }}>
          {icon}
        </div>
      </div>
      <div style={{
        fontFamily: "'Syne', sans-serif",
        fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)',
        letterSpacing: '-0.5px', lineHeight: 1, marginBottom: '8px'
      }}>
        {value}
      </div>
      {trend && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {trend.value >= 0
            ? <TrendingUp size={12} style={{ color: '#4ade80' }} />
            : <TrendingDown size={12} style={{ color: '#ef4444' }} />
          }
          <span style={{
            fontSize: '11px', fontWeight: 600,
            color: trend.value >= 0 ? '#4ade80' : '#ef4444'
          }}>
            {trend.value >= 0 ? '+' : ''}{trend.value}%
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{trend.label}</span>
        </div>
      )}
    </div>
  )
}

// ── Status Badge ──────────────────────────────────────────────────────────────
const statusConfig: Record<string, { bg: string; color: string; label: string }> = {
  // Trips
  searching:              { bg: '#1e3a5f', color: '#60a5fa', label: 'Searching' },
  tripAccepted:           { bg: '#1e3a2a', color: '#4ade80', label: 'Accepted' },
  driverArrived:          { bg: '#2a2a1e', color: '#facc15', label: 'Arrived' },
  tripStarted:            { bg: '#1e2a3a', color: '#60a5fa', label: 'In Progress' },
  inProgress:             { bg: '#1e2a3a', color: '#60a5fa', label: 'In Progress' },
  completed:              { bg: '#1a3a1a', color: '#4ade80', label: 'Completed' },
  delivered:              { bg: '#1a3a1a', color: '#4ade80', label: 'Delivered' },
  cancelledByDriver:      { bg: '#3a1a1a', color: '#f87171', label: 'Cancelled' },
  cancelledByPassenger:   { bg: '#3a1a1a', color: '#f87171', label: 'Cancelled' },
  cancelled:              { bg: '#3a1a1a', color: '#f87171', label: 'Cancelled' },
  // Drivers
  approved:               { bg: '#1a3a1a', color: '#4ade80', label: 'Approved' },
  pending:                { bg: '#2a2a1e', color: '#facc15', label: 'Pending' },
  pendingApproval:        { bg: '#2a2a1e', color: '#facc15', label: 'Pending' },
  suspended:              { bg: '#3a1a1a', color: '#f87171', label: 'Suspended' },
  rejected:               { bg: '#3a1a1a', color: '#f87171', label: 'Rejected' },
  // Withdrawals
  paid:                   { bg: '#1a3a1a', color: '#4ade80', label: 'Paid' },
  // Online
  online:                 { bg: '#1a3a1a', color: '#4ade80', label: 'Online' },
  offline:                { bg: 'var(--border)', color: 'var(--text-secondary)', label: 'Offline' },
  // Gas
  pendingReview:          { bg: '#2a2a1e', color: '#facc15', label: 'Pending Review' },
  driverAssigned:         { bg: '#1e3a5f', color: '#60a5fa', label: 'Driver Assigned' },
  driverEnRoute:          { bg: '#1e2a3a', color: '#60a5fa', label: 'En Route' },
}

export function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] || { bg: 'var(--border)', color: 'var(--text-secondary)', label: status }
  return (
    <span style={{
      padding: '3px 10px', borderRadius: '20px',
      fontSize: '11px', fontWeight: 700,
      background: cfg.bg, color: cfg.color,
      letterSpacing: '0.02em', display: 'inline-block', whiteSpace: 'nowrap'
    }}>
      {cfg.label}
    </span>
  )
}

// ── Empty State ───────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, description }: {
  icon: ReactNode; title: string; description?: string
}) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-tertiary)' }}>
      <div style={{
        width: '56px', height: '56px', borderRadius: '16px',
        background: 'var(--surface-alt)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', margin: '0 auto 16px', color: 'var(--text-tertiary)'
      }}>
        {icon}
      </div>
      <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>{title}</h3>
      {description && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>{description}</p>}
    </div>
  )
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────
export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ overflow: 'hidden', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--surface)' }}>
      <div style={{ padding: '14px 16px', background: 'var(--surface-alt)', borderBottom: '1px solid var(--border)', display: 'flex', gap: '12px' }}>
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: '12px', width: `${60 + i * 20}px` }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ padding: '14px 16px', borderBottom: r < rows - 1 ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="skeleton" style={{ width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0 }} />
          {Array.from({ length: cols - 1 }).map((_, c) => (
            <div key={c} className="skeleton" style={{ height: '12px', width: `${80 + c * 15}px` }} />
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Avatar ────────────────────────────────────────────────────────────────────
const avatarColors = ['#16a34a','#0284c7','#7c3aed','#db2777','#d97706','#0891b2']

export function Avatar({ name, photoUrl, size = 32 }: { name: string; photoUrl?: string; size?: number }) {
  const initials = name.trim().split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
  const colorIdx = name.charCodeAt(0) % avatarColors.length
  const color = avatarColors[colorIdx]

  if (photoUrl) return (
    <img src={photoUrl} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  )
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700, color: '#fff', flexShrink: 0
    }}>
      {initials || '?'}
    </div>
  )
}

// ── Confirm Dialog ────────────────────────────────────────────────────────────
export function ConfirmDialog({
  open, title, description, confirmLabel = 'Confirm',
  confirmColor = '#ef4444', onConfirm, onCancel, loading
}: {
  open: boolean; title: string; description: string;
  confirmLabel?: string; confirmColor?: string;
  onConfirm: () => void; onCancel: () => void; loading?: boolean
}) {
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={onCancel} />
      <div style={{
        position: 'relative', background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '20px', padding: '28px', width: '90%', maxWidth: '400px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)'
      }}>
        <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>{title}</h3>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: 1.6 }}>{description}</p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '9px 18px', borderRadius: '8px', border: '1px solid var(--border)',
            background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px', fontWeight: 600
          }}>Cancel</button>
          <button onClick={onConfirm} disabled={loading} style={{
            padding: '9px 18px', borderRadius: '8px', border: 'none',
            background: confirmColor, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '13px', fontWeight: 700, opacity: loading ? 0.7 : 1
          }}>
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
