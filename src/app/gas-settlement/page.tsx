'use client'
// Gas supplier settlement review: the server-written settlement ledger,
// daily statements and commission terms versions (admins may read). Actions
// go through the super-admin callables in gas_settlement_ledger.js:
// propose / approve / reject commission terms (approval by a different
// super admin), reverse entitlements, prepare statements; and through
// gas_supplier_payouts.js (behind settings/gas_supplier_payouts): send a
// supplier statement's Mobile Money payout, record Bridge's confirmed result
// (the only way a payout becomes paid), credit a driver statement to the
// driver's wallet. Reversals of settled entries become debts
// (gas_settlement_debts), resolved only through adminResolveGasSettlementDebt;
// a driver's wallet credit is shown as credited, never as a payout.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'
import { db, functions } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import { TableSkeleton } from '@/components/shared'
import { Card, Field, Modal, Notice, Select, TextArea, TextInput, buttonStyle, inputStyle } from '@/components/features/gas-suppliers/ui'
import {
  PAYOUT_OUTCOME_LABELS, SETTLEMENT_STAGE_LABELS, canApproveTerms, checkStatement, debtBlocked, debtChoices, debtEvidenceRequired, debtLiveStage, debtResolutionLabel, deliveryModeLabel, formatBps,
  formatPesewas, gasLoadError, isClosedBusinessDate, orderModeReconciles, orderReconciles, parseTermsProposal, payoutEvidenceOk, payoutStatusLabel, splitTermsDocs, termsUsable,
  partyReconciles, riderPaymentSummary, settlementRefusal, settlementStage, statementPayoutAction, summarizeLedger, termsProposalProblem, type DebtChoice,
} from '@/lib/gas-supplier-ops'

interface Entry { id: string; orderId: string; party: string; partyId: string; kind: string; amountPesewas: unknown; businessDate: string; reversesEntryId?: string; basis?: any }
interface Statement {
  id: string; businessDate: string; party: string; partyId: string; lines?: Array<{ entryId?: string; amountPesewas: unknown }>; netPesewas?: unknown; status?: string; payoutStatus?: string
  payoutMethod?: string; withheldPesewas?: unknown; payablePesewas?: unknown
  payout?: { outcome?: string; transactionId?: string; maskedNumber?: string; accountName?: string; network?: string; attempt?: number; resolutionEvidence?: string } | null
}
interface TermsVersion { id: string; version?: number; status?: string; supplierId?: string; rateBps?: number; termsReference?: string; settlementHoldHours?: number; proposedBy?: string; proposedByEmail?: string; approvedBy?: string; approvedByEmail?: string; rejectReason?: string }

const TERMS_STATUS_LABELS: Record<string, string> = { proposed: 'Proposed · awaiting a second super admin', approved: 'Approved · current', superseded: 'Superseded', rejected: 'Rejected' }

interface Debt {
  id: string; party: string; partyId: string; orderId: string; reversalEntryId?: string; statementId?: string | null; amountPesewas: unknown
  stage?: string; status?: string; version?: number; proposal?: { by?: string; byEmail?: string; resolution?: string; reason?: string; evidence?: string } | null
  resolution?: string; reason?: string
}
interface OrderInfo { total?: number; deliveryMode: string | null; driverId: string | null; linkedSupplierId: string | null }
interface WithdrawalRow { status?: string; payoutOutcome?: string; amount?: unknown }

// A refusal with a known reason is shown in plain words.
const callError = (e: any) => settlementRefusal(e?.details?.reason) ?? (e?.message || 'The request failed.')
/** What a statement pays: payable (after any withheld debt), else net. */
const isPesewasValue = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v)
const payableOf = (s: Statement) => s.payablePesewas ?? s.netPesewas

export default function GasSettlementPage() {
  const { admin } = useAuth()
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [versions, setVersions] = useState<TermsVersion[]>([])
  const [proposal, setProposal] = useState({ rateBps: '', termsReference: '', settlementHoldHours: '', supplierId: '' })
  const [supplierTerms, setSupplierTerms] = useState<Record<string, Record<string, any>>>({})
  const [supplierNames, setSupplierNames] = useState<Record<string, string>>({})
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [statements, setStatements] = useState<Statement[] | null>(null)
  const [terms, setTerms] = useState<Record<string, any> | null | undefined>(undefined)
  const [orders, setOrders] = useState<Record<string, OrderInfo>>({})
  const [debts, setDebts] = useState<Debt[] | null>(null)
  const [debtStatements, setDebtStatements] = useState<Record<string, Statement | null>>({})
  const [withdrawals, setWithdrawals] = useState<Record<string, WithdrawalRow[]>>({})
  const [driverData, setDriverData] = useState<Record<string, { entries: Entry[]; statements: Statement[]; debts: Debt[] }>>({})
  const [debtNotice, setDebtNotice] = useState<string | null>(null)
  const [deciding, setDeciding] = useState<{ debt: Debt; choice: DebtChoice } | null>(null)
  const [debtReason, setDebtReason] = useState('')
  const [debtEvidence, setDebtEvidence] = useState('')
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
      const [e, s, t, sup] = await Promise.all([
        getDocs(query(collection(db, 'gas_settlement_ledger'), orderBy('businessDate', 'desc'), limit(300))),
        getDocs(query(collection(db, 'gas_settlement_statements'), orderBy('businessDate', 'desc'), limit(100))),
        getDocs(collection(db, 'gas_commission_terms')),
        getDocs(collection(db, 'gas_suppliers')),
      ])
      setSupplierNames(Object.fromEntries(sup.docs.map((d) => [d.id, String(d.data().tradingName || d.data().legalName || d.id)])))
      const list = e.docs.map((d) => ({ id: d.id, ...d.data() }) as Entry)
      setEntries(list)
      setStatements(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Statement))
      // `current`: the platform default; `current_s_{supplierId}`: a supplier's own approved rate.
      const split = splitTermsDocs(t.docs.map((d) => ({ id: d.id, ...d.data() }) as TermsVersion & Record<string, any>))
      setTerms(split.platform)
      setSupplierTerms(split.suppliers)
      setVersions(split.versions.sort((a, b) => String(a.supplierId ?? '').localeCompare(String(b.supplierId ?? '')) || (b.version ?? 0) - (a.version ?? 0)))
      // Each order's snapshot total and delivery mode, to check its posted split and delivery party.
      const ids = [...new Set(list.map((x) => x.orderId))]
      const info: Record<string, OrderInfo> = {}
      await Promise.all(ids.map(async (id) => {
        const d = (await getDoc(doc(db, 'gas_supplier_orders', id))).data()
        const t = d?.priceSnapshot?.total
        info[id] = {
          total: typeof t === 'number' ? t : undefined, deliveryMode: typeof d?.deliveryMode === 'string' ? d.deliveryMode : null,
          driverId: typeof d?.driverId === 'string' ? d.driverId : null, linkedSupplierId: typeof d?.linkedSupplierId === 'string' ? d.linkedSupplierId : null,
        }
      }))
      setOrders(info)
      // Debts and each driver's withdrawals (the wallet is pooled, so these are per driver). A refused read must not hide the ledger.
      // Open debts are never limited, so a resolved backlog cannot hide one; recent history is capped.
      try {
        const [open, recent] = await Promise.all([
          getDocs(query(collection(db, 'gas_settlement_debts'), where('status', 'in', ['outstanding', 'resolution_proposed']))),
          getDocs(query(collection(db, 'gas_settlement_debts'), orderBy('createdAt', 'desc'), limit(100))).catch(() => null),
        ])
        const byId = new Map<string, Debt>()
        for (const x of recent?.docs ?? []) byId.set(x.id, { id: x.id, ...x.data() } as Debt)
        for (const x of open.docs) byId.set(x.id, { id: x.id, ...x.data() } as Debt)
        const all = [...byId.values()]
        // Each open debt's claiming statement, read fresh: its live payout status decides the debt's stage.
        const sts = new Map(s.docs.map((d) => [d.id, { id: d.id, ...d.data() } as Statement]))
        const byStatement: Record<string, Statement | null> = {}
        await Promise.all([...new Set(all.filter((d) => d.status !== 'resolved' && d.statementId).map((d) => d.statementId as string))].map(async (id) => {
          if (sts.has(id)) { byStatement[id] = sts.get(id) as Statement; return }
          try {
            const x = await getDoc(doc(db, 'gas_settlement_statements', id))
            byStatement[id] = x.exists() ? ({ id: x.id, ...x.data() } as Statement) : null
          } catch { /* unread: the stored stage is shown */ }
        }))
        setDebtStatements(byStatement)
        setDebts(all); setDebtNotice(null)
      } catch (e) {
        setDebts(null); setDebtNotice(gasLoadError(e, 'gas_settlement_debts', 'the settlement debts'))
      }
      const driverIds = [...new Set(list.filter((x) => x.party === 'driver').map((x) => x.partyId))]
      const wd: Record<string, WithdrawalRow[]> = {}
      await Promise.all(driverIds.map(async (id) => {
        try { wd[id] = (await getDocs(query(collection(db, 'withdrawals'), where('userId', '==', id)))).docs.map((x) => x.data() as WithdrawalRow) }
        catch { /* shown as unavailable below */ }
      }))
      setWithdrawals(wd)
      // Each driver's own entries and statements, uncapped, so "Earned, pending" never depends on the page's newest-first limits.
      const own: Record<string, { entries: Entry[]; statements: Statement[]; debts: Debt[] }> = {}
      await Promise.all(driverIds.map(async (id) => {
        try {
          const [le, ls, ld] = await Promise.all([
            getDocs(query(collection(db, 'gas_settlement_ledger'), where('partyId', '==', id))),
            getDocs(query(collection(db, 'gas_settlement_statements'), where('partyId', '==', id))),
            getDocs(query(collection(db, 'gas_settlement_debts'), where('partyId', '==', id))),
          ])
          own[id] = {
            entries: le.docs.map((x) => ({ id: x.id, ...x.data() }) as Entry).filter((x) => x.party === 'driver'),
            statements: ls.docs.map((x) => ({ id: x.id, ...x.data() }) as Statement).filter((x) => x.party === 'driver'),
            debts: ld.docs.map((x) => ({ id: x.id, ...x.data() }) as Debt).filter((x) => x.party === 'driver'),
          }
        } catch { /* falls back to the newest entries; marked partial below */ }
      }))
      setDriverData(own)
    } catch (e: any) {
      setEntries([]); setStatements([]); setDebts(null)
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
  const debtByEntry = useMemo(() => new Map((debts ?? []).filter((d) => d.reversalEntryId).map((d) => [d.reversalEntryId as string, d])), [debts])
  const stageOf = (e: Entry) => {
    const st = claimedBy.get(e.id)
    const debt = debtByEntry.get(e.id)
    return settlementStage(e, {
      reversed: reversedIds.has(e.id), claimed: !!st || !!debt, statementPayoutStatus: st?.payoutStatus, party: e.party, payoutMethod: st?.payoutMethod,
      debtStatus: debt ? (debt.status === 'resolved' ? 'resolved' : 'outstanding') : null,
    })
  }
  const drivers = useMemo(() => {
    const m = new Map<string, Entry[]>()
    for (const e of entries ?? []) if (e.party === 'driver') m.set(e.partyId, [...(m.get(e.partyId) ?? []), e])
    return [...m.entries()].map(([driverId, capped]) => {
      const full = driverData[driverId]
      const list = full?.entries ?? capped
      const mine = full?.statements ?? (statements ?? []).filter((st) => st.party === 'driver' && st.partyId === driverId)
      // The driver's own debts (uncapped) merged with the open ones, so an old resolved debt never drops out.
      const byId = new Map<string, Debt>()
      for (const d of (debts ?? []).filter((x) => x.party === 'driver' && x.partyId === driverId)) byId.set(d.id, d)
      for (const d of full?.debts ?? []) byId.set(d.id, d)
      const myDebts = [...byId.values()]
      // Claims: a statement's lines, and the debts that took reversals of settled entries.
      const claims = [
        ...mine.flatMap((st) => (st.lines ?? []).map((l) => ({ entryId: l.entryId }))),
        ...myDebts.map((d) => ({ entryId: d.reversalEntryId })),
      ]
      // A linked rider is tagged with their supplier (from the orders they delivered).
      const supplier = list.map((e) => orders[e.orderId]).find((o) => o?.deliveryMode === 'linked_rider')?.linkedSupplierId ?? null
      return {
        driverId, list, supplier, summary: riderPaymentSummary(list, claims, mine, myDebts, withdrawals[driverId] ?? []), wdKnown: driverId in withdrawals,
        partial: !full, rec: debts && full ? partyReconciles(list, claims, mine, myDebts) : null,
      }
    })
  }, [entries, statements, debts, orders, withdrawals, driverData])
  const openDebts = useMemo(() => (debts ?? []).filter((d) => d.status !== 'resolved'), [debts])
  const resolvedDebts = useMemo(() => (debts ?? []).filter((d) => d.status === 'resolved'), [debts])

  const proposalProblem = termsProposalProblem(proposal)
  async function propose() {
    setBusy(true)
    try {
      const r: any = (await httpsCallable(functions, 'adminProposeGasCommissionTerms')(parseTermsProposal(proposal))).data
      toast.success(`${r.termsId} proposed. A different super admin must approve it before it applies.`)
      setProposal({ rateBps: '', termsReference: '', settlementHoldHours: '', supplierId: '' }); await load()
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
    if (!window.confirm(`Send ${formatPesewas(payableOf(s) as number)} by Mobile Money to supplier ${s.partyId}? This sends real money through Bridge and cannot be undone.`)) return
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

  async function decideDebt() {
    if (!deciding) return
    const { debt, choice } = deciding
    setBusy(true)
    try {
      await httpsCallable(functions, 'adminResolveGasSettlementDebt')({
        debtId: debt.id, action: choice.action, ...(choice.resolution ? { resolution: choice.resolution } : {}), reason: debtReason.trim(),
        ...(debtEvidence.trim() ? { evidence: debtEvidence.trim() } : {}), expectedVersion: debt.version,
      })
      toast.success(choice.action === 'propose' ? 'Proposed. A different super admin must approve it.' : choice.action === 'reject' ? 'Proposal rejected.' : 'Debt resolved.')
      setDeciding(null); setDebtReason(''); setDebtEvidence('')
    } catch (e) { toast.error(callError(e)) } finally { setBusy(false); await load() }
  }

  async function creditDriver(s: Statement) {
    if (!window.confirm(`Credit ${formatPesewas(payableOf(s) as number)} to driver ${s.partyId}'s wallet? This adds to the wallet balance; it is not a Mobile Money payout.`)) return
    setBusy(true)
    try {
      await httpsCallable(functions, 'adminSettleGasDriverStatement')({ statementId: s.id })
      toast.success('Credited to the driver wallet. The driver can now withdraw it.')
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

  const termsOk = termsUsable(terms)
  const isSuper = admin?.role === 'super_admin'
  const debtFormOk = !!deciding && debtReason.trim().length >= 3 && (!debtEvidenceRequired(deciding.choice) || payoutEvidenceOk(debtEvidence))

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
            <Notice tone="warning">No platform commission terms are current. No supplier order can be quoted, created or paid (missing terms are never treated as 0%) until a version is proposed and approved by a second super admin.</Notice>
          ) : (
            <div>
              <strong>Platform default: {termsOk ? 'current and usable' : 'current but not usable'}</strong> · version {String(terms.version ?? '—')} · {formatBps(terms.rateBps)} of the product subtotal ·
              handling and delivery fees not commissionable · reference {String(terms.termsReference ?? '—')} · hold {String(terms.settlementHoldHours ?? '—')} h ·
              approved by {String(terms.approvedByEmail ?? terms.approvedBy ?? '—')}
            </div>
          )}
          <div style={{ color: 'var(--text-tertiary)' }}>
            Commission is deducted from the supplier&apos;s product proceeds at settlement. It is never added to the customer&apos;s price and never taken from the driver&apos;s delivery fee.
            Each order keeps the version that was current when it was created. A supplier with its own approved rate is charged that rate;
            every other supplier the platform default.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Supplier</th><th>Rate applied to new orders</th><th>Version</th><th>Reference</th></tr></thead>
              <tbody>
                {Object.entries(supplierNames).map(([id, name]) => {
                  const own = supplierTerms[id]
                  const ownOk = termsUsable(own, { supplier: true })
                  return (
                    <tr key={id}>
                      <td>{name}</td>
                      <td>{!termsOk ? 'None: no usable platform terms' : own ? (ownOk ? `${formatBps(own.rateBps)} (own rate)` : 'None: its own rate is not usable') : `${formatBps(terms?.rateBps)} (platform default)`}</td>
                      <td>{own ? String(own.termsId ?? '—') : terms ? String(terms.termsId ?? '—') : '—'}</td>
                      <td>{String((own ?? terms)?.termsReference ?? '—')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {versions.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Version</th><th>Applies to</th><th>Rate</th><th>Reference</th><th>Hold</th><th>Status</th><th>Proposed by</th><th>Decided by</th><th /></tr></thead>
                <tbody>
                  {versions.map((v) => (
                    <tr key={v.id}>
                      <td>{v.id}</td>
                      <td>{v.supplierId ? supplierNames[v.supplierId] ?? v.supplierId : 'Platform default'}</td>
                      <td>{formatBps(v.rateBps)}</td>
                      <td>{v.termsReference ?? '—'}</td>
                      <td>{v.supplierId ? 'platform' : `${v.settlementHoldHours ?? '—'} h`}</td>
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
              <Field label="Applies to" hint="The platform default, or one supplier's own agreed rate.">
                <select value={proposal.supplierId} onChange={(e) => setProposal({ ...proposal, supplierId: e.target.value })}
                  style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Platform default</option>
                  {Object.entries(supplierNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </Field>
              <Field label="Rate (basis points)" hint="1000 = 10% (the proposed CTSGo standard, not an agreement with any supplier); 0 is allowed.">
                <TextInput value={proposal.rateBps} onChange={(v) => setProposal({ ...proposal, rateBps: v })} placeholder="e.g. 1000" />
              </Field>
              <Field label="Terms reference" hint="The signed agreement or approval record.">
                <TextInput value={proposal.termsReference} onChange={(v) => setProposal({ ...proposal, termsReference: v })} />
              </Field>
              {!proposal.supplierId && (
                <Field label="Settlement hold (hours)" hint="After delivery, before an entitlement is eligible.">
                  <TextInput value={proposal.settlementHoldHours} onChange={(v) => setProposal({ ...proposal, settlementHoldHours: v })} />
                </Field>
              )}
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
              <thead><tr><th>Order</th><th>Date</th><th>Supplier net</th><th>Driver</th><th>CTSGo commission</th><th>Delivery</th><th>Stage</th><th>Reconciles</th><th /></tr></thead>
              <tbody>
                {byOrder.map(([orderId, list]) => {
                  const sum = summarizeLedger(list).byParty
                  const total = orders[orderId]?.total
                  const info = orders[orderId]
                  const modeOk = !!info && orderModeReconciles(info, list)
                  const ok = typeof total === 'number' && orderReconciles(list, total) && modeOk
                  const reversed = list.some((e) => e.kind === 'reversal')
                  return (
                    <tr key={orderId}>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{orderId.slice(0, 10)}</td>
                      <td>{list[0].businessDate}</td>
                      <td>{formatPesewas(sum.supplier ?? 0)}</td>
                      <td>{formatPesewas(sum.driver ?? 0)}</td>
                      <td>{formatPesewas(sum.platform ?? 0)}</td>
                      <td style={{ fontSize: '12px' }}>{deliveryModeLabel(info?.deliveryMode)}</td>
                      <td>{(() => { const sup = list.find((e) => e.party === 'supplier' && e.kind === 'entitlement'); return sup ? SETTLEMENT_STAGE_LABELS[stageOf(sup)] : '—' })()}</td>
                      <td style={{ color: ok ? 'inherit' : 'var(--danger, #dc2626)' }}>{reversed ? 'Reversed' : ok ? 'Yes' : typeof total === 'number' && orderReconciles(list, total) ? 'No: delivery party does not match the mode' : 'No: check'}</td>
                      <td>{!reversed && <button style={buttonStyle('secondary')} onClick={() => setReversing(orderId)}>Reverse…</button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Driver payments" actions={<span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Delivery fees only; commission never reduces them</span>}>
        {entries === null ? <TableSkeleton rows={2} cols={3} /> : drivers.length === 0 ? <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>No driver entitlements posted yet.</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
              Credited means added to the driver&apos;s CTSGo wallet; it is not a payout. Only a completed withdrawal is paid out. Withdrawal columns are per driver because the wallet is pooled. Reconciles: the driver's entries net of reversals equal pending + owed + credited, less debts.
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr>
                  <th>Driver</th><th>Orders</th><th>Earned, pending</th><th>Owed</th><th>Credited to wallet</th><th>Withdrawal requested</th>
                  <th>Sent, awaiting confirmation</th><th>Outcome unknown, unresolved</th><th>Paid out (confirmed)</th><th>Failed</th><th>Outstanding adjustments</th><th>Reconciles</th>
                </tr></thead>
                <tbody>
                  {drivers.map(({ driverId, list, supplier, summary: m, wdKnown, partial, rec }) => {
                    const wd = (n: number) => (wdKnown ? formatPesewas(n) : 'Unavailable')
                    return (
                      <tr key={driverId}>
                        <td><span style={{ fontFamily: 'var(--font-mono)' }}>{driverId}</span>{supplier && <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Linked rider · supplier {supplier}</div>}</td>
                        <td>{new Set(list.map((e) => e.orderId)).size}</td>
                        <td>{formatPesewas(m.earnedPending)}</td>
                        <td>{formatPesewas(m.owed)}</td>
                        <td>{formatPesewas(m.credited)}</td>
                        <td>{wd(m.withdrawalRequested)}</td>
                        <td>{wd(m.sentAwaitingConfirmation)}</td>
                        <td style={{ color: wdKnown && m.outcomeUnknown > 0 ? 'var(--danger, #dc2626)' : 'inherit' }}>{wd(m.outcomeUnknown)}</td>
                        <td>{wd(m.paidOutConfirmed)}</td>
                        <td>{wd(m.failed)}</td>
                        <td>{debts === null ? 'Unavailable' : formatPesewas(m.outstandingAdjustments)}</td>
                        <td title={rec ? (rec.ok ? undefined : rec.problems.join('\n')) : undefined}>{partial ? 'Partial data' : !rec ? 'Unavailable' : rec.ok ? '✓' : '⚠ check'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      <Card title="Outstanding debts" actions={<span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Reversals of entries already settled. Nothing is deducted from later earnings.</span>}>
        {debtNotice && <Notice tone="danger">{debtNotice}</Notice>}
        {debts === null && !debtNotice ? <TableSkeleton rows={2} cols={5} /> : debts === null ? <div style={{ fontSize: '13px' }}>Unavailable</div> : debts.length === 0 ? <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>No debts.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Debt</th><th>Party</th><th>Amount</th><th>Stage</th><th>Status</th><th /></tr></thead>
              <tbody>
                {[...openDebts, ...resolvedDebts].map((d) => {
                  // The claiming statement: null when there is none, undefined when it could not be read.
                  const st = d.statementId ? debtStatements[d.statementId] : null
                  const stage = d.status === 'resolved' ? d.stage : debtLiveStage(st, d.stage)
                  const blocked = d.status === 'resolved' ? null : debtBlocked(st)
                  const choices = isSuper ? debtChoices(d, admin?.uid, st) : []
                  return (
                    <tr key={d.id}>
                      <td><span style={{ fontFamily: 'var(--font-mono)' }}>{d.orderId.slice(0, 10)}</span><div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{d.reason ?? ''}</div></td>
                      <td>{d.party} · <span style={{ fontFamily: 'var(--font-mono)' }}>{d.partyId}</span></td>
                      <td>{isPesewasValue(d.amountPesewas) ? formatPesewas(d.amountPesewas) : '—'}</td>
                      <td>{stage === 'before_payout' ? 'Before payout' : 'After payout (money may have moved)'}</td>
                      <td>
                        {d.status === 'resolved' ? `Resolved: ${debtResolutionLabel(d.resolution)}` : d.status === 'resolution_proposed'
                          ? `Proposed: ${debtResolutionLabel(d.proposal?.resolution)} by ${d.proposal?.byEmail ?? d.proposal?.by ?? '—'}; a different super admin must decide` : 'Outstanding'}
                      </td>
                      <td style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {blocked && <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{blocked}</span>}
                        {choices.map((c) => (
                          <button key={`${c.action}-${c.resolution ?? ''}`} style={buttonStyle(c.action === 'reject' ? 'danger' : 'secondary', busy)} disabled={busy}
                            onClick={() => { setDeciding({ debt: d, choice: c }); setDebtReason(''); setDebtEvidence('') }}>{c.label}…</button>
                        ))}
                      </td>
                    </tr>
                  )
                })}
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
              <thead><tr><th>Date</th><th>Party</th><th>Lines</th><th>Net (from lines)</th><th>Payable</th><th>Payout</th><th></th></tr></thead>
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
                      <td>{typeof payableOf(s) === 'number' ? formatPesewas(payableOf(s) as number) : '—'}{Number(s.withheldPesewas) > 0 ? <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{formatPesewas(s.withheldPesewas as number)} withheld for a debt</div> : null}</td>
                      <td>
                        {payoutStatusLabel(s.payoutStatus, s.party, s.payoutMethod)}
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

      {deciding && (
        <Modal title={`${deciding.choice.label}: debt ${deciding.debt.id.slice(0, 18)}`} onClose={() => setDeciding(null)} footer={
          <button style={buttonStyle(deciding.choice.action === 'reject' ? 'danger' : 'primary', busy || !debtFormOk)} disabled={busy || !debtFormOk} onClick={decideDebt}>Confirm</button>
        }>
          <Notice tone="warning">
            {deciding.choice.action !== 'resolve'
              ? 'The payout may already have moved money. An after-payout decision is proposed by one super admin and approved by a different one. CTSGo absorbs a write-off.'
              : 'Nothing is deducted from the party\'s later earnings. Withholding reduces what this statement pays; paying in full means CTSGo absorbs the amount.'}
            {' '}Amount {isPesewasValue(deciding.debt.amountPesewas) ? formatPesewas(deciding.debt.amountPesewas) : '—'}.
          </Notice>
          <Field label="Reason" hint="Required and recorded in the audit log."><TextArea value={debtReason} onChange={setDebtReason} /></Field>
          {(debtEvidenceRequired(deciding.choice) || deciding.choice.action === 'approve') && (
            <Field label="Evidence" hint={debtEvidenceRequired(deciding.choice) ? 'Required: the Bridge reference, repayment record or approval (6+ characters).' : 'Optional.'}>
              <TextInput value={debtEvidence} onChange={setDebtEvidence} />
            </Field>
          )}
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
