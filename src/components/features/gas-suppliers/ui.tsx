'use client'
// Small form pieces shared by the Gas supplier screens, in the dashboard's
// inline-style idiom.

import { ReactNode } from 'react'
import { X } from 'lucide-react'
import { label } from '@/lib/gas-suppliers'

export const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: '8px',
  padding: '8px 10px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none',
}

export function buttonStyle(kind: 'primary' | 'secondary' | 'danger' | 'warning' = 'secondary', disabled = false): React.CSSProperties {
  const palette = {
    primary: { background: 'var(--primary-dark)', color: '#fff', border: 'none' },
    danger: { background: 'rgba(239,68,68,0.12)', color: 'var(--tone-danger-fg)', border: 'none' },
    warning: { background: 'rgba(234,179,8,0.12)', color: 'var(--tone-warning-fg)', border: 'none' },
    secondary: { background: 'var(--surface-alt)', color: 'var(--text-secondary)', border: '1px solid var(--border)' },
  }[kind]
  return {
    ...palette, padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    display: 'inline-flex', alignItems: 'center', gap: '6px',
  }
}

export function Modal({ title, onClose, children, footer, width = 640 }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
      <div style={{
        position: 'relative', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px',
        width: 'calc(100% - 32px)', maxWidth: `${width}px`, maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>{title}</h3>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>{children}</div>
        {footer && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export function Field({ label: text, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', minWidth: 0 }}>
      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{text}</span>
      {children}
      {hint && <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{hint}</span>}
    </label>
  )
}

export function Row({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>{children}</div>
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '4px' }}>{children}</div>
}

export function TextInput({ value, onChange, placeholder, disabled, type = 'text' }: {
  value: string | number | undefined; onChange: (v: string) => void; placeholder?: string; disabled?: boolean; type?: string
}) {
  return (
    <input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
      style={{ ...inputStyle, opacity: disabled ? 0.6 : 1 }} />
  )
}

export function TextArea({ value, onChange, placeholder, disabled }: {
  value: string | undefined; onChange: (v: string) => void; placeholder?: string; disabled?: boolean
}) {
  return (
    <textarea value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} rows={3}
      style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', opacity: disabled ? 0.6 : 1 }} />
  )
}

export function Select<T extends string>({ value, options, onChange, disabled, placeholder }: {
  value: T | undefined; options: readonly T[]; onChange: (v: T) => void; disabled?: boolean; placeholder?: string
}) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value as T)} disabled={disabled}
      style={{ ...inputStyle, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 }}>
      {placeholder !== undefined && <option value="" disabled>{placeholder}</option>}
      {options.map((o) => <option key={o} value={o}>{label(o)}</option>)}
    </select>
  )
}

export function CheckboxGroup<T extends string>({ options, checked, onChange, disabled }: {
  options: readonly T[]; checked: (v: T) => boolean; onChange: (v: T, on: boolean) => void; disabled?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
      {options.map((o) => (
        <label key={o} style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)',
          background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px',
          cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
        }}>
          <input type="checkbox" checked={checked(o)} disabled={disabled} onChange={(e) => onChange(o, e.target.checked)} />
          {label(o)}
        </label>
      ))}
    </div>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warning' | 'danger'; children: ReactNode }) {
  return (
    <div role={tone === 'danger' ? 'alert' : undefined} style={{ background: `var(--tone-${tone}-bg)`, border: '1px solid var(--border)', color: `var(--tone-${tone}-fg)`, borderRadius: '10px', padding: '10px 12px', fontSize: '12px', lineHeight: 1.5 }}>
      {children}
    </div>
  )
}

export function KeyValue({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
      <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600 }}>{k}</span>
      <span style={{ fontSize: '13px', color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{v || '—'}</span>
    </div>
  )
}

export function Card({ title, actions, children }: { title?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0 }}>
      {(title || actions) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>{title}</div>
          {actions}
        </div>
      )}
      {children}
    </div>
  )
}

export function OrdersBadge({ on }: { on: boolean }) {
  return (
    <span style={{
      padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-block',
      background: on ? 'var(--tone-info-bg)' : 'var(--tone-neutral-bg)', color: on ? 'var(--tone-info-fg)' : 'var(--tone-neutral-fg)',
    }}>
      {on ? 'Orders on' : 'Orders off'}
    </span>
  )
}
