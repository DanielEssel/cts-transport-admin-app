// Supplier wallet operations as the dashboard shows them, decided from the
// fields gas_supplier_wallet.js writes. Pure, for tests (c15). The server
// re-checks everything: these only decide what to show and which action to
// offer. One authorised admin (a super admin) runs a withdrawal through the
// callables adminApproveGasSupplierWithdrawal (approves and sends the one
// Bridge payment), adminRejectGasSupplierWithdrawal (before payment, with a
// reason) and adminConfirmGasSupplierWithdrawal (paid with the payment
// reference, or failed with the reason). Supplier wallets are separate from
// driver and passenger wallets: nothing here reads or writes those.
//
//   pending ──approve──▶ processing ──confirm──▶ paid | failed
//      │                    ▲
//      │  (request never left CTSGo: back to approved; approve sends again)
//      └──reject──▶ rejected (also from approved)
//
// A processing withdrawal whose Bridge result is unknown is never sent again
// and never released by itself: the admin checks with Bridge and confirms it.

/** gas_supplier_wallet.js MIN_TEXT: reasons and payment references need this many characters. */
export const MIN_TEXT = 6

/** gas_supplier_wallet.js STATUSES. */
export const WITHDRAWAL_STATUSES = ['pending', 'approved', 'processing', 'paid', 'rejected', 'failed'] as const
export type WithdrawalStatus = typeof WITHDRAWAL_STATUSES[number]
/** Statuses that still hold the supplier's funds. */
export const OPEN_STATUSES: readonly WithdrawalStatus[] = ['pending', 'approved', 'processing']

export const WITHDRAWAL_STATUS_LABELS: Record<WithdrawalStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  processing: 'Processing',
  paid: 'Paid',
  rejected: 'Rejected',
  failed: 'Failed',
}

/** What the Bridge request returned, for a processing withdrawal. */
export const BRIDGE_OUTCOME_LABELS: Record<string, string> = {
  accepted: 'Accepted by Bridge, not yet confirmed paid',
  unknown: 'Bridge did not confirm: check with Bridge, never send again',
}

export interface WithdrawalDoc {
  id: string
  supplierId?: unknown
  amountPesewas?: unknown
  status?: unknown
  transactionId?: unknown
  businessDay?: unknown
  recipient?: { method?: unknown; maskedNumber?: unknown; accountName?: unknown } | null
  requestedBy?: unknown
  createdAt?: unknown
  approvedBy?: unknown
  approvedByEmail?: unknown
  approvedAt?: unknown
  sentAt?: unknown
  bridgeOutcome?: unknown
  bridgeCode?: unknown
  sendError?: unknown
  paidAt?: unknown
  paidByEmail?: unknown
  paymentReference?: unknown
  rejectedAt?: unknown
  rejectedByEmail?: unknown
  rejectionReason?: unknown
  failedAt?: unknown
  failedByEmail?: unknown
  failureReason?: unknown
}

export function millis(t: unknown): number | null {
  if (t == null) return null
  if (typeof t === 'number') return t
  if (t instanceof Date) return t.getTime()
  const v = t as { toMillis?: () => number; seconds?: number }
  if (typeof v.toMillis === 'function') return v.toMillis()
  if (typeof v.seconds === 'number') return v.seconds * 1000
  return null
}

const isPesewas = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v)

/** gas_supplier_wallet.js withdrawalStatus: the stored status (anything else reads as pending). */
export function withdrawalStatus(w: { status?: unknown }): WithdrawalStatus {
  return (WITHDRAWAL_STATUSES as readonly unknown[]).includes(w.status) ? w.status as WithdrawalStatus : 'pending'
}

export type WithdrawalAction = 'approve' | 'reject' | 'confirm_paid' | 'confirm_failed'

/** The actions the server allows for a withdrawal in its current status. */
export function withdrawalActions(w: { status?: unknown }): WithdrawalAction[] {
  switch (withdrawalStatus(w)) {
    case 'pending':
    case 'approved': return ['approve', 'reject']
    case 'processing': return ['confirm_paid', 'confirm_failed']
    default: return []
  }
}

/** Why the form for [action] cannot be sent yet, or null. The server checks the same. */
export function actionProblem(action: WithdrawalAction, f: { reason?: string; paymentReference?: string }): string | null {
  if (action === 'reject' || action === 'confirm_failed') {
    if ((f.reason ?? '').trim().length < MIN_TEXT) return `Give the reason, at least ${MIN_TEXT} characters.`
  }
  if (action === 'confirm_paid' && (f.paymentReference ?? '').trim().length < MIN_TEXT) {
    return `Record the payment reference confirmed with Bridge, at least ${MIN_TEXT} characters.`
  }
  return null
}

/** Open withdrawals the admin must act on: waiting for approval, or sent and waiting for a confirmed result. */
export const needsAction = (w: { status?: unknown }): boolean => OPEN_STATUSES.includes(withdrawalStatus(w))

export interface WithdrawalFilter { status?: WithdrawalStatus | 'open' | ''; supplierId?: string; fromDay?: string; toDay?: string; text?: string }

/** Filters by status (or every open one), supplier, Ghana business day range and reference / id text. */
export function filterWithdrawals<T extends WithdrawalDoc>(rows: readonly T[], f: WithdrawalFilter): T[] {
  const text = (f.text ?? '').trim().toLowerCase()
  return rows.filter((w) => {
    if (f.status === 'open' ? !needsAction(w) : f.status && withdrawalStatus(w) !== f.status) return false
    if (f.supplierId && w.supplierId !== f.supplierId) return false
    const day = typeof w.businessDay === 'string' ? w.businessDay : null
    if (f.fromDay && (!day || day < f.fromDay)) return false
    if (f.toDay && (!day || day > f.toDay)) return false
    if (text && !`${w.id} ${String(w.transactionId ?? '')}`.toLowerCase().includes(text)) return false
    return true
  })
}

export interface WalletDoc {
  availablePesewas?: unknown
  reservedPesewas?: unknown
  withdrawnPesewas?: unknown
  creditedPesewas?: unknown
  activeWithdrawalId?: unknown
  daily?: { day?: unknown; usedPesewas?: unknown } | null
}

// ── Reconciliation (read-only diagnostics) ────────────────────────────────

/** gas_supplier_wallet.js walletProblem. */
export function walletProblem(wallet: WalletDoc | null | undefined): string | null {
  if (!wallet) return null
  const f = ['availablePesewas', 'reservedPesewas', 'withdrawnPesewas', 'creditedPesewas'] as const
  for (const k of f) {
    const v = wallet[k] ?? 0
    if (!Number.isSafeInteger(v) || (v as number) < 0) return `${k}_invalid`
  }
  const [a, r, wd, c] = f.map((k) => (wallet[k] ?? 0) as number)
  if (c !== a + r + wd) return 'totals_do_not_balance'
  if (!wallet.activeWithdrawalId && r !== 0) return 'reserved_without_open_withdrawal'
  if (wallet.activeWithdrawalId && r === 0) return 'open_withdrawal_without_reservation'
  return null
}


export interface ReconcileCheck { id: string; label: string; ok: boolean | null; detail: string }

export interface ReconcileInput {
  wallet: WalletDoc | null
  /** Every withdrawal of this supplier (all of them, or [complete] false). */
  withdrawals: readonly WithdrawalDoc[]
  complete: boolean
  /** This supplier's settlement statements. */
  statements: ReadonlyArray<{ id: string; party?: unknown; partyId?: unknown; payoutStatus?: unknown; payoutMethod?: unknown; payout?: { amountPesewas?: unknown } | null }>
  /** ledger rows with the fixed ids gas_supplier_wallet_credit_{statementId} and gas_supplier_withdrawal_{withdrawalId}. */
  ledger: ReadonlyArray<{ id: string; amount?: unknown }>
}

const fmt = (p: number) => `GH₵ ${(p / 100).toFixed(2)}`
const sum = (xs: readonly number[]) => xs.reduce((t, x) => t + x, 0)

/**
 * Statements credited vs wallet credits vs wallet vs withdrawals vs ledger,
 * for one supplier. Read-only: a failing check is for a person to
 * investigate; nothing here (or on the server) repairs a wallet.
 */
export function reconcileSupplier(supplierId: string, i: ReconcileInput): ReconcileCheck[] {
  const w = i.wallet ?? {}
  const n = (v: unknown) => (isPesewas(v) ? v : 0)
  const [available, reserved, withdrawn, credited] = [w.availablePesewas, w.reservedPesewas, w.withdrawnPesewas, w.creditedPesewas].map(n)
  const own = i.withdrawals.filter((x) => x.supplierId === supplierId)
  const open = own.filter((x) => OPEN_STATUSES.includes(x.status as WithdrawalStatus))
  const paid = own.filter((x) => x.status === 'paid')
  const creditedStatements = i.statements.filter((s) => s.party === 'supplier' && s.partyId === supplierId && s.payoutStatus === 'paid' && s.payoutMethod === 'supplier_wallet')
  const statementCredits = sum(creditedStatements.map((s) => n(s.payout?.amountPesewas)))
  const ledgerById = new Map(i.ledger.map((l) => [l.id, l]))
  const ledgerPesewas = (id: string) => { const a = ledgerById.get(id)?.amount; return typeof a === 'number' ? Math.round(a * 100) : null }
  const partial = i.complete ? '' : ' (withdrawal history is partial: not checked)'
  const problem = walletProblem(i.wallet)

  const checks: ReconcileCheck[] = [
    { id: 'invariant', label: 'Credited = available + reserved + withdrawn', ok: problem === null,
      detail: problem ? `Problem: ${problem}. ${fmt(credited)} credited; ${fmt(available)} + ${fmt(reserved)} + ${fmt(withdrawn)}.` : `${fmt(credited)} = ${fmt(available)} + ${fmt(reserved)} + ${fmt(withdrawn)}` },
    { id: 'one_open', label: 'At most one open withdrawal, and it is the wallet\'s active one', ok: open.length <= 1 && (open.length === 0 ? !w.activeWithdrawalId : w.activeWithdrawalId === open[0].id),
      detail: `${open.length} open; active ${w.activeWithdrawalId ? String(w.activeWithdrawalId) : 'none'}` },
    { id: 'reserved', label: 'Reserved = the open withdrawal\'s amount', ok: i.complete ? reserved === sum(open.map((x) => n(x.amountPesewas))) : null,
      detail: `${fmt(reserved)} reserved; open ${fmt(sum(open.map((x) => n(x.amountPesewas))))}${partial}` },
    { id: 'withdrawn', label: 'Withdrawn = paid withdrawals', ok: i.complete ? withdrawn === sum(paid.map((x) => n(x.amountPesewas))) : null,
      detail: `${fmt(withdrawn)} withdrawn; paid ${fmt(sum(paid.map((x) => n(x.amountPesewas))))}${partial}` },
    { id: 'credited', label: 'Credited = statements credited to this wallet', ok: credited === statementCredits,
      detail: `${fmt(credited)} credited; ${creditedStatements.length} statement(s) ${fmt(statementCredits)}` },
  ]
  const missingCredit = creditedStatements.filter((s) => ledgerPesewas(`gas_supplier_wallet_credit_${s.id}`) !== n(s.payout?.amountPesewas))
  checks.push({ id: 'credit_ledger', label: 'Each credited statement has its one ledger row, same amount', ok: missingCredit.length === 0,
    detail: missingCredit.length ? `Missing or different: ${missingCredit.map((s) => s.id).join(', ')}` : `${creditedStatements.length} row(s) match` })
  const missingPaid = paid.filter((x) => ledgerPesewas(`gas_supplier_withdrawal_${x.id}`) !== n(x.amountPesewas))
  const strayPaid = i.ledger.filter((l) => l.id.startsWith('gas_supplier_withdrawal_') && !paid.some((x) => l.id === `gas_supplier_withdrawal_${x.id}`))
  checks.push({ id: 'withdrawal_ledger', label: 'Each paid withdrawal has its one ledger row, and no other', ok: i.complete ? missingPaid.length === 0 && strayPaid.length === 0 : null,
    detail: [missingPaid.length ? `Missing or different: ${missingPaid.map((x) => x.id).join(', ')}` : '', strayPaid.length ? `Row without a paid withdrawal: ${strayPaid.map((l) => l.id).join(', ')}` : '']
      .filter(Boolean).join('. ') || `${paid.length} row(s) match${partial}` })
  return checks
}

// ── Alerts ────────────────────────────────────────────────────────────────

/** admin_alerts types raised by gas_supplier_wallet.js. */

// ── Alerts ────────────────────────────────────────────────────────────────

/** admin_alerts types raised by gas_supplier_wallet.js. */
export const WALLET_ALERT_LABELS: Record<string, string> = {
  gas_supplier_wallet_unreconciled: 'Wallet does not reconcile: withdrawals paused',
  gas_supplier_withdrawal_unknown: 'Bridge did not confirm a payment: check Bridge, never send again',
  gas_supplier_payout_number_changed: 'Payout number changed: check the change was expected before approving',
}

/** Server refusals in plain words; anything else falls back to the server's message. */
export const WALLET_REFUSALS: Record<string, string> = {
  reason_required: 'Give the reason (at least 6 characters).',
  payment_reference_required: 'Record the payment reference confirmed with Bridge (at least 6 characters).',
  recipient_changed: "The supplier's Mobile Money number changed after this request. Reject it; the supplier can request again.",
  gas_supplier_payouts_disabled: 'Withdrawals are switched off. Nothing was sent.',
  withdrawal_not_sent: 'The payment could not be sent, so nothing left CTSGo. It stays approved: send it again later, or reject it.',
  withdrawal_processing: 'The payment was sent to Bridge. Confirm it as paid or failed instead.',
  wallet_mismatch: 'The wallet does not hold this withdrawal. Investigate before going on.',
}

/**
 * audit_log actions written for supplier wallets. The Firestore rules let
 * admins read only these (gasWalletAuditActions), so every audit query must
 * filter on exactly this list.
 */
export const WALLET_AUDIT_ACTIONS = [
  'gas_supplier_withdrawal_requested', 'gas_supplier_withdrawal_approved',
  'gas_supplier_withdrawal_sent', 'gas_supplier_withdrawal_not_sent',
  'gas_supplier_withdrawal_bridge_accepted', 'gas_supplier_withdrawal_bridge_unknown',
  'gas_supplier_withdrawal_rejected', 'gas_supplier_withdrawal_paid',
  'gas_supplier_withdrawal_failed',
  'gas_supplier_payout_preference_changed', 'gas_supplier_statement_credited',
] as const

/** A payout number for staff screens: the first three and last three digits only. */
export function maskNumber(n: unknown): string {
  return typeof n === 'string' && /^\d{10}$/.test(n) ? `${n.slice(0, 3)}****${n.slice(-3)}` : '—'
}

/** settings/gas_supplier_payouts as the server reads it; null limits when any is missing or invalid (withdrawals then stay blocked). */
export function payoutSettingsView(s: Record<string, unknown> | null | undefined) {
  const min = s?.minWithdrawalPesewas, max = s?.maxWithdrawalPesewas, daily = s?.dailyWithdrawalLimitPesewas
  const ok = [min, max, daily].every((v) => Number.isSafeInteger(v)) && (min as number) >= 1 && (max as number) >= (min as number) && (daily as number) >= (max as number)
  return {
    enabled: s?.enabled === true,
    limits: ok ? { minPesewas: min as number, maxPesewas: max as number, dailyPesewas: daily as number } : null,
  }
}
