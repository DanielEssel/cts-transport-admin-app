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
export type SettlementStage =
  | 'accrued' | 'reversed' | 'statement_prepared' | 'payout_approved' | 'payout_completed' | 'credited_to_wallet' | 'outstanding_adjustment'

export const SETTLEMENT_STAGE_LABELS: Record<SettlementStage, string> = {
  accrued: 'Accrued entitlement',
  reversed: 'Reversed',
  statement_prepared: 'In a prepared statement',
  payout_approved: 'Payout approved (in progress)',
  payout_completed: 'Payout completed',
  credited_to_wallet: 'Credited to CTSGo wallet',
  outstanding_adjustment: 'Outstanding adjustment (owed back, not deducted)',
}

/**
 * A driver statement is credited to the CTSGo wallet, never paid out (stored as paid + driver_wallet,
 * gas_supplier_payouts.js). Whatever the method says, a paid driver statement is never a payout.
 */
const isWalletCredit = (party?: string | null, _method?: string | null) => party === 'driver'

export function settlementStage(
  entry: { kind: string },
  opts: { reversed?: boolean; statementPayoutStatus?: string | null; claimed?: boolean; party?: string | null; payoutMethod?: string | null; debtStatus?: string | null },
): SettlementStage {
  // A reversal of an already-claimed entry is claimed by a debt, not a statement: it is owed back until resolved.
  if (entry.kind === 'reversal' && opts.debtStatus === 'outstanding') return 'outstanding_adjustment'
  if (opts.claimed) {
    if (opts.statementPayoutStatus === 'paid') return isWalletCredit(opts.party, opts.payoutMethod) ? 'credited_to_wallet' : 'payout_completed'
    if (opts.statementPayoutStatus === 'payout_in_progress') return 'payout_approved'
    return 'statement_prepared'
  }
  if (entry.kind !== 'reversal' && opts.reversed) return 'reversed'
  return 'accrued'
}

/** A statement's payout status for display; anything unknown is not started. */
export function payoutStatusLabel(s: string | null | undefined, party?: string | null, method?: string | null): string {
  if (s === 'paid') return isWalletCredit(party, method) ? 'Credited to CTSGo wallet' : 'Payout completed'
  if (s === 'not_required') return 'Nothing to pay'
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
  if (m === 'linked_rider') return 'Linked supplier rider (delivery fee paid by CTSGo to the rider)'
  return 'Not chosen yet'
}

// ── Linked-rider offers and fallback (spec §6 "Orders") ──

/** Why CTSGo dispatch took over a linked-rider order (gas_supplier_fulfilment.js ctsgoFallbackReason). */
const FALLBACK_REASON_LABELS: Record<string, string> = {
  supplier_request: 'The supplier passed it to CTSGo.',
  rider_timeout: 'The offered rider did not answer in time.',
  no_rider_assigned: 'The supplier did not offer it to a rider in time.',
  riders_declined: 'Too many linked riders declined it.',
  admin_release: 'An admin released the linked rider.',
}
export const fallbackReasonLabel = (r: string | null | undefined): string | null =>
  (typeof r === 'string' && r ? FALLBACK_REASON_LABELS[r] ?? `Passed to CTSGo (${r})` : null)

/** How a rider offer ended (lastRiderOffer.outcome). */
const OFFER_OUTCOME_LABELS: Record<string, string> = {
  accepted: 'accepted', declined: 'declined', timed_out: 'timed out', withdrawn: 'withdrawn by the supplier',
  cancelled: 'ended: order cancelled', revoked: "ended: rider's link revoked",
}
export const offerOutcomeLabel = (o: string | null | undefined) => (o ? OFFER_OUTCOME_LABELS[o] ?? o : '—')

export interface OrderOffers {
  riderOffer?: { driverId?: unknown; seq?: unknown; expiresAtMs?: number | null } | null
  lastRiderOffer?: { driverId?: unknown; seq?: unknown; outcome?: unknown; atMs?: number | null } | null
  declinedRiderIds?: unknown
}
const minutesText = (msLeft: number) => `${Math.max(1, Math.round(Math.abs(msLeft) / 60000))} min`
/**
 * The order's rider-offer history in plain lines: the pending offer (with its
 * expiry), the last ended offer (with its outcome) and how many riders
 * declined. Nothing when the order never had an offer.
 */
export function offerHistory(o: OrderOffers, now: number): string[] {
  const lines: string[] = []
  const id = (v: unknown) => (typeof v === 'string' && v ? v : 'unknown rider')
  const seq = (v: unknown) => (Number.isInteger(v) ? ` (offer #${v})` : '')
  const p = o.riderOffer
  if (p) {
    const at = p.expiresAtMs
    const expiry = typeof at !== 'number' ? 'no expiry recorded'
      : at > now ? `expires in ${minutesText(at - now)} (${new Date(at).toISOString()})`
        : `expired ${minutesText(now - at)} ago, awaiting the fallback sweep`
    lines.push(`Pending offer to ${id(p.driverId)}${seq(p.seq)}: ${expiry}`)
  }
  const l = o.lastRiderOffer
  if (l) lines.push(`Last offer to ${id(l.driverId)}${seq(l.seq)}: ${offerOutcomeLabel(typeof l.outcome === 'string' ? l.outcome : null)}${typeof l.atMs === 'number' ? ` at ${new Date(l.atMs).toISOString()}` : ''}`)
  const declined = Array.isArray(o.declinedRiderIds) ? o.declinedRiderIds.length : 0
  if (declined > 0) lines.push(`${declined} rider${declined === 1 ? '' : 's'} declined this order`)
  return lines
}

/** The F5 cylinder-recovery alert (admin_alerts/gas_cylinder_recovery_{orderId}), in plain words; null when there is none. */
export function cylinderRecoveryNotice(alert: { resolved?: unknown; message?: unknown } | null | undefined): { tone: 'danger' | 'info'; text: string } | null {
  if (!alert) return null
  const base = typeof alert.message === 'string' && alert.message ? alert.message : 'Cancelled after hand-over: recover the cylinder.'
  return alert.resolved === true
    ? { tone: 'info', text: `Cylinder recovery: resolved. ${base}` }
    : { tone: 'danger', text: `Cylinder recovery needed (offline): ${base}` }
}

/**
 * Does an order's delivery party match its mode? Only supplier_rider routes
 * the fee to the supplier (supplier__delivery_fee); ctsgo_driver and
 * linked_rider post driver__entitlement to the order's driver, and
 * linked_rider never has a supplier delivery fee. Reversals are ignored.
 */
export function orderModeReconciles(
  order: { deliveryMode?: string | null; driverId?: string | null; linkedSupplierId?: string | null },
  entries: ReadonlyArray<{ id?: string; party: string; kind: string; partyId?: string; basis?: { linkedSupplierId?: string } | null }>,
): boolean {
  const mode = order.deliveryMode
  if (mode !== 'supplier_rider' && mode !== 'ctsgo_driver' && mode !== 'linked_rider') return false
  const originals = entries.filter((e) => e.kind !== 'reversal')
  const named = (suffix: string) => originals.filter((e) => typeof e.id === 'string' && e.id.endsWith(`__${suffix}`))
  const fee = named('supplier__delivery_fee')
  const rider = named('driver__entitlement')
  if (named('supplier__entitlement').length !== 1 || named('platform__commission').length !== 1) return false
  if (mode === 'supplier_rider') return fee.length === 1 && fee[0].party === 'supplier' && rider.length === 0
  if (fee.length !== 0 || rider.length !== 1 || rider[0].party !== 'driver') return false
  if (order.driverId && rider[0].partyId !== order.driverId) return false
  if (mode === 'linked_rider' && order.linkedSupplierId && rider[0].basis?.linkedSupplierId && rider[0].basis.linkedSupplierId !== order.linkedSupplierId) return false
  return true
}

// ── Rider payment summary (driver settlement, spec §6) ──────────────────────

export interface RiderPaymentSummary {
  earnedPending: number
  owed: number
  credited: number
  withdrawalRequested: number
  sentAwaitingConfirmation: number
  outcomeUnknown: number
  paidOutConfirmed: number
  failed: number
  outstandingAdjustments: number
}

/**
 * One driver's money by stage, in pesewas. Ledger entries and statements
 * are the driver's own; claims say which entries a statement or a debt took.
 *  - earnedPending: entries no claim has taken yet, net of their reversals;
 *  - owed: prepared statements not yet credited (payable ?? net);
 *  - credited: statements credited to the CTSGo wallet. This is never "paid out":
 *    only a completed withdrawal is (paidOutConfirmed);
 *  - withdrawals (the wallet is pooled, amounts in cedis): pending requested,
 *    processing sending/sent awaiting confirmation, processing/unknown unresolved,
 *    completed confirmed, failed (hold returned). Rejected is not counted;
 *  - outstandingAdjustments: debts not yet resolved, which nothing deducts.
 */
export function riderPaymentSummary(
  entries: ReadonlyArray<{ id?: string; amountPesewas: unknown }>,
  claims: ReadonlyArray<{ entryId?: string }>,
  statements: ReadonlyArray<{ status?: string; payoutStatus?: string; payoutMethod?: string; party?: string; netPesewas?: unknown; payablePesewas?: unknown }>,
  debts: ReadonlyArray<{ status?: string; amountPesewas?: unknown }>,
  withdrawals: ReadonlyArray<{ status?: string; payoutOutcome?: string; amount?: unknown }>,
): RiderPaymentSummary {
  const claimed = new Set(claims.map((c) => c.entryId))
  const money = (v: unknown) => (isPesewas(v) ? v : 0)
  const payable = (s: { netPesewas?: unknown; payablePesewas?: unknown }) => money(s.payablePesewas ?? s.netPesewas)
  const cedis = (w: { amount?: unknown }) => (typeof w.amount === 'number' && Number.isFinite(w.amount) ? Math.round(w.amount * 100) : 0)
  const sum = <T,>(xs: readonly T[], f: (x: T) => number) => xs.reduce((t, x) => t + f(x), 0)
  const w = (pred: (x: { status?: string; payoutOutcome?: string }) => boolean) => sum(withdrawals.filter(pred), cedis)
  return {
    earnedPending: sum(entries.filter((e) => !claimed.has(e.id)), (e) => money(e.amountPesewas)),
    owed: sum(statements.filter((s) => s.status === 'prepared' && (s.payoutStatus === 'not_started' || s.payoutStatus === 'failed')), payable),
    credited: sum(statements.filter((s) => s.payoutStatus === 'paid' && isWalletCredit(s.party ?? 'driver')), payable),
    withdrawalRequested: w((x) => x.status === 'pending'),
    sentAwaitingConfirmation: w((x) => x.status === 'processing' && x.payoutOutcome !== 'unknown'),
    outcomeUnknown: w((x) => x.status === 'processing' && x.payoutOutcome === 'unknown'),
    paidOutConfirmed: w((x) => x.status === 'completed'),
    failed: w((x) => x.status === 'failed'),
    outstandingAdjustments: sum(debts.filter((d) => d.status === 'outstanding' || d.status === 'resolution_proposed'), (d) => money(d.amountPesewas)),
  }
}

// ── Outstanding debts (gas_settlement_debts, adminResolveGasSettlementDebt) ──

export type DebtAction = 'resolve' | 'propose' | 'approve' | 'reject'
export interface DebtChoice { action: DebtAction; resolution?: string; label: string }

const DEBT_RESOLUTION_LABELS: Record<string, string> = {
  withhold: 'Withhold from this statement',
  pay_in_full: 'Pay in full (CTSGo absorbs it)',
  written_off: 'Write off (CTSGo absorbs it)',
  recovered_externally: 'Recovered outside the platform',
}
export const debtResolutionLabel = (r: string | null | undefined) => (r ? DEBT_RESOLUTION_LABELS[r] ?? r : '—')

type DebtStatement = { payoutStatus?: string; party?: string } | null
/**
 * A debt's live stage, from its claiming statement's current payout status, as
 * the server's debtStage decides it: before payout while the statement's payout
 * has not started, or a supplier payout has failed (it will be retried);
 * otherwise after payout. A debt with no statement is after payout. When the
 * statement could not be read (undefined), the stored stage is the best guess.
 */
export function debtLiveStage(statement: DebtStatement | undefined, storedStage?: string): string | undefined {
  if (statement === undefined) return storedStage
  const s = statement?.payoutStatus
  return s === 'not_started' || (s === 'failed' && statement?.party === 'supplier') ? 'before_payout' : 'after_payout'
}

/** Why no debt action is offered now: a payout Bridge has not confirmed may still fail and be retried. */
export const debtBlocked = (statement: DebtStatement | undefined): string | null =>
  statement?.payoutStatus === 'payout_in_progress' ? 'Record the Bridge result first' : null

/**
 * What an admin may do with a debt, as the server allows it: before payout one
 * super admin resolves it; after payout one proposes and a different one
 * approves or rejects. Nothing is ever deducted from later earnings. Pass the
 * claiming statement so the stage is the live one, not the stored one; while
 * its payout is in progress nothing is offered.
 */
export function debtChoices(debt: { status?: string; stage?: string; proposal?: { by?: string } | null }, adminUid: string | null | undefined, statement?: DebtStatement): DebtChoice[] {
  const mk = (action: DebtAction, resolution: string): DebtChoice => ({ action, resolution, label: DEBT_RESOLUTION_LABELS[resolution] })
  if (debtBlocked(statement)) return []
  if (debt.status === 'outstanding') {
    const stage = debtLiveStage(statement, debt.stage)
    if (stage === 'before_payout') return [mk('resolve', 'withhold'), mk('resolve', 'pay_in_full')]
    if (stage === 'after_payout') return [mk('propose', 'written_off'), mk('propose', 'recovered_externally')]
    return []
  }
  if (debt.status === 'resolution_proposed' && !!adminUid && debt.proposal?.by !== adminUid) {
    return [{ action: 'approve', label: 'Approve the proposal' }, { action: 'reject', label: 'Reject the proposal' }]
  }
  return []
}

/** Only an after-payout proposal needs evidence (6+ characters, as the server requires). */
export const debtEvidenceRequired = (c: { action: DebtAction }) => c.action === 'propose'

const SETTLEMENT_REFUSALS: Record<string, string> = {
  statement_has_outstanding_debt: 'This statement has an outstanding debt. Resolve the debt first.',
  debt_payout_unconfirmed: 'Record the Bridge result first',
  debt_stage_changed: "The statement's payout has started since this debt was created. Reload and use the after-payout route.",
  proposer_cannot_approve: 'A different super admin must decide this proposal.',
  statement_lines_mismatch: "The statement's lines do not add up to its net amount.",
  statement_claims_mismatch: 'A line of this statement is claimed by a different statement.',
}
/** Plain words for a settlement refusal reason (HttpsError details.reason), or null if unknown. */
export const settlementRefusal = (reason: unknown): string | null => (typeof reason === 'string' ? SETTLEMENT_REFUSALS[reason] ?? null : null)

/**
 * Per-party reconciliation (spec §6), in pesewas, for one driver. Entries net
 * of reversals must equal what is pending + owed + credited, less the debts
 * that were or may be absorbed: outstanding debts, and resolved pay_in_full,
 * written_off and recovered_externally ones. A withheld debt is already out of
 * the statement's payable amount, so it needs no term. Credited is also
 * checked as the sum of paid driver statements made by driver_wallet.
 * walletCreditRows (the gas_driver_settlement_* ledger rows), when given,
 * must add up to credited as well.
 */
export function partyReconciles(
  entries: ReadonlyArray<{ id?: string; amountPesewas: unknown }>,
  claims: ReadonlyArray<{ entryId?: string }>,
  statements: ReadonlyArray<{ status?: string; payoutStatus?: string; payoutMethod?: string; party?: string; netPesewas?: unknown; payablePesewas?: unknown }>,
  debts: ReadonlyArray<{ status?: string; resolution?: string; amountPesewas?: unknown }>,
  walletCreditRows?: ReadonlyArray<{ amountPesewas?: unknown }>,
): { ok: boolean; problems: string[] } {
  const problems: string[] = []
  const m = riderPaymentSummary(entries, claims, statements, debts, [])
  const money = (v: unknown) => (isPesewas(v) ? v : 0)
  if (!entries.every((e) => isPesewas(e.amountPesewas))) problems.push('Unreadable entry amounts')
  const net = entries.reduce((t, e) => t + money(e.amountPesewas), 0)
  const absorbed = debts
    .filter((d) => d.status === 'resolved' && ['pay_in_full', 'written_off', 'recovered_externally'].includes(d.resolution ?? ''))
    .reduce((t, d) => t + money(d.amountPesewas), 0)
  const expected = m.earnedPending + m.owed + m.credited - m.outstandingAdjustments - absorbed
  if (net !== expected) problems.push(`Entries net ${net} differs from pending + owed + credited − debts (${expected})`)
  const walletPaid = statements
    .filter((s) => s.payoutStatus === 'paid' && s.payoutMethod === 'driver_wallet')
    .reduce((t, s) => t + money(s.payablePesewas ?? s.netPesewas), 0)
  if (walletPaid !== m.credited) problems.push('A paid driver statement was not credited by driver_wallet')
  if (walletCreditRows) {
    const rows = walletCreditRows.reduce((t, r) => t + money(r.amountPesewas), 0)
    if (rows !== m.credited) problems.push(`Wallet credit rows ${rows} differ from credited ${m.credited}`)
  }
  return { ok: problems.length === 0, problems }
}

/** Evidence must identify Bridge's confirmation (as the server requires: 6+ characters). */
export const payoutEvidenceOk = (v: string) => v.trim().length >= 6

// ── Commission terms (gas_commission_terms) ─────────────────────────────────

export interface TermsProposal {
  rateBps: number
  termsReference: string
  /** The platform default only: a supplier's own rate uses the platform's hold. */
  settlementHoldHours?: number
  /** A supplier's own rate; absent: the platform default. */
  supplierId?: string
}

/** The form: supplierId '' proposes the platform default. */
export interface TermsProposalForm { rateBps: string; termsReference: string; settlementHoldHours: string; supplierId?: string }

/** The server's input checks (gas_settlement_ledger.js proposeTerms), so the form says why before it submits. */
export function termsProposalProblem(p: TermsProposalForm): string | null {
  if (!/^\d+$/.test(p.rateBps.trim()) || Number(p.rateBps) > 10000) return 'Rate: whole basis points from 0 to 10000 (1000 = 10%).'
  if (p.termsReference.trim().length < 3 || p.termsReference.length > 200) return 'Terms reference: the signed agreement or approval record (3–200 characters).'
  if (p.supplierId) return null
  const h = Number(p.settlementHoldHours)
  if (p.settlementHoldHours.trim() === '' || !Number.isFinite(h) || h < 0 || h > 720) return 'Settlement hold: 0 to 720 hours.'
  return null
}

export function parseTermsProposal(p: TermsProposalForm): TermsProposal {
  const base = { rateBps: Number(p.rateBps.trim()), termsReference: p.termsReference.trim() }
  return p.supplierId ? { ...base, supplierId: p.supplierId } : { ...base, settlementHoldHours: Number(p.settlementHoldHours) }
}

/**
 * The current terms documents (gas_commission_terms): `current` is the
 * platform default, `current_s_{supplierId}` a supplier's own approved rate.
 */
export function splitTermsDocs<T extends { id: string }>(docs: T[]): { platform: T | null; suppliers: Record<string, T>; versions: T[] } {
  const suppliers: Record<string, T> = {}
  for (const d of docs) if (d.id.startsWith('current_s_')) suppliers[d.id.slice('current_s_'.length)] = d
  return { platform: docs.find((d) => d.id === 'current') ?? null, suppliers, versions: docs.filter((d) => !d.id.startsWith('current')) }
}

/** Whether current terms can price orders (the server's termsProblem, for display). */
export function termsUsable(t: Record<string, any> | null | undefined, { supplier = false } = {}): boolean {
  return !!t && t.active === true && Number.isInteger(t.rateBps) && typeof t.termsReference === 'string' && !!t.termsReference && !!t.approvedBy
    && t.commissionBase === 'product_subtotal' && t.handlingFeeCommissionable === false && t.deliveryFeeCommissionable === false
    && (supplier || (typeof t.settlementHoldHours === 'number' && t.settlementHoldHours >= 0))
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

/** Settlement work waiting for an admin, counted with the settlement page's own rules. No amounts are computed. */
export function settlementQueue(
  statements: ReadonlyArray<Parameters<typeof statementPayoutAction>[0]>,
  debts: ReadonlyArray<{ status?: string }>,
) {
  const actions = statements.map(statementPayoutAction)
  return {
    supplierPayoutsToSend: actions.filter((a) => a === 'send_mobile_money').length,
    payoutResultsToRecord: actions.filter((a) => a === 'record_result').length,
    driverStatementsToCredit: actions.filter((a) => a === 'credit_driver_wallet').length,
    // Open as the settlement page loads them: outstanding, or with a resolution awaiting a second admin.
    openDebts: debts.filter((d) => d.status === 'outstanding' || d.status === 'resolution_proposed').length,
  }
}
