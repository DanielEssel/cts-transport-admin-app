'use client'
// Where this supplier stands for live orders (lib/gas-dispatch-status.ts):
// the supplier-dispatch backend asked directly (gasSupplierOrderingStatus,
// which also reports the fulfilment switch), the configured portal address,
// the supplier's orders switch, its readiness checklist and the commission
// terms that would price its orders. Read only.
import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { CheckCircle2, Circle, CircleSlash, HelpCircle } from 'lucide-react'
import { db, functions } from '@/lib/firebase'
import { portalBaseUrl, termsUsable } from '@/lib/gas-supplier-ops'
import { dispatchStatus, type DispatchInputs } from '@/lib/gas-dispatch-status'
import type { Readiness } from '@/lib/gas-suppliers'
import { Notice } from './ui'

const PORTAL = portalBaseUrl(process.env.NEXT_PUBLIC_SUPPLIER_PORTAL_URL)
const ICON = { ok: CheckCircle2, off: CircleSlash, missing: Circle, unknown: HelpCircle }
const COLOR = { ok: 'var(--accent-text)', off: 'var(--text-tertiary)', missing: 'var(--tone-danger-fg)', unknown: 'var(--text-tertiary)' }

export function DispatchStatus({ supplierId, ordersEnabled, readiness }: { supplierId: string; ordersEnabled: boolean; readiness: Readiness }) {
  const [observed, setObserved] = useState<Pick<DispatchInputs, 'backend' | 'flagEnabled' | 'commission'>>({ backend: 'checking', flagEnabled: null, commission: 'unknown' })

  useEffect(() => {
    let live = true
    ;(async () => {
      let backend: DispatchInputs['backend'] = 'unavailable'
      let flagEnabled: boolean | null = null
      try {
        const r = (await httpsCallable(functions, 'gasSupplierOrderingStatus')({})).data as { enabled?: unknown }
        backend = 'available'
        flagEnabled = r?.enabled === true
      } catch {
        // Not deployed or unreachable: read the switch directly.
        try {
          const f = await getDoc(doc(db, 'settings', 'gas_supplier_fulfilment'))
          flagEnabled = f.exists() && f.data().enabled === true
        } catch { /* unknown */ }
      }
      let commission: DispatchInputs['commission'] = 'unknown'
      try {
        const [platform, own] = await Promise.all([
          getDoc(doc(db, 'gas_commission_terms', 'current')), getDoc(doc(db, 'gas_commission_terms', `current_s_${supplierId}`)),
        ])
        const ownData = own.exists() ? own.data() : null
        commission = !termsUsable(platform.exists() ? platform.data() : null) ? 'missing'
          : ownData && !(termsUsable(ownData, { supplier: true }) && ownData.supplierId === supplierId) ? 'own_rate_unusable' : 'usable'
      } catch { /* unknown */ }
      if (live) setObserved({ backend, flagEnabled, commission })
    })()
    return () => { live = false }
  }, [supplierId])

  const status = dispatchStatus({
    ...observed, portalUrl: PORTAL, ordersEnabled,
    readinessOk: readiness.canEnableOrders, readinessMissing: readiness.checks.filter((c) => !c.ok).map((c) => c.label.toLowerCase()),
  })

  return (
    <div data-testid="dispatch-status" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <Notice tone={status.tone === 'warning' ? 'warning' : 'info'}>{status.headline}</Notice>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
        {status.lines.map((l) => {
          const Icon = ICON[l.state]
          return (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
              <Icon size={14} color={COLOR[l.state]} aria-label={l.state} />
              <span style={{ color: 'var(--text-primary)' }}>{l.label}</span>
              <span style={{ color: 'var(--text-tertiary)' }}>— {l.detail}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
