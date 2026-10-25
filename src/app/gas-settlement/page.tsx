'use client'
// Gas supplier settlement review: the server-written settlement ledger,
// daily statements and commission terms (admins may read). Actions go
// through the super-admin callables in gas_settlement_ledger.js; there is
// no payout or wallet action here.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'
import { db, functions } from '@/lib/firebase'
import { TableSkeleton } from '@/components/shared'
import { Card, Field, Modal, Notice, TextArea, TextInput, buttonStyle } from '@/components/features/gas-suppliers/ui'
import { checkStatement, formatPesewas, gasLoadError, isClosedBusinessDate, orderReconciles, summarizeLedger } from '@/lib/gas-supplier-ops'

interface Entry { id: string; orderId: string; party: string; partyId: string; kind: string; amountPesewas: unknown; businessDate: string; basis?: any }
interface Statement { id: string; businessDate: string; party: string; partyId: string; lines?: Array<{ amountPesewas: unknown }>; netPesewas?: unknown; status?: string; payoutStatus?: string }

const callError = (e: any) => e?.message || 'The request failed.'

export default function GasSettlementPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [statements, setStatements] = useState<Statement[] | null>(null)
  const [terms, setTerms] = useState<Record<string, any> | null | undefined>(undefined)
  const [snapshots, setSnapshots] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [date, setDate] = useState('')
  const [reversing, setReversing] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [e, s, t] = await Promise.all([
        getDocs(query(collection(db, 'gas_settlement_ledger'), orderBy('businessDate', 'desc'), limit(300))),
        getDocs(query(collection(db, 'gas_settlement_statements'), orderBy('businessDate', 'desc'), limit(100))),
        getDoc(doc(db, 'gas_commission_terms', 'current')),
      ])
      const list = e.docs.map((d) => ({ id: d.id, ...d.data() }) as Entry)
      setEntries(list)
      setStatements(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Statement))
      setTerms(t.exists() ? t.data() : null)
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

  async function prepare() {
    setBusy(true)
    try {
      const r: any = (await httpsCallable(functions, 'adminPrepareGasSettlementStatements')({ businessDate: date })).data
      toast.success(`${r.statements?.length ?? 0} statement(s) prepared${r.exceptions?.length ? `, ${r.exceptions.length} order(s) left out for review` : ''}.`)
      await load()
    } catch (e) { toast.error(callError(e)) } finally { setBusy(false) }
  }

  async function reverse() {
    if (!reversing) return
    setBusy(true)
    try {
      await httpsCallable(functions, 'adminReverseGasSupplierEntitlements')({ orderId: reversing, reason: reason.trim() })
      toast.success('Reversal entries added.')
      setReversing(null); setReason(''); await load()
    } catch (e) { toast.error(callError(e)) } finally { setBusy(false) }
  }

  const termsOk = terms && terms.active === true && Number.isInteger(terms.rateBps) && typeof terms.termsReference === 'string' && terms.termsReference && terms.approvedBy

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>Gas settlement</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Supplier entitlements, driver delivery fees and CTSGo commission, from the append-only settlement ledger.</p>
        </div>
        <button style={buttonStyle('secondary')} onClick={() => { setEntries(null); load() }}><RefreshCw size={14} /> Refresh</button>
      </div>

      <Notice tone="warning">Statement of record only. Supplier and driver payouts are not enabled; nothing on this page moves money.</Notice>
      {error && <Notice tone="danger">{error}</Notice>}

      <Card title="Commission terms">
        {terms === undefined ? 'Loading…' : !terms ? (
          <Notice tone="warning">No commission terms are set (gas_commission_terms/current). Nothing can be posted until an authorised person approves terms.</Notice>
        ) : (
          <div style={{ fontSize: '13px' }}>
            {termsOk ? 'Approved and active' : 'Not usable'} · version {String(terms.version ?? '—')} · reference {String(terms.termsReference ?? '—')} ·
            hold {String(terms.settlementHoldHours ?? '—')} h
          </div>
        )}
      </Card>

      <Card title="Ledger by order" actions={entries && <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
        Supplier {formatPesewas(totals.byParty.supplier ?? 0)} · Drivers {formatPesewas(totals.byParty.driver ?? 0)} · CTSGo {formatPesewas(totals.byParty.platform ?? 0)}
        {totals.rejected ? ` · ${totals.rejected} unreadable` : ''}
      </span>}>
        {entries === null ? <TableSkeleton rows={4} cols={6} /> : byOrder.length === 0 ? <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>No entries posted yet.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Order</th><th>Date</th><th>Supplier</th><th>Driver</th><th>CTSGo</th><th>Reconciles</th><th /></tr></thead>
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

      <Card title="Daily statements" actions={
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <TextInput value={date} onChange={setDate} placeholder="YYYY-MM-DD" />
          <button style={buttonStyle('primary', busy || !isClosedBusinessDate(date, Date.now()))} disabled={busy || !isClosedBusinessDate(date, Date.now())} onClick={prepare}>Prepare</button>
        </div>
      }>
        {statements === null ? <TableSkeleton rows={3} cols={5} /> : statements.length === 0 ? <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>No statements prepared.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Date</th><th>Party</th><th>Lines</th><th>Net (from lines)</th><th>Payout</th></tr></thead>
              <tbody>
                {statements.map((s) => {
                  const c = checkStatement(s)
                  return (
                    <tr key={s.id}>
                      <td>{s.businessDate}</td>
                      <td>{s.party} · <span style={{ fontFamily: 'var(--font-mono)' }}>{s.partyId}</span></td>
                      <td>{s.lines?.length ?? 0}</td>
                      <td style={{ color: c.reconciles ? 'inherit' : 'var(--danger, #dc2626)' }}>{c.netPesewas == null ? '—' : formatPesewas(c.netPesewas)}{c.reconciles ? '' : ' (stored net differs)'}</td>
                      <td>{s.payoutStatus ?? 'not_started'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {reversing && (
        <Modal title={`Reverse order ${reversing}`} onClose={() => setReversing(null)} footer={
          <button style={buttonStyle('danger', busy || reason.trim().length < 3)} disabled={busy || reason.trim().length < 3} onClick={reverse}>Add reversal entries</button>
        }>
          <Field label="Reason" hint="Required. Reversals are appended; the original entries are never changed. Super admins only.">
            <TextArea value={reason} onChange={setReason} />
          </Field>
        </Modal>
      )}
    </div>
  )
}
