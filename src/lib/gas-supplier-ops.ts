// Gas supplier orders and settlement: the rules the admin's operations
// pages show. Pure (no Firebase), so the tests run it directly.
//
// Every write behind these pages is server-side: gas_supplier_orders and
// the settlement collections are written only by Cloud Functions
// (functions/gas_supplier_orders.js, gas_supplier_fulfilment.js,
// gas_settlement_ledger.js in the passenger repo). The admin reads them
// (rules: admins may read) and calls the admin callables, which check the
// caller server-side. Nothing here decides money.

/** Statuses the supplier-order backend writes, in lifecycle order. */
export const SUPPLIER_ORDER_STATUSES = [
  'awaiting_payment', 'pendingApproval', 'confirmed', 'driverAssigned', 'atStation', 'outForDelivery', 'delivered', 'cancelled',
] as const
export type SupplierOrderStatus = typeof SUPPLIER_ORDER_STATUSES[number]

export const SUPPLIER_ORDER_LABELS: Record<string, string> = {
  awaiting_payment: 'Awaiting payment',
  pendingApproval: 'Paid · awaiting supplier',
  confirmed: 'Supplier confirmed · finding driver',
  driverAssigned: 'Driver assigned',
  atStation: 'Driver at station',
  outForDelivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

export const supplierOrderLabel = (s: string) => SUPPLIER_ORDER_LABELS[s] ?? s

/** Statuses an admin may cancel (gas_supplier_fulfilment.js adminCancelGasSupplierOrder). */
export const ADMIN_CANCELLABLE: readonly string[] = ['awaiting_payment', 'pendingApproval', 'confirmed', 'driverAssigned', 'atStation', 'outForDelivery']

/**
 * Monitoring thresholds for flagging orders to look at. These are display
 * defaults for operations, not business rules: nothing is changed
 * automatically when they are crossed.
 */
export const ATTENTION_AFTER_MS: Record<string, number> = {
  pendingApproval: 30 * 60 * 1000,
  confirmed: 30 * 60 * 1000,
  driverAssigned: 2 * 60 * 60 * 1000,
  atStation: 2 * 60 * 60 * 1000,
  outForDelivery: 3 * 60 * 60 * 1000,
}

export interface OrderForAttention {
  status: string
  updatedAtMs?: number | null
  createdAtMs?: number | null
  refundPending?: boolean
  refundReview?: string | null
}

/** Why an order needs a look, most important first. Empty when it does not. */
export function orderAttention(o: OrderForAttention, now: number): string[] {
  const out: string[] = []
  if (o.refundReview) out.push(`Refund needs review (${o.refundReview.replace(/_/g, ' ')})`)
  else if (o.refundPending && o.status === 'cancelled') out.push('Refund not completed')
  const since = o.updatedAtMs ?? o.createdAtMs
  const limit = ATTENTION_AFTER_MS[o.status]
  if (limit && typeof since === 'number' && now - since > limit) out.push(`${supplierOrderLabel(o.status)} for over ${Math.round(limit / 60000)} min`)
  return out
}

// ── Money (whole pesewas, as the ledger stores it) ──────────────────────────

export function isPesewas(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v)
}

export function formatPesewas(p: number): string {
  const sign = p < 0 ? '−' : ''
  const abs = Math.abs(p)
  return `${sign}GH₵${Math.floor(abs / 100).toLocaleString('en-GH')}.${String(abs % 100).padStart(2, '0')}`
}

export interface LedgerEntryLike {
  party: string
  kind: string
  amountPesewas: unknown
}

/** Totals by party from ledger entries; entries with unreadable amounts are counted, not summed. */
export function summarizeLedger(entries: readonly LedgerEntryLike[]) {
  const byParty: Record<string, number> = { supplier: 0, driver: 0, platform: 0 }
  let rejected = 0
  for (const e of entries) {
    if (!isPesewas(e.amountPesewas)) { rejected++; continue }
    byParty[e.party] = (byParty[e.party] ?? 0) + e.amountPesewas
  }
  return { byParty, rejected, total: Object.values(byParty).reduce((a, b) => a + b, 0) }
}

/**
 * Does an order's posted split add up to what the passenger paid? Each
 * party's original entries must sum to the order's snapshot total.
 */
export function orderReconciles(entries: readonly LedgerEntryLike[], snapshotTotalGhs: number): boolean {
  const originals = entries.filter((e) => e.kind !== 'reversal')
  if (originals.length !== 3 || !originals.every((e) => isPesewas(e.amountPesewas))) return false
  return originals.reduce((t, e) => t + (e.amountPesewas as number), 0) === Math.round(snapshotTotalGhs * 100)
}

export interface StatementLike {
  lines?: Array<{ amountPesewas: unknown }>
  netPesewas?: unknown
}

/** The sum of a statement's lines, and whether its stored net agrees. */
export function checkStatement(s: StatementLike): { netPesewas: number | null; reconciles: boolean } {
  const lines = Array.isArray(s.lines) ? s.lines : []
  if (!lines.length || !lines.every((l) => isPesewas(l.amountPesewas))) return { netPesewas: null, reconciles: false }
  const sum = lines.reduce((t, l) => t + (l.amountPesewas as number), 0)
  return { netPesewas: sum, reconciles: s.netPesewas === sum }
}

/** A closed business day for statement preparation: YYYY-MM-DD before today (UTC, Accra). */
export function isClosedBusinessDate(date: string, now: number): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const ms = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== date) return false
  return date < new Date(now).toISOString().slice(0, 10)
}

// ── Supplier logins (managed by the supplier portal's staff API) ────────────

/**
 * The supplier portal's base URL for the staff API, or null when not
 * configured. Only http(s) URLs without credentials, paths or queries.
 */
export function portalBaseUrl(value: string | undefined | null): string | null {
  if (!value) return null
  try {
    const u = new URL(value)
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash || (u.pathname !== '/' && u.pathname !== '')) return null
    if (u.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(u.hostname)) return null
    return u.origin
  } catch {
    return null
  }
}

/**
 * The message for a failed Firestore read on a Gas admin page. A
 * permission-denied answer names the collections the rules refused: the
 * production rules have no Gas rules until the Gas rules candidate
 * (ctsgo-gas-supplier-portal/rules-candidate) is deployed, and after that
 * only an active admin may read them.
 */
export function gasLoadError(e: unknown, collections: string, what: string): string {
  const err = e as { code?: unknown; message?: unknown } | null
  if (err?.code === 'permission-denied') {
    return `Permission denied reading ${collections}. The Firestore rules deployed in production have no rule for ${what}, so every client read is refused; the Gas rules candidate (ctsgo-gas-supplier-portal/rules-candidate) adds read access for active admins. If those rules are deployed, check that your admins record is still active.`
  }
  return `Could not load ${what}: ${err?.code || err?.message || String(e)}`
}
