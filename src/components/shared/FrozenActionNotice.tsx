import { Lock } from 'lucide-react'
import { FROZEN_ACTION_MESSAGE } from '@/lib/frozen-actions'

/** Visible explanation shown next to admin actions frozen by C1. */
export function FrozenActionNotice({ actions }: { actions: string }) {
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '10px 14px', borderRadius: '10px',
        background: 'rgba(234,179,8,0.10)', border: '1px solid rgba(234,179,8,0.35)',
        color: 'var(--text-primary)', fontSize: '13px',
      }}
    >
      <Lock size={14} style={{ color: 'var(--tone-warning-fg)', flexShrink: 0 }} />
      <span><strong>{actions}:</strong> {FROZEN_ACTION_MESSAGE}</span>
    </div>
  )
}
