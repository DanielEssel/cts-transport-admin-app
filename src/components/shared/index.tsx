'use client'
import { ReactNode } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

// ── Stats Card (KPI) ──────────────────────────────────────────────────────────
interface StatsCardProps {
  title: string
  value: string | number
  icon: ReactNode
  iconColor?: string
  iconBg?: string
  /** A real comparison only; never a placeholder figure. */
  trend?: { value: number; label: string }
  /** A short qualifier under the value, e.g. "last 7 days". */
  hint?: string
  loading?: boolean
}

export function StatsCard({ title, value, icon, iconColor = 'var(--accent-text)', iconBg = 'var(--primary-dim)', trend, hint, loading }: StatsCardProps) {
  if (loading) return (
    <div className="stat-card" aria-busy="true">
      <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
        <div className="skeleton" style={{ width: '44px', height: '44px', borderRadius: '12px' }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: '12px', width: '60%', marginBottom: '10px' }} />
          <div className="skeleton" style={{ height: '24px', width: '45%' }} />
        </div>
      </div>
    </div>
  )

  return (
    <div className="stat-card" style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
      <div aria-hidden style={{
        width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0,
        background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: iconColor,
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '4px' }}>{title}</div>
        <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </div>
        {hint && <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{hint}</div>}
        {trend && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
            {trend.value >= 0
              ? <TrendingUp size={12} style={{ color: 'var(--tone-success-fg)' }} />
              : <TrendingDown size={12} style={{ color: 'var(--tone-danger-fg)' }} />}
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: trend.value >= 0 ? 'var(--tone-success-fg)' : 'var(--tone-danger-fg)' }}>
              {trend.value >= 0 ? '+' : ''}{trend.value}%
            </span>
            <span style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>{trend.label}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page header and panels ────────────────────────────────────────────────────
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{title}</h2>
        {description && <p style={{ fontSize: '13.5px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{description}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>{actions}</div>}
    </div>
  )
}

export function Panel({ title, subtitle, actions, children, padded = true }: {
  title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; padded?: boolean
}) {
  return (
    <section className="card" style={{ overflow: 'hidden', minWidth: 0 }}>
      <div className="card-header">
        <div style={{ minWidth: 0 }}>
          <h3 className="card-title">{title}</h3>
          {subtitle && <p className="card-subtitle">{subtitle}</p>}
        </div>
        {actions}
      </div>
      <div style={padded ? { padding: '16px 20px' } : undefined}>{children}</div>
    </section>
  )
}

/** A failed load: says what failed, never shows it as empty. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" style={{
      display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap',
      background: 'var(--tone-danger-bg)', color: 'var(--tone-danger-fg)',
      borderRadius: 'var(--radius-control)', padding: '12px 14px', fontSize: '13px', lineHeight: 1.5,
    }}>
      <span style={{ flex: 1, minWidth: '200px' }}>{message}</span>
      {onRetry && <button className="btn btn-secondary" onClick={onRetry} style={{ minHeight: '30px' }}>Try again</button>}
    </div>
  )
}

// ── Status Badge ──────────────────────────────────────────────────────────────
type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'
const statusConfig: Record<string, { tone: Tone; label: string }> = {
  // Trips
  searching:              { tone: 'info', label: 'Searching' },
  tripAccepted:           { tone: 'success', label: 'Accepted' },
  driverArrived:          { tone: 'warning', label: 'Arrived' },
  tripStarted:            { tone: 'info', label: 'In Progress' },
  inProgress:             { tone: 'info', label: 'In Progress' },
  completed:              { tone: 'success', label: 'Completed' },
  delivered:              { tone: 'success', label: 'Delivered' },
  cancelledByDriver:      { tone: 'danger', label: 'Cancelled' },
  cancelledByPassenger:   { tone: 'danger', label: 'Cancelled' },
  cancelled:              { tone: 'danger', label: 'Cancelled' },
  // Drivers
  approved:               { tone: 'success', label: 'Approved' },
  pending:                { tone: 'warning', label: 'Pending' },
  pendingApproval:        { tone: 'warning', label: 'Pending' },
  suspended:              { tone: 'danger', label: 'Suspended' },
  rejected:               { tone: 'danger', label: 'Rejected' },
  // Withdrawals
  paid:                   { tone: 'success', label: 'Paid' },
  // Online
  online:                 { tone: 'success', label: 'Online' },
  offline:                { tone: 'neutral', label: 'Offline' },
  // Gas
  pendingReview:          { tone: 'warning', label: 'Pending Review' },
  driverAssigned:         { tone: 'info', label: 'Driver Assigned' },
  driverEnRoute:          { tone: 'info', label: 'En Route' },
  // Gas suppliers, stations and products
  draft:                  { tone: 'neutral', label: 'Draft' },
  pending_verification:   { tone: 'warning', label: 'Pending verification' },
  verified:               { tone: 'success', label: 'Verified' },
  unverified:             { tone: 'warning', label: 'Unverified' },
  inactive:               { tone: 'neutral', label: 'Inactive' },
  available:              { tone: 'success', label: 'Available' },
  unavailable:            { tone: 'neutral', label: 'Unavailable' },
  out_of_stock:           { tone: 'danger', label: 'Out of stock' },
}

export function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] || { tone: 'neutral' as Tone, label: status }
  return (
    <span style={{
      padding: '3px 10px', borderRadius: '999px',
      fontSize: '11.5px', fontWeight: 700,
      background: `var(--tone-${cfg.tone}-bg)`, color: `var(--tone-${cfg.tone}-fg)`,
      display: 'inline-block', whiteSpace: 'nowrap', lineHeight: 1.5,
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
    <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-tertiary)' }}>
      <div aria-hidden style={{
        width: '52px', height: '52px', borderRadius: '14px',
        background: 'var(--primary-dim)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', margin: '0 auto 14px', color: 'var(--accent-text)'
      }}>
        {icon}
      </div>
      <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>{title}</h3>
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
// Darker shades so white initials stay readable (≥ 4.5:1).
const avatarColors = ['#15803d','#0369a1','#6d28d9','#be185d','#b45309','#0e7490']

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
/** Confirms a sensitive action. Red by default, so destructive steps stand out. */
export function ConfirmDialog({
  open, title, description, confirmLabel = 'Confirm',
  confirmColor = 'var(--danger)', onConfirm, onCancel, loading
}: {
  open: boolean; title: string; description: string;
  confirmLabel?: string; confirmColor?: string;
  onConfirm: () => void; onCancel: () => void; loading?: boolean
}) {
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--overlay)' }} onClick={onCancel} />
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-desc"
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
        style={{
          position: 'relative', background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card)', padding: '24px', width: '100%', maxWidth: '420px',
          boxShadow: '0 24px 64px rgba(15,61,36,0.18)'
        }}>
        <h3 id="confirm-title" style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>{title}</h3>
        <p id="confirm-desc" style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '22px', lineHeight: 1.6 }}>{description}</p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button autoFocus onClick={onCancel} className="btn btn-secondary">Cancel</button>
          <button onClick={onConfirm} disabled={loading} className="btn" style={{ background: confirmColor, color: '#fff' }}>
            {loading ? 'Processing…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
