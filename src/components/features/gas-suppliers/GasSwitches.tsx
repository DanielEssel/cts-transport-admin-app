'use client'
// The Gas master switches, read-only. settings/gas_supplier_fulfilment and
// settings/gas_supplier_payouts are written only by a super admin under their
// own rules and are not changed from this dashboard; settings/platform.gasEnabled
// is edited in Settings (Services).
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { switchState } from '@/lib/gas-admin'

type State = 'on' | 'off' | 'unknown'

const SWITCHES = [
  { id: 'gasEnabled', label: 'Gas service in the passenger app', where: 'settings/platform.gasEnabled', edit: '/settings#services' },
  { id: 'fulfilment', label: 'Supplier order fulfilment', where: 'settings/gas_supplier_fulfilment', edit: null },
  { id: 'payouts', label: 'Supplier payouts', where: 'settings/gas_supplier_payouts', edit: null },
] as const

export function useGasSwitches() {
  const [states, setStates] = useState<Record<string, State> | null>(null)
  useEffect(() => {
    let live = true
    const read = (path: string) => getDoc(doc(db, 'settings', path)).then((s) => (s.exists() ? s.data() : null)).then((d) => ({ d, failed: false }), () => ({ d: null, failed: true }))
    Promise.all([read('platform'), read('gas_supplier_fulfilment'), read('gas_supplier_payouts')]).then(([p, f, pay]) => {
      if (!live) return
      setStates({
        // The passenger app treats a missing gasEnabled as on (the Settings default).
        gasEnabled: p.failed ? 'unknown' : p.d?.gasEnabled === false ? 'off' : 'on',
        fulfilment: switchState(f.d, f.failed),
        payouts: switchState(pay.d, pay.failed),
      })
    })
    return () => { live = false }
  }, [])
  return states
}

const TONE: Record<State, { bg: string; fg: string; text: string }> = {
  on: { bg: 'var(--tone-success-bg)', fg: 'var(--tone-success-fg)', text: 'On' },
  off: { bg: 'var(--tone-neutral-bg)', fg: 'var(--tone-neutral-fg)', text: 'Off' },
  unknown: { bg: 'var(--tone-warning-bg)', fg: 'var(--tone-warning-fg)', text: 'Unknown' },
}

export function GasSwitches({ compact }: { compact?: boolean }) {
  const states = useGasSwitches()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {SWITCHES.map((s) => {
        const st = states?.[s.id]
        const tone = st ? TONE[st] : null
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
            <span style={{ flex: 1, color: 'var(--text-primary)' }}>
              {s.label}
              {!compact && <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{s.where}</span>}
            </span>
            {!compact && (s.edit
              ? <Link href={s.edit} style={{ fontSize: '12px', color: 'var(--accent-text)' }}>Change in Settings</Link>
              : <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Read-only here</span>)}
            <span style={{ minWidth: '62px', textAlign: 'center', padding: '3px 10px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, background: tone?.bg ?? 'var(--surface-alt)', color: tone?.fg ?? 'var(--text-tertiary)' }}>
              {tone?.text ?? '…'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
