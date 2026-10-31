// Whether paid Gas orders reach one supplier, from what the dashboard can
// actually observe: the supplier-dispatch backend answering
// (gasSupplierOrderingStatus, which also reports the fulfilment flag), the
// supplier portal's configured address, the supplier's own orders switch, its
// readiness checklist (gas-suppliers.ts supplierReadiness) and usable
// commission terms (the platform default, and the supplier's own rate when it
// has one). Supplier dispatch is implemented; this says why it is or is not
// routing this supplier's orders, and never claims routing while anything is
// off. Pure.

export type DispatchLineState = 'ok' | 'off' | 'missing' | 'unknown'

export interface DispatchLine {
  id: 'backend' | 'portal' | 'integrations' | 'flag' | 'orders' | 'configuration'
  label: string
  state: DispatchLineState
  detail: string
}

export interface DispatchInputs {
  /** gasSupplierOrderingStatus: answered (deployed), failed, or not asked yet. */
  backend: 'available' | 'unavailable' | 'checking'
  /** settings/gas_supplier_fulfilment.enabled === true; null when unknown. */
  flagEnabled: boolean | null
  /** The supplier portal's address (NEXT_PUBLIC_SUPPLIER_PORTAL_URL), or null. */
  portalUrl: string | null
  ordersEnabled: boolean
  /** supplierReadiness(): every check passes. */
  readinessOk: boolean
  /** Labels of the readiness checks that fail. */
  readinessMissing: string[]
  /** Commission terms that would price this supplier's orders. */
  commission: 'usable' | 'missing' | 'own_rate_unusable' | 'unknown'
}

export interface DispatchStatus {
  /** Paid orders for this supplier go to its portal and CTSGo dispatch now. */
  live: boolean
  tone: 'ok' | 'warning' | 'info'
  headline: string
  lines: DispatchLine[]
}

const COMMISSION_TEXT: Record<DispatchInputs['commission'], string> = {
  usable: 'approved commission terms',
  missing: 'no approved platform commission terms',
  own_rate_unusable: "the supplier's own commission rate is not usable",
  unknown: 'commission terms could not be read',
}

export function dispatchStatus(i: DispatchInputs): DispatchStatus {
  const configOk = i.readinessOk && i.commission === 'usable'
  const configMissing = [...i.readinessMissing, ...(i.commission === 'usable' ? [] : [COMMISSION_TEXT[i.commission]])]
  const lines: DispatchLine[] = [
    {
      id: 'backend', label: 'Supplier dispatch backend',
      state: i.backend === 'available' ? 'ok' : i.backend === 'checking' ? 'unknown' : 'missing',
      detail: i.backend === 'available' ? 'Deployed and answering' : i.backend === 'checking' ? 'Checking…' : 'Not answering from this dashboard (not deployed, or unreachable)',
    },
    {
      id: 'portal', label: 'Supplier portal',
      state: i.portalUrl ? 'ok' : 'missing',
      detail: i.portalUrl ? `Configured at ${i.portalUrl}` : 'No portal address configured (NEXT_PUBLIC_SUPPLIER_PORTAL_URL)',
    },
    {
      id: 'integrations', label: 'Backend and portal integrations',
      state: i.backend === 'checking' ? 'unknown' : i.backend === 'available' && i.portalUrl ? 'ok' : 'missing',
      detail: i.backend === 'available' && i.portalUrl ? 'Present' : 'Incomplete: see above',
    },
    {
      id: 'flag', label: 'Supplier fulfilment (all suppliers)',
      state: i.flagEnabled === true ? 'ok' : i.flagEnabled === false ? 'off' : 'unknown',
      detail: i.flagEnabled === true ? 'On' : i.flagEnabled === false ? 'Off: passengers order Gas through the standard flow' : 'Unknown',
    },
    {
      id: 'orders', label: "This supplier's orders",
      state: i.ordersEnabled ? 'ok' : 'off', detail: i.ordersEnabled ? 'On' : 'Off',
    },
    {
      id: 'configuration', label: 'Supplier configuration',
      state: i.commission === 'unknown' && i.readinessOk ? 'unknown' : configOk ? 'ok' : 'missing',
      detail: configOk ? 'Complete' : `Incomplete: ${configMissing.join('; ')}`,
    },
  ]

  const live = i.backend === 'available' && i.flagEnabled === true && i.ordersEnabled && configOk
  if (live) {
    return { live, tone: 'ok', lines,
      headline: "Live: this supplier's paid orders go to its portal, then to its linked riders or CTSGo dispatch." }
  }
  if (i.backend !== 'available') {
    return { live, tone: 'warning', lines,
      headline: i.backend === 'checking'
        ? 'Checking supplier dispatch…'
        : 'Supplier dispatch is not answering from this dashboard, so whether orders can be routed is unknown.' }
  }
  const blockers = [
    ...(i.flagEnabled === false ? ['supplier fulfilment is switched off'] : i.flagEnabled == null ? ['the fulfilment switch could not be read'] : []),
    ...(i.ordersEnabled ? [] : ["this supplier's orders are off"]),
    ...(configOk ? [] : ['its configuration is incomplete']),
  ]
  return { live, tone: 'info', lines,
    headline: `Supplier dispatch is built and deployed, but is not routing orders to this supplier: ${blockers.join(', ')}.`
      + (i.flagEnabled === false ? ' Until it is switched on, passenger Gas orders use the standard Gas flow (Settings → Gas, offered to CTSGo drivers).' : '') }
}
