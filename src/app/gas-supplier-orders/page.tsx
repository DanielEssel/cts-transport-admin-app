'use client'
// Gas supplier orders: monitoring and operational actions. Orders are
// written only by Cloud Functions; this page reads them (admins may read)
// and acts through the admin callables, which check the caller server-side:
//   adminCancelGasSupplierOrder        (active admin, reason, refunds the hold)
//   adminPostGasSupplierEntitlements   (super admin, delivered orders)
// Each order's financial allocation (finance/allocation, admins only) is
// shown with the agreed equations re-checked; nothing here computes money.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { toast } from 'sonner'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { db, functions } from '@/lib/firebase'
import { EmptyState, TableSkeleton } from '@/components/shared'
import { Card, Field, Modal, Notice, TextArea, buttonStyle } from '@/components/features/gas-suppliers/ui'
import {
  ADMIN_CANCELLABLE, ADMIN_RELEASABLE, ALLOCATION_SETTLEMENT_LABELS, PAYMENT_STATUS_LABELS, SUPPLIER_ORDER_STATUSES,
  allocationReadError, checkAllocation, cylinderRecoveryNotice, deliveryModeLabel, fallbackReasonLabel, formatBps, formatPesewas, gasLoadError, offerHistory,
  orderAttention, supplierOrderLabel, type Allocation, type OrderOffers,
} from '@/lib/gas-supplier-ops'

interface Row {
  id: string
  status: string
  supplierId: string
  stationId: string
  orderType: string
  cylinderSize: string
  quantity: number
  total: number | null
  driverId: string | null
  escrowId: string | null
  paymentStatus: string | null
  deliveryMode: string | null
  completionFailures: number
  refundPending: boolean
  refundReview: string | null
  offers: OrderOffers
  fallbackReason: string | null
  createdAtMs: number | null
  updatedAtMs: number | null
}

const ms = (v: unknown): number | null => (v && typeof (v as { toMillis?: unknown }).toMillis === 'function' ? (v as { toMillis(): number }).toMillis() : null)
const LAST_CHANGE = ['deliveredAt', 'handedOverAt', 'arrivedAtStationAt', 'acceptedAt', 'confirmedAt', 'paidAt', 'cancelledAt', 'createdAt'] as const

function toRow(id: string, d: Record<string, any>): Row {
  const changes = LAST_CHANGE.map((k) => ms(d[k])).filter((x): x is number => x != null)
  return {
    id, status: d.status, supplierId: d.supplierId, stationId: d.stationId, orderType: d.orderType, cylinderSize: d.cylinderSize,
    quantity: d.quantity, total: typeof d.priceSnapshot?.total === 'number' ? d.priceSnapshot.total : null,
    driverId: d.driverId ?? null, escrowId: d.payment?.escrowId ?? null,
    paymentStatus: typeof d.payment?.status === 'string' ? d.payment.status : null, refundPending: d.refundPending === true,
    deliveryMode: typeof d.deliveryMode === 'string' ? d.deliveryMode : null, completionFailures: Number.isInteger(d.completionFailures) ? d.completionFailures : 0,
    refundReview: typeof d.refundReview === 'string' ? d.refundReview : null,
    offers: {
      riderOffer: d.riderOffer ? { driverId: d.riderOffer.driverId, seq: d.riderOffer.seq, expiresAtMs: ms(d.riderOffer.expiresAt) } : null,
      lastRiderOffer: d.lastRiderOffer ? { driverId: d.lastRiderOffer.driverId, seq: d.lastRiderOffer.seq, outcome: d.lastRiderOffer.outcome, atMs: ms(d.lastRiderOffer.at) } : null,
      declinedRiderIds: d.declinedRiderIds,
    },
    fallbackReason: typeof d.ctsgoFallbackReason === 'string' ? d.ctsgoFallbackReason : null,
    createdAtMs: ms(d.createdAt), updatedAtMs: changes.length ? Math.max(...changes) : null,
  }
}

const callError = (e: any) => e?.message || 'The request failed.'

export default function GasSupplierOrdersPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'attention' | 'open' | 'all' | string>('attention')
  const [selected, setSelected] = useState<Row | null>(null)
  const [events, setEvents] = useState<Array<Record<string, any>> | null>(null)
  const [allocation, setAllocation] = useState<Partial<Allocation> | null | undefined>(undefined)
  const [allocationError, setAllocationError] = useState<string | null>(null)
  const [recoveryAlert, setRecoveryAlert] = useState<Record<string, any> | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [busy, setBusy] = useState(false)
  const now = Date.now()

  const load = useCallback(async () => {
    setError(null)
    try {
      const snap = await getDocs(query(collection(db, 'gas_supplier_orders'), orderBy('createdAt', 'desc'), limit(200)))
      setRows(snap.docs.map((d) => toRow(d.id, d.data())))
    } catch (e: any) {
      setRows([])
      setError(gasLoadError(e, 'gas_supplier_orders', 'supplier orders'))
    }
  }, [])
  useEffect(() => { load() }, [load])

  const shown = useMemo(() => (rows ?? []).filter((r) => {
    if (filter === 'all') return true
    if (filter === 'attention') return orderAttention(r, now).length > 0
    if (filter === 'open') return !['delivered', 'cancelled'].includes(r.status)
    return r.status === filter
  }), [rows, filter, now])

  async function open(r: Row) {
    setSelected(r); setEvents(null); setCancelReason(''); setAllocation(undefined); setAllocationError(null); setRecoveryAlert(null)
    // F5: raised when an order is cancelled after the hand-over. A refused read shows nothing.
    getDoc(doc(db, 'admin_alerts', `gas_cylinder_recovery_${r.id}`))
      .then((a) => setRecoveryAlert(a.exists() ? a.data() : null))
      .catch(() => setRecoveryAlert(null))
    getDoc(doc(db, 'gas_supplier_orders', r.id, 'finance', 'allocation'))
      .then((a) => setAllocation(a.exists() ? (a.data() as Partial<Allocation>) : null))
      .catch((e) => setAllocationError(allocationReadError(e)))
    try {
      const snap = await getDocs(query(collection(db, 'gas_supplier_orders', r.id, 'events'), orderBy('at', 'asc')))
      setEvents(snap.docs.map((d) => d.data()))
    } catch { setEvents([]) }
  }

  async function cancelOrder() {
    if (!selected) return
    setBusy(true)
    try {
      const r: any = (await httpsCallable(functions, 'adminCancelGasSupplierOrder')({ orderId: selected.id, reason: cancelReason.trim() })).data
      toast.success(r.refunded ? 'Order cancelled and the passenger refunded.' : r.refundPending ? 'Order cancelled. The refund still needs attention.' : 'Order cancelled.')
      setSelected(null); await load()
    } catch (e) { toast.error(callError(e)) } finally { setBusy(false) }
  }

  async function releaseDriver() {
    if (!selected) return
    setBusy(true)
    try {
      await httpsCallable(functions, 'adminReleaseGasSupplierDriver')({ orderId: selected.id, reason: cancelReason.trim() })
      toast.success('Driver released. The order is open for another eligible driver; the payment hold is unchanged.')
      setSelected(null); await load()
    } catch (e) { toast.error(callError(e)) } finally { setBusy(false) }
  }

  async function postLedger() {
    if (!selected) return
    setBusy(true)
    try {
      const r: any = (await httpsCallable(functions, 'adminPostGasSupplierEntitlements')({ orderId: selected.id })).data
      toast.success(r?.posted === false ? `Not posted: ${r.problem ?? r.reason ?? 'already posted'}` : 'Ledger entries posted.')
    } catch (e) { toast.error(callError(e)) } finally { setBusy(false) }
  }

  const attentionCount = (rows ?? []).filter((r) => orderAttention(r, now).length > 0).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>Gas supplier orders</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Orders placed with approved suppliers. Status changes come only from the passenger, supplier, driver and admin callables.</p>
        </div>
        <button style={buttonStyle('secondary')} onClick={() => { setRows(null); load() }}><RefreshCw size={14} /> Refresh</button>
      </div>

      <Notice>
        Supplier-order fulfilment is switched off until the escrow security review and a production go-ahead
        (settings/gas_supplier_fulfilment). Until then orders stay at &ldquo;Awaiting payment&rdquo;.
      </Notice>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {[['attention', `Needs attention (${attentionCount})`], ['open', 'Open'], ['all', 'All'], ...SUPPLIER_ORDER_STATUSES.map((s) => [s, supplierOrderLabel(s)])].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={buttonStyle(filter === k ? 'primary' : 'secondary')}>{l}</button>
        ))}
      </div>

      <Card>
        {error && <Notice tone="danger">{error}</Notice>}
        {rows === null ? <TableSkeleton rows={6} cols={7} /> : shown.length === 0 ? (
          <EmptyState icon={<AlertTriangle size={20} />} title={filter === 'attention' ? 'Nothing needs attention' : 'No orders'} description="Supplier orders appear here when passengers order from approved suppliers." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Order</th><th>Status</th><th>Supplier</th><th>Item</th><th>Total</th><th>Payment</th><th>Attention</th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} onClick={() => open(r)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{r.id.slice(0, 10)}</td>
                    <td>{supplierOrderLabel(r.status)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{r.supplierId}</td>
                    <td>{r.quantity} × {r.cylinderSize} · {r.orderType}</td>
                    <td>{r.total == null ? '—' : `GH₵${r.total.toFixed(2)}`}</td>
                    <td>{r.paymentStatus ? PAYMENT_STATUS_LABELS[r.paymentStatus] ?? r.paymentStatus : r.escrowId ? 'Verified hold' : '—'}</td>
                    <td style={{ color: 'var(--danger, #dc2626)' }}>{orderAttention(r, now).join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected && (
        <Modal title={`Supplier order ${selected.id}`} onClose={() => setSelected(null)} footer={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {selected.status === 'delivered' && <button style={buttonStyle('primary', busy)} disabled={busy} onClick={postLedger}>Post ledger entries</button>}
            {ADMIN_RELEASABLE.includes(selected.status) && selected.driverId && (
              <button style={buttonStyle('secondary', busy || cancelReason.trim().length < 3)} disabled={busy || cancelReason.trim().length < 3} onClick={releaseDriver}>Release driver (reassign)</button>
            )}
            {ADMIN_CANCELLABLE.includes(selected.status) && (
              <button style={buttonStyle('danger', busy || cancelReason.trim().length < 3)} disabled={busy || cancelReason.trim().length < 3} onClick={cancelOrder}>Cancel and refund</button>
            )}
          </div>
        }>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
            <div>Status: <strong>{supplierOrderLabel(selected.status)}</strong> · Supplier {selected.supplierId} · Station {selected.stationId}</div>
            <div>Delivery: <strong>{deliveryModeLabel(selected.deliveryMode)}</strong>{selected.completionFailures > 0 ? ` · ${selected.completionFailures} wrong completion code(s)${selected.completionFailures >= 5 ? ' — locked: confirm with the customer, or cancel and refund' : ''}` : ''}</div>
            <RiderOffersView row={selected} now={now} recoveryAlert={recoveryAlert} />
            <div>Driver: {selected.driverId ?? '—'} · Payment hold: {selected.escrowId ?? '—'}{selected.paymentStatus ? ` · ${PAYMENT_STATUS_LABELS[selected.paymentStatus] ?? selected.paymentStatus}` : ''}</div>
            {allocationError ? <Notice tone="danger">{allocationError}</Notice> : <AllocationView allocation={allocation} snapshotTotal={selected.total} />}
            {orderAttention(selected, now).map((a) => <Notice key={a} tone="warning">{a}</Notice>)}
            <div>
              <div style={{ fontWeight: 700, marginBottom: '6px' }}>History</div>
              {events === null ? 'Loading…' : events.length === 0 ? 'No events recorded.' : (
                <ul style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {events.map((e, i) => <li key={i}>{supplierOrderLabel(e.from)} → <strong>{supplierOrderLabel(e.to)}</strong> by {e.role} {e.reason ? `(${e.reason})` : ''}</li>)}
                </ul>
              )}
            </div>
            {ADMIN_CANCELLABLE.includes(selected.status) && (
              <Field label="Reason" hint="Required for either action. Cancel: the passenger's payment hold is refunded in full and any driver is released. Release driver (before the supplier's hand-over): the order goes back to drivers; that driver cannot take it again; nothing is refunded.">
                <TextArea value={cancelReason} onChange={setCancelReason} />
              </Field>
            )}
            {selected.status === 'delivered' && <Notice>Posting records the supplier net entitlement, driver delivery fee and CTSGo commission exactly as in the allocation above. Super admins only; it needs the allocation&apos;s approved terms version and a captured payment. No money is paid out.</Notice>}
          </div>
        </Modal>
      )}
    </div>
  )
}

/** Linked-rider offers, why CTSGo took over, and any cylinder-recovery alert (spec §6 "Orders"). Read-only. */
function RiderOffersView({ row, now, recoveryAlert }: { row: Row; now: number; recoveryAlert: Record<string, any> | null }) {
  const history = offerHistory(row.offers, now)
  const fallback = fallbackReasonLabel(row.fallbackReason)
  const recovery = cylinderRecoveryNotice(recoveryAlert)
  if (!history.length && !fallback && !recovery) return null
  return (
    <div>
      {(history.length > 0 || fallback) && <div style={{ fontWeight: 700, marginBottom: '6px' }}>Rider offers</div>}
      {history.length > 0 && <ul style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>{history.map((h) => <li key={h}>{h}</li>)}</ul>}
      {fallback && <div style={{ marginTop: '4px' }}>Passed to CTSGo dispatch: {fallback}</div>}
      {recovery && <div style={{ marginTop: '6px' }}><Notice tone={recovery.tone}>{recovery.text}</Notice></div>}
    </div>
  )
}

/** The order's allocation, as stored, with each agreed equation re-checked. */
function AllocationView({ allocation: a, snapshotTotal }: { allocation: Partial<Allocation> | null | undefined; snapshotTotal: number | null }) {
  if (a === undefined) return <div>Allocation: loading…</div>
  if (a === null) return <Notice tone="warning">No financial allocation recorded for this order. It cannot be paid or settled.</Notice>
  const check = checkAllocation(a, snapshotTotal)
  const p = (v: unknown) => (typeof v === 'number' ? formatPesewas(v) : '—')
  const rows: Array<[string, string]> = [
    ['Product subtotal (supplier price)', p(a.productSubtotalPesewas)],
    ['Supplier handling fee', p(a.handlingFeePesewas)],
    ['Delivery fee', p(a.deliveryFeePesewas)],
    ['Customer total', p(a.customerTotalPesewas)],
    [`CTSGo commission (${formatBps(a.commissionRateBps)} of ${p(a.commissionBasePesewas)}, terms ${a.commissionTermsId ?? '—'}: ${a.commissionTermsReference ?? '—'})`, p(a.commissionPesewas)],
    ['Supplier gross (product + handling)', p(a.supplierGrossPesewas)],
    ['Supplier adjustments', p(a.supplierAdjustmentsPesewas)],
    ['Supplier net entitlement', p(a.supplierNetPesewas)],
    ['Delivery fee entitlement (driver, or supplier if its own rider delivered)', p(a.driverNetPesewas)],
  ]
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: '6px' }}>Financial allocation</div>
      <table className="data-table"><tbody>{rows.map(([k, v]) => <tr key={k}><td>{k}</td><td style={{ textAlign: 'right' }}>{v}</td></tr>)}</tbody></table>
      <div style={{ marginTop: '6px' }}>
        Settlement: {ALLOCATION_SETTLEMENT_LABELS[a.settlement?.status ?? ''] ?? a.settlement?.status ?? '—'}
        {a.settlement?.reconciliation ? ` · reconciliation ${a.settlement.reconciliation}${a.settlement.reconciliationReason ? ` (${a.settlement.reconciliationReason})` : ''}` : ''}
      </div>
      {check.ok ? <div style={{ color: 'var(--text-tertiary)' }}>All allocation equations hold.</div> : check.problems.map((x) => <Notice key={x} tone="danger">{x}</Notice>)}
    </div>
  )
}
