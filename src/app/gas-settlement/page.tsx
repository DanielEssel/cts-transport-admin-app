'use client'
// Gas supplier settlement review: the server-written settlement ledger,
// daily statements and commission terms versions (admins may read). Actions
// go through the super-admin callables in gas_settlement_ledger.js:
// propose / approve / reject commission terms (approval by a different
// super admin), reverse entitlements, prepare statements; and through
// gas_supplier_payouts.js (behind settings/gas_supplier_payouts): send a
// supplier statement's Mobile Money payout, record Bridge's confirmed result
// (the only way a payout becomes paid), credit a driver statement to the
// driver's wallet.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'
import { db, functions } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import { TableSkeleton } from '@/components/shared'
import { Card, Field, Modal, Notice, Select, TextArea, TextInput, buttonStyle } from '@/components/features/gas-suppliers/ui'
import {
  PAYOUT_OUTCOME_LABELS, SETTLEMENT_STAGE_LABELS, canApproveTerms, checkStatement, formatBps, formatPesewas, gasLoadError, isClosedBusinessDate,
  orderReconciles, parseTermsProposal, payoutEvidenceOk, payoutStatusLabel, settlementStage, statementPayoutAction, summarizeLedger, termsProposalProblem,
} from '@/lib/gas-supplier-ops'

interface Entry { id: string; orderId: string; party: string; partyId: string; kind: string; amountPesewas: unknown; businessDate: string; reversesEntryId?: string; basis?: any }
interface Statement {
  id: string; businessDate: string; party: string; partyId: string; lines?: Array<{ entryId?: string; amountPesewas: unknown }>; netPesewas?: unknown; status?: string; payoutStatus?: string
  payout?: { outcome?: string; transactionId?: string; maskedNumber?: string; accountName?: string; network?: string; attempt?: number; resolutionEvidence?: string } | null
}
interface TermsVersion { id: string; version?: number; status?: string; rateBps?: number; termsReference?: string; settlementHoldHours?: number; proposedBy?: string; proposedByEmail?: string; approvedBy?: string; approvedByEmail?: string; rejectReason?: string }

const TERMS_STATUS_LABELS: Record<string, string> = { proposed: 'Proposed · awaiting a second super admin', approved: 'Approved · current', superseded: 'Superseded', rejected: 'Rejected' }

const callError = (e: any) => e?.message || 'The request failed.'

export default function GasSettlementPage() {
  const { admin } = useAuth()
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [versions, setVersions] = useState<TermsVersion[]>([])
  const [proposal, setProposal] = useState({ rateBps: '', termsReference: '', settlementHoldHours: '' })
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [statements, setStatements] = useState<Statement[] | null>(null)
  const [terms, setTerms] = useState<Record<string, any> | null | undefined>(undefined)
  const [snapshots, setSnapshots] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [date, setDate] = useState('')
  const [reversing, setReversing] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [resolving, setResolving] = useState<Statement | null>(null)
  const [outcome, setOutcome] = useState<'paid' | 'failed' | ''>('')
  const [evidence, setEvidence] = useState('')

  const load = useCallback(async () => {
    setError(null)
    try {
      const [e, s, t] = await Promise.all([
        getDocs(query(collection(db, 'gas_settlement_ledger'), orderBy('businessDate', 'desc'), limit(300))),
        getDocs(query(collection(db, 'gas_settlement_statements'), orderBy('businessDate', 'desc'), limit(100))),
        getDocs(collection(db, 'gas_commission_terms')),
      ])
      const list = e.docs.map((d) => ({ id: d.id, ...d.data() }) as Entry)
      setEntries(list)
      setStatements(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Statement))
      const current = t.docs.find((d) => d.id === 'current')
      setTerms(current ? current.data() : null)
      setVersions(t.docs.filter((d) => d.id !== 'current').map((d) => ({ id: d.id, ...d.data() }) as TermsVersion)
        .sort((a, b) => (b.version ?? 0) - (a.version ?? 0)))
      // Each order's snapshot total, to check its posted split.
      const ids = [...new Set(list.map((x) => x.orderId))]
      const totals: Record<string, number> = {}
      await Promise.all(ids.map(async (id) => {
        const o = await getDoc(doc(db, 'gas_supplier_orders', id))
        const t = o.data()?.priceSnapshot?.total
        if (typeof t === 'number') totals[id] = t
      }))
      setSnapshots(totals)
    } catch (e: any) {
      setEntries([]); setStatements([])
      setError(gasLoadError(e, 'gas_settlement_ledger, gas_settlement_statements and gas_commission_terms', 'the Gas settlement collections'))
    }
  }, [])
  useEffect(() => { load() }, [load])

  const byOrder = useMemo(() => {
    const m = new Map<string, Entry[]>()
    for (const e of entries ?? []) m.set(e.orderId, [...(m.get(e.orderId) ?? []), e])
    return [...m.entries()]
  }, [entries])
  const totals = useMemo(() => summarizeLedger(entries ?? []), [entries])
  // Which statement claimed each entry (from the statements' own lines).
  const claimedBy = useMemo(() => {
    const m = new Map<string, Statement>()
    for (const st of statements ?? []) for (const l of st.lines ?? []) if (l.entryId) m.set(l.entryId, st)
    return m
  }, [statements])
  const reversedIds = useMemo(() => new Set((entries ?? []).filter((e) => e.kind === 'reversal').map((e) => e.reversesEntryId)), [entries])
  const stageOf = (e: Entry) => settlementStage(e, { reversed: reversedIds.has(e.id), claimed: claimedBy.has(e.id), statementPayoutStatus: claimedBy.get(e.id)?.payoutStatus })
  const drivers = useMemo(() => {
    const m = new Map<string, Entry[]>()
    for (const e of entries ?? []) if (e.party === 'driver') m.set(e.partyId, [...(m.get(e.partyId) ?? []), e])
    return [...m.entries()]
  }, [entries])

  const proposalProblem = termsProposalProblem(proposal)
  async function propose() {
    setBusy(true)
    try {
      const r: any = (await httpsCallable(functions, 'adminProposeGasCommissionTerms')(parseTermsProposal(proposal))).data
      toast.success(`Version ${r.version} proposed. A different super admin must approve it before it applies.`)
      setProposal({ rateBps: '', termsReference: '', settlementHoldHours: '' }); await load()
    } catch (e) { toast.error(callError(e)) } finally { setBusy(false) }
  }
  async function decide(termsId: string, decision: 'approve' | 'reject') {
    setBusy(true)
    try {
      await httpsCallable(functions, 'adminDecideGasCommissionTerms')(decision === 'approve' ? { termsId, decision } : { termsId, decision, reason: reason.trim() })
      toast.success(decision === 'approve' ? `${termsId} approved and current. It applies to orders created from now on.` : `${termsId} rejected.`)
      setRejecting(null); setReason(''); await load()
    } catch (e) { toast.error(callError(e)) } finally { setBusy(false) }
  }

  async function prepare() {
    setBusy(true)
    try {
      const r: any = (await httpsCallable(functions, 'adminPrepareGasSettlementStatements')({ businessDate: date })).data
      toast.success(`${r.statements?.length ?? 0} statement(s) prepared${r.exceptions?.length ? `, ${r.exceptions.length} order(s) left out for review` : ''}.`)
      await load()
    } catch (e) { toast.error(callError(e)) } finally { setBusy(false) }
  }

  async function sendPayout(s: Statement) {
    if (!window.confirm(`Send ${formatPesewas(s.netPesewas as number)} by Mobile Money to supplier ${s.partyId}? This sends real money through Bridge and cannot be undone.`)) return
    setBusy(true)
    try {
      await httpsCallable(functions, 'adminApproveGasSupplierPayout')({ statementId: s.id })
      toast.success('Payout accepted by Bridge. Confirm it with Bridge, then record the result.')
    } catch (e) { toast.error(callError(e)) } finally { setBusy(false); await load() }
  }

  async function recordResult() {
    if (!resolving || !outcome) return
    setBusy(true)
    try {
      await httpsCallable(functions, 'adminResolveGasSupplierPayout')({ statementId: resolving.id, outcome, evidence: evidence.trim() })
      toast.success(outcome === 'paid' ? 'Recorded as paid.' : 'Recorded as not paid. It can be sent again.')
      setResolving(null); setOutcome(''); setEvidence(''); await load()
    } catch (e) { toast.error(callError(e)) } finally { setBusy(false) }
  }

  async function creditDriver(s: Statement) {
    if (!window.confirm(`Credit ${formatPesewas(s.netPesewas as number)} to driver ${s.partyId}'s wallet?`)) return
    setBusy(true)
    try {
      await httpsCallable(functions, 'adminSettleGasDriverStatement')({ statementId: s.id })
      toast.success('Credited to the driver wallet.')
      await load()
    } catch (e) { toast.error(callError(e)) } finally { setBusy(false) }
  }

  async function reverse() {
    if (!reversing) return
    setBusy(true)
    try {
      await httpsCallable(functions, 'adminReverseGasSupplierEntitlements')({ orderId: reversing, reason: reason.trim() })
      toast.success('Reversal entries added (ledger only; the customer is not refunded).')
      setReversing(null); setReason(''); await load()
    } catch (e) { toast.error(callError(e)) } finally { setBusy(false) }
  }

  const termsOk = terms && terms.active === true && Number.isInteger(terms.rateBps) && typeof terms.termsReference === 'string' && terms.termsReference && terms.approvedBy
    && terms.commissionBase === 'product_subtotal' && terms.handlingFeeCommissionable === false && terms.deliveryFeeCommissionable === false
  const isSuper = admin?.role === 'super_admin'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>Gas settlement</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Supplier entitlements, driver delivery fees and CTSGo commission, from the append-only settlement ledger.</p>
        </div>
        <button style={buttonStyle('secondary')} onClick={() => { setEntries(null); load() }}><RefreshCw size={14} /> Refresh</button>
      </div>

      <Notice tone="warning">
        Payouts move real money and work only while settings/gas_supplier_payouts is switched on. A supplier payout is paid only when you
        record Bridge&apos;s confirmation; a Bridge acceptance alone is not a payment. Never send again a payout Bridge has not confirmed.
      </Notice>
      {error && <Notice tone="danger">{error}</Notice>}

      <Card title="Commission terms">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
          {terms === undefined ? 'Loading…' : !terms ? (
            <Notice tone="warning">No commission terms are current. Supplier orders cannot be quoted, created or paid until a version is proposed and approved by a second super admin.</Notice>
          ) : (
            <div>
              <strong>{termsOk ? 'Current and usable' : 'Current but not usable'}</strong> · version {String(terms.version ?? '—')} · {formatBps(terms.rateBps)} of the product subtotal ·
              handling and delivery fees not commissionable · reference {String(terms.termsReference ?? '—')} · hold {String(terms.settlementHoldHours ?? '—')} h ·
              approved by {String(terms.approvedByEmail ?? terms.approvedBy ?? '—')}
            </div>
          )}
          <div style={{ color: 'var(--text-tertiary)' }}>
            Commission is deducted from the supplier&apos;s product proceeds at settlement. It is never added to the customer&apos;s price and never taken from the driver&apos;s delivery fee.
            Each order keeps the version that was current when it was created.
          </div>
          {versions.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Version</th><th>Rate</th><th>Reference</th><th>Hold</th><th>Status</th><th>Proposed by</th><th>Decided by</th><th /></tr></thead>
                <tbody>
                  {versions.map((v) => (
                    <tr key={v.id}>
                      <td>{v.id}</td>
                      <td>{formatBps(v.rateBps)}</td>
                      <td>{v.termsReference ?? '—'}</td>
                      <td>{v.settlementHoldHours ?? '—'} h</td>
                      <td>{TERMS_STATUS_LABELS[v.status ?? ''] ?? v.status}{v.rejectReason ? ` (${v.rejectReason})` : ''}</td>
                      <td>{v.proposedByEmail ?? v.proposedBy ?? '—'}</td>
                      <td>{v.approvedByEmail ?? v.approvedBy ?? '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {isSuper && v.status === 'proposed' && (
                          <>
                            <button style={buttonStyle('primary', busy || !canApproveTerms(v, admin?.uid))} disabled={busy || !canApproveTerms(v, admin?.uid)}
                              title={canApproveTerms(v, admin?.uid) ? undefined : 'A different super admin must approve terms you proposed.'}
                              onClick={() => decide(v.id, 'approve')}>Approve</button>{' '}
                            <button style={buttonStyle('secondary', busy)} disabled={busy} onClick={() => { setRejecting(v.id); setReason('') }}>Reject…</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {isSuper && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Field label="Rate (basis points)" hint="Agreed with the supplier. 1000 = 10%; 0 is allowed.">
                <TextInput value={proposal.rateBps} onChange={(v) => setProposal({ ...proposal, rateBps: v })} placeholder="e.g. 1000" />
              </Field>
              <Field label="Terms reference" hint="The signed agreement or approval record.">
                <TextInput value={proposal.termsReference} onChange={(v) => setProposal({ ...proposal, termsReference: v })} />
              </Field>
              <Field label="Settlement hold (hours)" hint="After delivery, before an entitlement is eligible.">
                <TextInput value={proposal.settlementHoldHours} onChange={(v) => setProposal({ ...proposal, settlementHoldHours: v })} />
              </Field>
              <button style={buttonStyle('secondary', busy || !!proposalProblem)} disabled={busy || !!proposalProblem} title={proposalProblem ?? undefined} onClick={propose}>Propose version</button>
            </div>
          )}
        </div>
      </Card>

      <Card title="Ledger by order" actions={entries && <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
        Supplier {formatPesewas(totals.byParty.supplier ?? 0)} · Drivers {formatPesewas(totals.byParty.driver ?? 0)} · CTSGo {formatPesewas(totals.byParty.platform ?? 0)}
        {totals.rejected ? ` · ${totals.rejected} unreadable` : ''}
      </span>}>
        {entries === null ? <TableSkeleton rows={4} cols={6} /> : byOrder.length === 0 ? <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>No entries posted yet.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Order</th><th>Date</th><th>Supplier net</th><th>Driver</th><th>CTSGo commission</th><th>Stage</th><th>Reconciles</th><th /></tr></thead>
              <tbody>
                {byOrder.map(([orderId, list]) => {
                  const sum = summarizeLedger(list).byParty
                  const total = snapshots[orderId]
                  const ok = typeof total === 'number' && orderReconciles(list, total)
                  const reversed = list.some((e) => e.kind === 'reversal')
                  return (
                    <tr key={orderId}>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{orderId.slice(0, 10)}</td>
                      <td>{list[0].businessDate}</td>
                      <td>{formatPesewas(sum.supplier ?? 0)}</td>
                      <td>{formatPesewas(sum.driver ?? 0)}</td>
                      <td>{formatPesewas(sum.platform ?? 0)}</td>
                      <td>{(() => { const sup = list.find((e) => e.party === 'supplier' && e.kind === 'entitlement'); return sup ? SETTLEMENT_STAGE_LABELS[stageOf(sup)] : '—' })()}</td>
                      <td style={{ color: ok ? 'inherit' : 'var(--danger, #dc2626)' }}>{reversed ? 'Reversed' : ok ? 'Yes' : 'No: check'}</td>
                      <td>{!reversed && <button style={buttonStyle('secondary')} onClick={() => setReversing(orderId)}>Reverse…</button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Driver delivery entitlements" actions={<span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Delivery fees only; commission never reduces them</span>}>
        {entries === null ? <TableSkeleton rows={2} cols={3} /> : drivers.length === 0 ? <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>No driver entitlements posted yet.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Driver</th><th>Orders</th><th>Net (after reversals)</th></tr></thead>
              <tbody>
                {drivers.map(([driverId, list]) => (
                  <tr key={driverId}>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{driverId}</td>
                    <td>{new Set(list.map((e) => e.orderId)).size}</td>
                    <td>{formatPesewas(summarizeLedger(list).byParty.driver ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Daily statements" actions={
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <TextInput value={date} onChange={setDate} placeholder="YYYY-MM-DD" />
          <button style={buttonStyle('primary', busy || !isClosedBusinessDate(date, Date.now()))} disabled={busy || !isClosedBusinessDate(date, Date.now())} onClick={prepare}>Prepare</button>
        </div>
      }>
        {statements === null ? <TableSkeleton rows={3} cols={5} /> : statements.length === 0 ? <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>No statements prepared.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Date</th><th>Party</th><th>Lines</th><th>Net (from lines)</th><th>Payout</th><th></th></tr></thead>
              <tbody>
                {statements.map((s) => {
                  const c = checkStatement(s)
                  const action = statementPayoutAction(s)
                  return (
                    <tr key={s.id}>
                      <td>{s.businessDate}</td>
                      <td>{s.party} · <span style={{ fontFamily: 'var(--font-mono)' }}>{s.partyId}</span></td>
                      <td>{s.lines?.length ?? 0}</td>
                      <td style={{ color: c.reconciles ? 'inherit' : 'var(--danger, #dc2626)' }}>{c.netPesewas == null ? '—' : formatPesewas(c.netPesewas)}{c.reconciles ? '' : ' (stored net differs)'}</td>
                      <td>
                        {payoutStatusLabel(s.payoutStatus)}
                        {s.payout?.outcome && <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{PAYOUT_OUTCOME_LABELS[s.payout.outcome] ?? s.payout.outcome}{s.payout.transactionId ? ` · ${s.payout.transactionId}` : ''}{s.payout.maskedNumber ? ` · ${s.payout.network} ${s.payout.maskedNumber}` : ''}</div>}
                      </td>
                      <td>
                        {isSuper && c.reconciles && action === 'send_mobile_money' && <button style={buttonStyle('primary', busy)} disabled={busy} onClick={() => sendPayout(s)}>{s.payoutStatus === 'failed' ? 'Send again' : 'Send Mobile Money'}</button>}
                        {isSuper && action === 'record_result' && <button style={buttonStyle('warning', busy)} disabled={busy} onClick={() => { setResolving(s); setOutcome(''); setEvidence('') }}>Record Bridge result</button>}
                        {isSuper && c.reconciles && action === 'credit_driver_wallet' && <button style={buttonStyle('primary', busy)} disabled={busy} onClick={() => creditDriver(s)}>Credit driver wallet</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {resolving && (
        <Modal title={`Record the Bridge result for ${resolving.id}`} onClose={() => setResolving(null)} footer={
          <button style={buttonStyle(outcome === 'paid' ? 'primary' : 'danger', busy || !outcome || !payoutEvidenceOk(evidence))} disabled={busy || !outcome || !payoutEvidenceOk(evidence)} onClick={recordResult}>Record</button>
        }>
          <Notice>Transaction {resolving.payout?.transactionId ?? '—'} · {formatPesewas(resolving.netPesewas as number)} to {resolving.payout?.accountName ?? resolving.partyId} ({resolving.payout?.network} {resolving.payout?.maskedNumber}). Confirm the result with Bridge first.</Notice>
          <Field label="Result confirmed by Bridge" hint="Paid: the supplier received it. Failed: Bridge confirms it was not paid; it can then be sent again.">
            <Select<'paid' | 'failed'> value={outcome || undefined} onChange={setOutcome} placeholder="Choose" options={['paid', 'failed'] as const} />
          </Field>
          <Field label="Evidence from Bridge" hint="Required: Bridge's reference, statement line or support ticket.">
            <TextInput value={evidence} onChange={setEvidence} />
          </Field>
        </Modal>
      )}

      {rejecting && (
        <Modal title={`Reject commission terms ${rejecting}`} onClose={() => setRejecting(null)} footer={
          <button style={buttonStyle('danger', busy || reason.trim().length < 3)} disabled={busy || reason.trim().length < 3} onClick={() => decide(rejecting, 'reject')}>Reject</button>
        }>
          <Field label="Reason" hint="Required. The version stays on record as rejected and can never be approved.">
            <TextArea value={reason} onChange={setReason} />
          </Field>
        </Modal>
      )}

      {reversing && (
        <Modal title={`Reverse order ${reversing}`} onClose={() => setReversing(null)} footer={
          <button style={buttonStyle('danger', busy || reason.trim().length < 3)} disabled={busy || reason.trim().length < 3} onClick={reverse}>Add reversal entries</button>
        }>
          <Notice tone="warning">A reversal corrects the settlement ledger only. It does not refund the customer: no money moves. There is no automatic refund after delivery.</Notice>
          <Field label="Reason" hint="Required. Reversals are appended; the original entries are never changed. Super admins only.">
            <TextArea value={reason} onChange={setReason} />
          </Field>
        </Modal>
      )}
    </div>
  )
}
