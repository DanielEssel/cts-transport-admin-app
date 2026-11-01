'use client'
// Searchable driver selector for linking a supplier rider. Reads only delivery
// drivers (role == 'driver_delivery': the only role the server will link),
// once per open, and filters in the browser. Drivers the server would refuse
// are listed but cannot be chosen, with the reason shown.
import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { Search, X } from 'lucide-react'
import { db } from '@/lib/firebase'
import { searchRiderCandidates, toRiderCandidate, type RiderCandidate } from '@/lib/rider-picker'
import { Avatar } from '@/components/shared'
import { inputStyle } from './ui'

const SHOWN = 8

export function DriverPicker({ linkedHere, selected, onSelect, disabled }: {
  linkedHere: ReadonlySet<string>
  selected: RiderCandidate | null
  onSelect: (c: RiderCandidate | null) => void
  disabled?: boolean
}) {
  const [all, setAll] = useState<RiderCandidate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    setAll(null); setError(null)
    getDocs(query(collection(db, 'drivers'), where('role', '==', 'driver_delivery')))
      .then((snap) => { if (live) setAll(snap.docs.map((d) => toRiderCandidate(d.id, d.data()))) })
      .catch((e) => { if (live) { setAll([]); setError(e?.code || e?.message || 'The drivers could not be loaded.') } })
    return () => { live = false }
  }, [attempt])

  // Close the results when clicking elsewhere.
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [])

  const results = useMemo(() => (all ? searchRiderCandidates(all, q, linkedHere) : []), [all, q, linkedHere])
  const shown = results.slice(0, SHOWN)
  useEffect(() => { setActive(0) }, [q])

  const choose = (i: number) => {
    const r = shown[i]
    if (!r || r.problem) return
    onSelect(r.candidate); setOpen(false); setQ('')
  }

  if (selected) {
    return (
      <div data-testid="rider-selected" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: 'var(--radius-control)', border: '1px solid var(--primary)', background: 'var(--primary-dim)' }}>
        <Avatar name={selected.name} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{selected.name}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{[selected.phone, selected.vehicle].filter(Boolean).join(' · ') || 'No phone or vehicle on record'}</div>
        </div>
        <button type="button" onClick={() => onSelect(null)} disabled={disabled} className="btn btn-secondary" aria-label="Choose a different driver">
          <X size={13} /> Change
        </button>
      </div>
    )
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
        <input
          role="combobox" aria-expanded={open} aria-controls="rider-results" aria-autocomplete="list"
          aria-label="Search drivers by name, phone, plate or ID"
          value={q} disabled={disabled}
          placeholder={all === null ? 'Loading drivers…' : 'Search by name, phone, plate or driver ID'}
          onChange={(e) => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, shown.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
            else if (e.key === 'Enter') { e.preventDefault(); choose(active) }
            else if (e.key === 'Escape') setOpen(false)
          }}
          style={{ ...inputStyle, paddingLeft: '32px', minHeight: '38px' }}
        />
      </div>

      {open && (
        <div id="rider-results" role="listbox" style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 20, background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-control)', boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
          maxHeight: '360px', overflowY: 'auto',
        }}>
          {all === null ? (
            <PickerNote>Loading delivery drivers…</PickerNote>
          ) : error ? (
            <PickerNote tone="danger">
              Could not load drivers ({error}).{' '}
              <button type="button" onClick={() => setAttempt((a) => a + 1)} className="btn btn-secondary" style={{ minHeight: '28px', marginLeft: '6px' }}>Retry</button>
            </PickerNote>
          ) : shown.length === 0 ? (
            <PickerNote>
              {all.length === 0 ? 'No delivery drivers are registered.' : `No delivery driver matches “${q.trim()}”.`}
              <div style={{ marginTop: '4px' }}>Only delivery drivers can be linked, so drivers of other services are not listed.</div>
            </PickerNote>
          ) : (
            <>
              {shown.map(({ candidate: c, problem }, i) => (
                <div key={c.id} role="option" aria-selected={i === active} aria-disabled={!!problem}
                  data-testid={`rider-option-${c.id}`}
                  onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px',
                    cursor: problem ? 'not-allowed' : 'pointer', opacity: problem ? 0.6 : 1,
                    background: i === active && !problem ? 'var(--surface-alt)' : 'transparent',
                    borderBottom: '1px solid var(--border)',
                  }}>
                  <Avatar name={c.name} size={30} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {[c.phone, c.vehicle].filter(Boolean).join(' · ') || 'No phone or vehicle on record'}
                    </div>
                  </div>
                  <span style={{
                    fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '999px', whiteSpace: 'nowrap',
                    background: problem ? 'var(--tone-neutral-bg)' : 'var(--tone-success-bg)',
                    color: problem ? 'var(--tone-neutral-fg)' : 'var(--tone-success-fg)',
                  }}>
                    {problem ?? 'Eligible'}
                  </span>
                </div>
              ))}
              {results.length > SHOWN && <PickerNote>{results.length - SHOWN} more. Keep typing to narrow the list.</PickerNote>}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function PickerNote({ children, tone }: { children: React.ReactNode; tone?: 'danger' }) {
  return <div style={{ padding: '12px', fontSize: '12px', color: tone ? 'var(--tone-danger-fg)' : 'var(--text-tertiary)' }}>{children}</div>
}
