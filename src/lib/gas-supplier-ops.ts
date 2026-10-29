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
 * Statuses in which an admin may take the driver off an order so another
 * driver can take it (gas_supplier_fulfilment.js adminReleaseGasSupplierDriver):
 * before the supplier hands the cylinder over.
 */
export const ADMIN_RELEASABLE: readonly string[] = ['driverAssigned', 'atStation']

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

// ── Financial allocation (gas_supplier_orders/{id}/finance/allocation) ─────
//
// Written by createGasSupplierOrder with the order (gas_settlement_ledger.js
// computeAllocation); admins read it. The admin shows it and re-checks the
// equations; it never computes an amount to post.

export interface Allocation {
  productSubtotalPesewas: number
  handlingFeePesewas: number
  deliveryFeePesewas: number
  customerTotalPesewas: number
  commissionBasePesewas: number
  commissionRateBps: number
  commissionPesewas: number
  commissionTermsId: string
  commissionTermsVersion: number
  commissionTermsReference: string
  supplierGrossPesewas: number
  supplierAdjustmentsPesewas: number
  supplierNetPesewas: number
  driverAdjustmentsPesewas: number
  driverNetPesewas: number
  settlement?: { status?: string; reconciliation?: string | null; reconciliationReason?: string | null }
}

const ALLOCATION_AMOUNTS = [
  'productSubtotalPesewas', 'handlingFeePesewas', 'deliveryFeePesewas', 'customerTotalPesewas', 'commissionBasePesewas',
  'commissionPesewas', 'supplierGrossPesewas', 'supplierAdjustmentsPesewas', 'supplierNetPesewas', 'driverAdjustmentsPesewas', 'driverNetPesewas',
] as const

/**
 * The agreed equations, checked on a stored allocation (and against the
 * order's snapshot total when given). Each failed equation is named.
 */
export function checkAllocation(a: Partial<Allocation> | null | undefined, snapshotTotalGhs?: number | null): { ok: boolean; problems: string[] } {
  if (!a) return { ok: false, problems: ['No allocation recorded'] }
  if (!ALLOCATION_AMOUNTS.every((k) => isPesewas(a[k]))) return { ok: false, problems: ['Unreadable amounts'] }
  const v = a as Allocation
  const problems: string[] = []
  if (v.customerTotalPesewas !== v.productSubtotalPesewas + v.handlingFeePesewas + v.deliveryFeePesewas) problems.push('Total ≠ product + handling + delivery')
  if (v.commissionBasePesewas !== v.productSubtotalPesewas) problems.push('Commission base is not the product subtotal')
  if (!(Number.isInteger(v.commissionRateBps) && v.commissionRateBps >= 0 && v.commissionRateBps <= 10000)
    || v.commissionPesewas !== Math.floor((v.commissionBasePesewas * v.commissionRateBps) / 10000)) problems.push('Commission ≠ floor(base × rate)')
  if (v.supplierGrossPesewas !== v.productSubtotalPesewas + v.handlingFeePesewas) problems.push('Supplier gross ≠ product + handling')
  if (v.supplierNetPesewas !== v.supplierGrossPesewas - v.commissionPesewas + v.supplierAdjustmentsPesewas) problems.push('Supplier net ≠ gross − commission + adjustments')
  if (v.driverNetPesewas !== v.deliveryFeePesewas + v.driverAdjustmentsPesewas) problems.push('Driver net ≠ delivery fee + adjustments')
  if (v.supplierNetPesewas + v.driverNetPesewas + v.commissionPesewas !== v.customerTotalPesewas) problems.push('Parts do not add up to the total')
  if (typeof snapshotTotalGhs === 'number' && Math.round(snapshotTotalGhs * 100) !== v.customerTotalPesewas) problems.push('Total differs from the order’s price snapshot')
  return { ok: problems.length === 0, problems }
}

/**
 * Why an order's allocation could not be read, kept apart from "none
 * recorded": a refused read (rules without the finance/{docId} match) says
 * nothing about whether the order has an allocation.
 */
export function allocationReadError(e: unknown): string {
  return gasLoadError(e, 'gas_supplier_orders/{orderId}/finance', 'order allocations')
}

/** Basis points as a percentage, e.g. 1250 → "12.50%". */
export function formatBps(bps: unknown): string {
  return Number.isInteger(bps) ? `${((bps as number) / 100).toFixed(2)}%` : '—'
}

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  held: 'Held (wallet escrow)',
  captured: 'Captured on delivery',
  refunded: 'Refunded',
}

export const ALLOCATION_SETTLEMENT_LABELS: Record<string, string> = {
  not_posted: 'Not yet accrued',
  accrued: 'Entitlement accrued',
  reversed: 'Reversed',
}

/**
 * Where an entitlement is in settlement. Payout approval and completion
 * come only from gas_supplier_payouts.js (behind settings/gas_supplier_payouts):
 * a supplier payout is completed only when a super admin records Bridge's
 * confirmation; a driver statement when it is credited to the driver wallet.
 */
export type SettlementStage = 'accrued' | 'reversed' | 'statement_prepared' | 'payout_approved' | 'payout_completed'

export const SETTLEMENT_STAGE_LABELS: Record<SettlementStage, string> = {
  accrued: 'Accrued entitlement',
  reversed: 'Reversed',
  statement_prepared: 'In a prepared statement',
  payout_approved: 'Payout approved (in progress)',
  payout_completed: 'Payout completed',
}

export function settlementStage(entry: { kind: string }, opts: { reversed?: boolean; statementPayoutStatus?: string | null; claimed?: boolean }): SettlementStage {
  if (opts.claimed) {
    if (opts.statementPayoutStatus === 'paid') return 'payout_completed'
    if (opts.statementPayoutStatus === 'payout_in_progress') return 'payout_approved'
    return 'statement_prepared'
  }
  if (entry.kind !== 'reversal' && opts.reversed) return 'reversed'
  return 'accrued'
}

/** A statement's payout status for display; anything unknown is not started. */
export function payoutStatusLabel(s: string | null | undefined): string {
  if (s === 'paid') return 'Payout completed'
  if (s === 'payout_in_progress') return 'Payout approved (in progress)'
  if (s === 'failed') return 'Payout failed (can be sent again)'
  return 'Not started'
}

/** What happened to the current Mobile Money attempt, for display. */
export const PAYOUT_OUTCOME_LABELS: Record<string, string> = {
  sending: 'Sending to Bridge',
  sent: 'Accepted by Bridge — confirm with Bridge, then record the result',
  unknown: 'Bridge did not confirm — check with Bridge, never resend',
  refused: 'Refused by Bridge',
  not_sent: 'Not sent',
  confirmed_paid: 'Confirmed paid',
  confirmed_failed: 'Confirmed not paid',
}

export type StatementPayoutAction = 'send_mobile_money' | 'record_result' | 'credit_driver_wallet'

/**
 * The payout action a super admin may take on a statement, as the server
 * allows it (gas_supplier_payouts.js), or null. Commission statements and
 * statements with nothing to pay offer none.
 */
export function statementPayoutAction(s: { party?: string; status?: string; netPesewas?: unknown; payoutStatus?: string; payout?: { outcome?: string } | null }): StatementPayoutAction | null {
  const payable = s.status === 'prepared' && isPesewas(s.netPesewas) && (s.netPesewas as number) > 0
  if (s.party === 'supplier') {
    if (s.payoutStatus === 'payout_in_progress') return s.payout?.outcome === 'sent' || s.payout?.outcome === 'unknown' ? 'record_result' : null
    return payable && (s.payoutStatus === 'not_started' || s.payoutStatus === 'failed') ? 'send_mobile_money' : null
  }
  if (s.party === 'driver') return payable && s.payoutStatus === 'not_started' ? 'credit_driver_wallet' : null
  return null
}

/** Who delivers a supplier order (gas_supplier_fulfilment.js deliveryMode). */
export function deliveryModeLabel(m: string | null | undefined): string {
  if (m === 'supplier_rider') return "Supplier's own rider (delivery fee to the supplier)"
  if (m === 'ctsgo_driver') return 'CTSGo driver (delivery fee to the driver)'
  return 'Not chosen yet'
}

/** Evidence must identify Bridge's confirmation (as the server requires: 6+ characters). */
export const payoutEvidenceOk = (v: string) => v.trim().length >= 6

// ── Commission terms (gas_commission_terms) ─────────────────────────────────

export interface TermsProposal {
  rateBps: number
  termsReference: string
  settlementHoldHours: number
}

/** The server's input checks (gas_settlement_ledger.js proposeTerms), so the form says why before it submits. */
export function termsProposalProblem(p: { rateBps: string; termsReference: string; settlementHoldHours: string }): string | null {
  if (!/^\d+$/.test(p.rateBps.trim()) || Number(p.rateBps) > 10000) return 'Rate: whole basis points from 0 to 10000 (1000 = 10%).'
  if (p.termsReference.trim().length < 3 || p.termsReference.length > 200) return 'Terms reference: the signed agreement or approval record (3–200 characters).'
  const h = Number(p.settlementHoldHours)
  if (p.settlementHoldHours.trim() === '' || !Number.isFinite(h) || h < 0 || h > 720) return 'Settlement hold: 0 to 720 hours.'
  return null
}

export function parseTermsProposal(p: { rateBps: string; termsReference: string; settlementHoldHours: string }): TermsProposal {
  return { rateBps: Number(p.rateBps.trim()), termsReference: p.termsReference.trim(), settlementHoldHours: Number(p.settlementHoldHours) }
}

/** Whether this admin may approve a version: it is proposed, and someone else proposed it. */
export function canApproveTerms(version: { status?: string; proposedBy?: string }, adminUid: string | null | undefined): boolean {
  return version.status === 'proposed' && !!adminUid && version.proposedBy !== adminUid
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
