'use client'
// Supplier payouts: the supplier wallets and their Mobile Money withdrawals
// (gas_supplier_wallet.js). Wallets, withdrawals and their audit are written
// only by Cloud Functions; admins may read them. One authorised admin (a
// super admin) handles a withdrawal from start to end, through callables
// that check the caller and every rule again:
//   adminApproveGasSupplierWithdrawal  approve and send the one Bridge payment
//   adminRejectGasSupplierWithdrawal   reject before payment, with a reason
//   adminConfirmGasSupplierWithdrawal  confirm paid (payment reference) or
//                                      failed (reason), after checking Bridge
// Nothing here retries a payment Bridge may have received, changes the payout
// switch or limits, or repairs a wallet: reconciliation is read-only.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'
import { db, functions } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import { TableSkeleton } from '@/components/shared'
import { Card, Field, KeyValue, Modal, Notice, TextArea, TextInput, buttonStyle, inputStyle } from '@/components/features/gas-suppliers/ui'
import { formatPesewas, gasLoadError } from '@/lib/gas-supplier-ops'
import {
  BRIDGE_OUTCOME_LABELS, WALLET_ALERT_LABELS, WALLET_AUDIT_ACTIONS, WALLET_REFUSALS, WITHDRAWAL_STATUSES, WITHDRAWAL_STATUS_LABELS,
  actionProblem, filterWithdrawals, millis, needsAction, payoutSettingsView, reconcileSupplier, walletProblem, withdrawalActions, withdrawalStatus,
  type ReconcileCheck, type WalletDoc, type WithdrawalAction, type WithdrawalDoc, type WithdrawalFilter,
} from '@/lib/gas-supplier-wallet-admin'

/** Withdrawals read per supplier wallet, newest first. */
const WITHDRAWALS_PER_WALLET = 50

type Withdrawal = WithdrawalDoc & { supplierId: string }
interface Alert { id: string; type?: string; message?: string; severity?: string; supplierId?: string; withdrawalId?: string; resolved?: boolean; createdAt?: unknown }
interface AuditRow { id: string; action?: string; actorEmail?: string; actorUid?: string; createdAt?: unknown; reason?: string; paymentReference?: string }

const TABS = [
  { id: 'withdrawals', label: 'Withdrawals' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'reconciliation', label: 'Reconciliation' },
  { id: 'settings', label: 'Switch & limits' },
] as const
type Tab = typeof TABS[number]['id']

const ACTION_LABELS: Record<WithdrawalAction, string> = {
  approve: 'Approve and send payment',
  reject: 'Reject',
  confirm_paid: 'Confirm paid',
  confirm_failed: 'Confirm failed',
}

const when = (t: unknown) => { const m = millis(t); return m == null ? '—' : new Date(m).toLocaleString() }
const callError = (e: any) => (typeof e?.details?.reason === 'string' && WALLET_REFUSALS[e.details.reason]) || e?.message || 'The request failed.'
const pesewas = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) ? formatPesewas(v) : '—')
const muted: React.CSSProperties = { fontSize: '12px', color: 'var(--text-tertiary)' }
const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

function Panel({ id, tab, children }: { id: Tab; tab: Tab; children: React.ReactNode }) {
  return (
    <section role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={tab !== id}
      style={{ display: tab === id ? 'flex' : 'none', flexDirection: 'column', gap: '16px' }}>
      {children}
    </section>
  )
}

export default function GasSupplierPayoutsPage() {
  const { admin } = useAuth()
  const isSuper = admin?.role === 'super_admin'
  const [tab, setTab] = useState<Tab>('withdrawals')
  useEffect(() => {
    const h = window.location.hash.slice(1)
    if (TABS.some((t) => t.id === h)) setTab(h as Tab)
  }, [])
  const openTab = (t: Tab) => { setTab(t); window.history.replaceState(null, '', `#${t}`) }

  const [error, setError] = useState<string | null>(null)
  const [names, setNames] = useState<Record<string, string> | null>(null)
  const [wallets, setWallets] = useState<Record<string, WalletDoc>>({})
  const [withdrawals, setWithdrawals] = useState<Withdrawal[] | null>(null)
  const [complete, setComplete] = useState<Record<string, boolean>>({})
  const [alerts, setAlerts] = useState<Alert[] | null>(null)
  const [alertsError, setAlertsError] = useState<string | null>(null)
  const [settings, setSettings] = useState<ReturnType<typeof payoutSettingsView> | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [sup, wal, set] = await Promise.all([
        getDocs(collection(db, 'gas_suppliers')),
        getDocs(collection(db, 'gas_supplier_wallets')),
        getDoc(doc(db, 'settings', 'gas_supplier_payouts')),
      ])
      setSettings(payoutSettingsView(set.exists() ? set.data() : null))
      setNames(Object.fromEntries(sup.docs.map((d) => [d.id, String(d.data().tradingName || d.data().legalName || d.id)])))
      setWallets(Object.fromEntries(wal.docs.map((d) => [d.id, d.data() as WalletDoc])))
      const lists = await Promise.all(wal.docs.map(async (d) => {
        const s = await getDocs(query(collection(db, 'gas_supplier_wallets', d.id, 'withdrawals'), orderBy('createdAt', 'desc'), limit(WITHDRAWALS_PER_WALLET)))
        return { sid: d.id, rows: s.docs.map((w) => ({ ...w.data(), id: w.id, supplierId: d.id }) as Withdrawal), full: s.size < WITHDRAWALS_PER_WALLET }
      }))
      setComplete(Object.fromEntries(lists.map((l) => [l.sid, l.full])))
      setWithdrawals(lists.flatMap((l) => l.rows).sort((a, b) => (millis(b.createdAt) ?? 0) - (millis(a.createdAt) ?? 0)))
    } catch (e) {
      setError(gasLoadError(e, 'gas_suppliers, gas_supplier_wallets and settings/gas_supplier_payouts', 'Supplier payouts'))
    }
    // Alerts separately: a refused read must not hide the withdrawals.
    try {
      const a = await getDocs(query(collection(db, 'admin_alerts'), where('type', 'in', Object.keys(WALLET_ALERT_LABELS)), limit(200)))
      setAlerts(a.docs.map((d) => ({ id: d.id, ...d.data() }) as Alert).sort((x, y) => (millis(y.createdAt) ?? 0) - (millis(x.createdAt) ?? 0)))
      setAlertsError(null)
    } catch (e) { setAlertsError(gasLoadError(e, 'admin_alerts', 'Payout alerts')) }
  }, [])
  useEffect(() => { load() }, [load])

  // ── Withdrawals ─────────────────────────────────────────────────────────
  const [filter, setFilter] = useState<WithdrawalFilter>({ status: 'open' })
  const shown = useMemo(() => filterWithdrawals(withdrawals ?? [], filter), [withdrawals, filter])
  const openCount = useMemo(() => (withdrawals ?? []).filter(needsAction).length, [withdrawals])
  const [detail, setDetail] = useState<Withdrawal | null>(null)
  const [detailAudit, setDetailAudit] = useState<AuditRow[] | null>(null)
  const [action, setAction] = useState<WithdrawalAction | null>(null)
  const [form, setForm] = useState({ reason: '', paymentReference: '' })
  const [busy, setBusy] = useState(false)

  async function openDetail(w: Withdrawal) {
    setDetail(w); setDetailAudit(null); setAction(null); setForm({ reason: '', paymentReference: '' })
    try {
      const s = await getDocs(query(collection(db, 'audit_log'), where('withdrawalId', '==', w.id), where('action', 'in', [...WALLET_AUDIT_ACTIONS])))
      setDetailAudit(s.docs.map((d) => ({ id: d.id, ...d.data() }) as AuditRow).sort((a, b) => (millis(a.createdAt) ?? 0) - (millis(b.createdAt) ?? 0)))
    } catch { setDetailAudit([]) }
  }

  const problem = action ? actionProblem(action, form) : null

  async function run() {
    if (!detail || !action || problem) return
    const ref = String(detail.transactionId ?? detail.id)
    if (action === 'approve' && !window.confirm(`Approve ${pesewas(detail.amountPesewas)} and send it by Mobile Money to ${String(detail.recipient?.maskedNumber ?? '')}? Bridge is asked once; it is never sent twice.`)) return
    if (action === 'confirm_paid' && !window.confirm(`Record ${ref} as PAID? Only do this once Bridge confirms the supplier received it.`)) return
    setBusy(true)
    const ids = { supplierId: detail.supplierId, withdrawalId: detail.id }
    try {
      if (action === 'approve') {
        const r: any = (await httpsCallable(functions, 'adminApproveGasSupplierWithdrawal')(ids)).data
        toast.success(r?.bridgeOutcome === 'accepted' ? 'Approved and sent. Bridge accepted it: confirm the result once Bridge shows it paid.'
          : 'Approved and sent, but Bridge did not confirm it. Check Bridge and confirm the result; never send it again.')
      } else if (action === 'reject') {
        await httpsCallable(functions, 'adminRejectGasSupplierWithdrawal')({ ...ids, reason: form.reason.trim() })
        toast.success('Rejected. The amount is back in the supplier\'s available balance.')
      } else {
        await httpsCallable(functions, 'adminConfirmGasSupplierWithdrawal')({
          ...ids, outcome: action === 'confirm_paid' ? 'paid' : 'failed',
          ...(action === 'confirm_paid' ? { paymentReference: form.paymentReference.trim() } : { reason: form.reason.trim() }),
        })
        toast.success(action === 'confirm_paid' ? 'Recorded as paid.' : 'Recorded as failed. The amount is back in the supplier\'s available balance.')
      }
      setDetail(null)
    } catch (e) { toast.error(callError(e)) } finally { setBusy(false); await load() }
  }

  // ── Reconciliation ──────────────────────────────────────────────────────
  const [reconSupplier, setReconSupplier] = useState('')
  const [recon, setRecon] = useState<ReconcileCheck[] | null>(null)
  const [reconError, setReconError] = useState<string | null>(null)

  async function runReconciliation(sid: string) {
    setReconSupplier(sid); setRecon(null); setReconError(null)
    if (!sid) return
    try {
      const own = (withdrawals ?? []).filter((w) => w.supplierId === sid)
      const st = await getDocs(query(collection(db, 'gas_settlement_statements'), where('party', '==', 'supplier'), where('partyId', '==', sid)))
      const statements = st.docs.map((d) => ({ id: d.id, ...d.data() }))
      const ids = [
        ...statements.filter((s: any) => s.payoutStatus === 'paid' && s.payoutMethod === 'supplier_wallet').map((s) => `gas_supplier_wallet_credit_${s.id}`),
        ...own.filter((w) => w.status === 'paid').map((w) => `gas_supplier_withdrawal_${w.id}`),
      ]
      const ledger = (await Promise.all(ids.map((id) => getDoc(doc(db, 'ledger', id))))).filter((d) => d.exists()).map((d) => ({ id: d.id, amount: d.data()?.amount }))
      setRecon(reconcileSupplier(sid, { wallet: wallets[sid] ?? null, withdrawals: own, complete: complete[sid] === true, statements, ledger }))
    } catch (e) { setReconError(gasLoadError(e, 'gas_settlement_statements and ledger', 'Reconciliation')) }
  }

  const nameOf = (sid: string) => names?.[sid] ?? sid

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>Supplier payouts</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Gas supplier wallet withdrawals to registered Mobile Money numbers. Separate from driver and passenger wallets.</p>
        </div>
        <button style={buttonStyle('secondary')} onClick={() => { setWithdrawals(null); load() }}><RefreshCw size={14} /> Refresh</button>
      </div>

      <Notice tone="warning">
        A withdrawal is Paid only when you confirm it with Bridge&apos;s payment reference: Bridge accepting a request is not a payment.
        A processing withdrawal is never sent again; if Bridge did not confirm it, check with Bridge and record the result.
      </Notice>
      {settings && !settings.enabled && <Notice>Withdrawals are switched off (settings/gas_supplier_payouts): suppliers cannot request, and nothing can be sent. Open requests can still be rejected or confirmed.</Notice>}
      {!isSuper && <Notice>Only a super admin can approve, reject or confirm withdrawals.</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}

      <nav className="sw-tabs" role="tablist" aria-label="Supplier payout sections" style={{ borderBottom: '1px solid var(--border)' }}>
        {TABS.map((t) => (
          <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} className="sw-tab" onClick={() => openTab(t.id)}>
            {t.label}
            {t.id === 'withdrawals' && withdrawals !== null && openCount > 0 && <span className="sw-count">{openCount}</span>}
            {t.id === 'alerts' && alerts !== null && alerts.filter((a) => !a.resolved).length > 0 && <span className="sw-count">{alerts.filter((a) => !a.resolved).length}</span>}
          </button>
        ))}
      </nav>

      <Panel id="withdrawals" tab={tab}>
        <Card title="Withdrawals" actions={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <select aria-label="Status" style={inputStyle} value={filter.status ?? ''} onChange={(e) => setFilter({ ...filter, status: e.target.value as WithdrawalFilter['status'] })}>
              <option value="open">Open (needs action)</option>
              <option value="">All statuses</option>
              {WITHDRAWAL_STATUSES.map((s) => <option key={s} value={s}>{WITHDRAWAL_STATUS_LABELS[s]}</option>)}
            </select>
            <select aria-label="Supplier" style={inputStyle} value={filter.supplierId ?? ''} onChange={(e) => setFilter({ ...filter, supplierId: e.target.value })}>
              <option value="">All suppliers</option>
              {Object.entries(names ?? {}).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
            <input aria-label="From business day" type="date" style={inputStyle} value={filter.fromDay ?? ''} onChange={(e) => setFilter({ ...filter, fromDay: e.target.value })} />
            <input aria-label="To business day" type="date" style={inputStyle} value={filter.toDay ?? ''} onChange={(e) => setFilter({ ...filter, toDay: e.target.value })} />
            <TextInput value={filter.text ?? ''} onChange={(v) => setFilter({ ...filter, text: v })} placeholder="Reference or ID" />
          </div>
        }>
          {withdrawals === null ? <TableSkeleton rows={4} cols={6} /> : shown.length === 0 ? <div style={muted}>{filter.status === 'open' ? 'No withdrawal needs action.' : 'No withdrawals match.'}</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Requested</th><th>Supplier</th><th>Amount</th><th>Status</th><th>To</th><th>Reference</th><th></th></tr></thead>
                <tbody>
                  {shown.map((w) => (
                    <tr key={`${w.supplierId}/${w.id}`}>
                      <td>{when(w.createdAt)}<div style={muted}>Business day {String(w.businessDay ?? '—')}</div></td>
                      <td>{nameOf(w.supplierId)}</td>
                      <td>{pesewas(w.amountPesewas)}</td>
                      <td>
                        <b style={{ color: w.bridgeOutcome === 'unknown' && withdrawalStatus(w) === 'processing' ? 'var(--danger, #dc2626)' : 'inherit' }}>{WITHDRAWAL_STATUS_LABELS[withdrawalStatus(w)]}</b>
                        {withdrawalStatus(w) === 'processing' && <div style={muted}>{BRIDGE_OUTCOME_LABELS[String(w.bridgeOutcome)] ?? 'Request to Bridge in progress or not recorded'}</div>}
                      </td>
                      <td>{String(w.recipient?.method ?? '—')} <span style={mono}>{String(w.recipient?.maskedNumber ?? '')}</span><div style={muted}>{String(w.recipient?.accountName ?? '')}</div></td>
                      <td style={{ ...mono, fontSize: '12px' }}>{String(w.transactionId ?? '—')}</td>
                      <td><button style={buttonStyle(isSuper && withdrawalActions(w).length ? 'warning' : 'secondary')} onClick={() => openDetail(w)}>{isSuper && withdrawalActions(w).length ? 'Review' : 'Details'}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ ...muted, paddingTop: '6px' }}>Latest {WITHDRAWALS_PER_WALLET} withdrawals per supplier.</div>
            </div>
          )}
        </Card>
      </Panel>

      <Panel id="alerts" tab={tab}>
        <Card title="Payout alerts">
          {alertsError ? <Notice tone="danger">{alertsError}</Notice> : alerts === null ? <TableSkeleton rows={3} cols={4} /> : alerts.length === 0 ? <div style={muted}>No supplier payout alerts.</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Raised</th><th>Alert</th><th>Supplier</th><th>Withdrawal</th><th>Message</th></tr></thead>
                <tbody>
                  {alerts.map((a) => {
                    const w = (withdrawals ?? []).find((x) => x.id === a.withdrawalId && x.supplierId === a.supplierId)
                    return (
                      <tr key={a.id} style={{ opacity: a.resolved ? 0.6 : 1 }}>
                        <td>{when(a.createdAt)}<div style={muted}>{a.severity ?? ''}{a.resolved ? ' · resolved' : ''}</div></td>
                        <td>{WALLET_ALERT_LABELS[a.type ?? ''] ?? a.type}</td>
                        <td>{a.supplierId ? nameOf(a.supplierId) : '—'}</td>
                        <td>{w ? <button style={buttonStyle('secondary')} onClick={() => { openTab('withdrawals'); openDetail(w) }}>{WITHDRAWAL_STATUS_LABELS[withdrawalStatus(w)]}</button> : <span style={mono}>{a.withdrawalId ?? '—'}</span>}</td>
                        <td style={{ fontSize: '12px' }}>{a.message}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </Panel>

      <Panel id="reconciliation" tab={tab}>
        <Card title="Wallet reconciliation" actions={
          <select aria-label="Supplier to reconcile" style={inputStyle} value={reconSupplier} onChange={(e) => runReconciliation(e.target.value)}>
            <option value="">Choose a supplier</option>
            {Object.keys(wallets).map((sid) => <option key={sid} value={sid}>{nameOf(sid)}</option>)}
          </select>
        }>
          <div style={{ ...muted, marginBottom: '8px' }}>Read-only. Compares credited statements, wallet credits, the wallet, withdrawals and ledger rows. A failing check is for a person to investigate; nothing repairs a wallet automatically.</div>
          {Object.entries(wallets).map(([sid, w]) => { const p = walletProblem(w); return p ? <Notice key={sid} tone="danger">{nameOf(sid)}: {p}. Withdrawals are paused for this supplier.</Notice> : null })}
          {reconError && <Notice tone="danger">{reconError}</Notice>}
          {reconSupplier && !recon && !reconError && <TableSkeleton rows={4} cols={3} />}
          {recon && (
            <table className="data-table">
              <thead><tr><th>Check</th><th>Result</th><th>Detail</th></tr></thead>
              <tbody>
                {recon.map((c) => (
                  <tr key={c.id}>
                    <td>{c.label}</td>
                    <td><b style={{ color: c.ok === false ? 'var(--danger, #dc2626)' : c.ok ? 'var(--accent-text)' : 'inherit' }}>{c.ok === null ? 'Not checked' : c.ok ? '✓' : '⚠ investigate'}</b></td>
                    <td style={{ fontSize: '12px' }}>{c.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </Panel>

      <Panel id="settings" tab={tab}>
        <Card title="Payout switch and limits">
          {!settings ? <TableSkeleton rows={3} cols={2} /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <KeyValue k="Withdrawals" v={settings.enabled ? 'On' : 'Off'} />
              <KeyValue k="Minimum per withdrawal" v={settings.limits ? formatPesewas(settings.limits.minPesewas) : 'Not set'} />
              <KeyValue k="Maximum per withdrawal" v={settings.limits ? formatPesewas(settings.limits.maxPesewas) : 'Not set'} />
              <KeyValue k="Daily limit per supplier (Ghana day)" v={settings.limits ? formatPesewas(settings.limits.dailyPesewas) : 'Not set'} />
              {!settings.limits && <Notice tone="warning">Limits are missing or invalid, so every withdrawal is refused even with the switch on. All three are needed, with minimum ≤ maximum ≤ daily.</Notice>}
              <div style={muted}>Read-only here. Only a super admin can change settings/gas_supplier_payouts (Firestore rules), and production values need the owner&apos;s approval.</div>
            </div>
          )}
        </Card>
      </Panel>

      {detail && (
        <Modal title={`Withdrawal ${String(detail.transactionId ?? detail.id)}`} onClose={() => setDetail(null)} width={720} footer={
          isSuper && action
            ? <button style={buttonStyle(action === 'reject' || action === 'confirm_failed' ? 'danger' : 'primary', busy || !!problem)} disabled={busy || !!problem} onClick={run}>{ACTION_LABELS[action]}</button>
            : undefined
        }>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <KeyValue k="Supplier" v={nameOf(detail.supplierId)} />
            <KeyValue k="Amount" v={pesewas(detail.amountPesewas)} />
            <KeyValue k="Status" v={`${WITHDRAWAL_STATUS_LABELS[withdrawalStatus(detail)]}${withdrawalStatus(detail) === 'processing' ? ` · ${BRIDGE_OUTCOME_LABELS[String(detail.bridgeOutcome)] ?? 'request to Bridge not recorded'}` : ''}`} />
            <KeyValue k="Pays to (registered when requested)" v={`${String(detail.recipient?.method ?? '—')} ${String(detail.recipient?.maskedNumber ?? '')} · ${String(detail.recipient?.accountName ?? '')}`} />
            <KeyValue k="Reference sent to Bridge" v={<span style={mono}>{String(detail.transactionId ?? '—')}</span>} />
            <KeyValue k="Requested" v={`${when(detail.createdAt)} · business day ${String(detail.businessDay ?? '—')}`} />
            {detail.approvedAt != null && <KeyValue k="Approved" v={`${when(detail.approvedAt)} by ${String(detail.approvedByEmail ?? detail.approvedBy ?? '—')}`} />}
            {detail.sentAt != null && <KeyValue k="Sent to Bridge" v={when(detail.sentAt)} />}
            {detail.bridgeCode != null && <KeyValue k="Bridge response code" v={<span style={mono}>{String(detail.bridgeCode)}</span>} />}
            {detail.sendError != null && <KeyValue k="Send error" v={String(detail.sendError)} />}
            {detail.paidAt != null && <KeyValue k="Paid" v={`${when(detail.paidAt)} by ${String(detail.paidByEmail ?? '—')} · reference ${String(detail.paymentReference ?? '—')}`} />}
            {detail.rejectedAt != null && <KeyValue k="Rejected" v={`${when(detail.rejectedAt)} by ${String(detail.rejectedByEmail ?? '—')} · ${String(detail.rejectionReason ?? '')}`} />}
            {detail.failedAt != null && <KeyValue k="Failed" v={`${when(detail.failedAt)} by ${String(detail.failedByEmail ?? '—')} · ${String(detail.failureReason ?? '')}`} />}
          </div>
          <div style={{ marginTop: '12px' }}>
            <b style={{ fontSize: '13px' }}>Audit trail</b>
            {detailAudit === null ? <TableSkeleton rows={2} cols={3} /> : detailAudit.length === 0 ? <div style={muted}>No audit entries readable.</div> : (
              <ul style={{ fontSize: '12px', margin: '6px 0 0 16px' }}>
                {detailAudit.map((a) => <li key={a.id}>{when(a.createdAt)} · {a.action?.replace('gas_supplier_withdrawal_', '').replace(/_/g, ' ')} · {a.actorEmail ?? a.actorUid ?? '—'}{a.paymentReference ? ` · ${a.paymentReference}` : ''}{a.reason ? ` · ${a.reason}` : ''}</li>)}
              </ul>
            )}
          </div>
          {isSuper && withdrawalActions(detail).length > 0 && (
            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {withdrawalActions(detail).map((a) => (
                  <button key={a} style={buttonStyle(action === a ? (a === 'reject' || a === 'confirm_failed' ? 'danger' : 'primary') : 'secondary', busy)} disabled={busy} onClick={() => setAction(a)}>
                    {a === 'approve' && withdrawalStatus(detail) === 'approved' ? 'Send payment again (it never left CTSGo)' : ACTION_LABELS[a]}
                  </button>
                ))}
              </div>
              {action === 'approve' && <Notice>Check the amount and the number above with the supplier&apos;s request. Approving sends the payment to Bridge once.</Notice>}
              {action === 'confirm_paid' && <Notice tone="warning">Confirm only once Bridge shows the payment as completed.</Notice>}
              {action === 'confirm_failed' && <Notice tone="warning">Confirm only once Bridge shows the payment did not go through. The amount returns to the supplier&apos;s available balance.</Notice>}
              {(action === 'reject' || action === 'confirm_failed') && (
                <Field label="Reason" hint={action === 'reject' ? 'Required. Shown to the supplier.' : 'Required: what Bridge confirmed.'}>
                  <TextArea value={form.reason} onChange={(v) => setForm({ ...form, reason: v })} />
                </Field>
              )}
              {action === 'confirm_paid' && (
                <Field label="Payment reference" hint="Required: Bridge's reference or statement line for this payment.">
                  <TextInput value={form.paymentReference} onChange={(v) => setForm({ ...form, paymentReference: v })} />
                </Field>
              )}
              {problem && (form.reason || form.paymentReference) && <div style={muted}>{problem}</div>}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
