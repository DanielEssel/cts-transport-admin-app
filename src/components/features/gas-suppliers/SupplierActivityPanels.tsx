'use client'
// One supplier's orders and settlement, read-only, in its workspace. Same
// collections and labels as Supplier Gas Orders and Gas Settlement; every
// action stays on those pages, which these panels link to.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { ErrorState } from '@/components/shared'
import { formatDate } from '@/lib/utils'
import {
  checkStatement, formatBps, formatPesewas, gasLoadError, orderAttention, payoutStatusLabel, supplierOrderLabel, termsUsable,
} from '@/lib/gas-supplier-ops'
import { toRow, type SupplierOrderRow } from '@/lib/gas-supplier-orders'
import { label } from '@/lib/gas-suppliers'
import { Card } from './ui'

const muted = { fontSize: '12.5px', color: 'var(--text-tertiary)' } as const

export function SupplierOrdersPanel({ supplierId }: { supplierId: string }) {
  const [rows, setRows] = useState<SupplierOrderRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    // Equality only, so no composite index is needed; newest first in the browser.
    getDocs(query(collection(db, 'gas_supplier_orders'), where('supplierId', '==', supplierId), limit(200)))
      .then((s) => setRows(s.docs.map((d) => toRow(d.id, d.data())).sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0))))
      .catch((e) => { setRows([]); setError(gasLoadError(e, 'gas_supplier_orders', 'Supplier orders')) })
  }, [supplierId])
  const now = Date.now()
  const open = rows?.filter((r) => !['delivered', 'cancelled'].includes(r.status)).length ?? 0
  const attention = rows?.filter((r) => orderAttention(r, now).length > 0).length ?? 0

  return (
    <Card title={rows ? `Orders (${rows.length}${rows.length === 200 ? '+' : ''})` : 'Orders'} actions={
      <Link href={`/gas-supplier-orders?supplier=${encodeURIComponent(supplierId)}`} className="btn btn-secondary">Open in Supplier Gas Orders</Link>
    }>
      {error ? <ErrorState message={error} /> : rows === null ? <div className="skeleton" style={{ height: '96px' }} /> : rows.length === 0 ? (
        <div style={muted}>No orders yet. Orders appear once the supplier is approved, taking orders and supplier fulfilment is on.</div>
      ) : (
        <>
          <div style={muted}>{open} outstanding · {attention} need attention. Cancelling, releasing a driver and posting entitlements are done in Supplier Gas Orders.</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Order</th><th>Created</th><th>Status</th><th>Item</th><th>Total</th><th>Attention</th></tr></thead>
              <tbody>
                {rows.slice(0, 25).map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{r.id.slice(0, 10)}</td>
                    <td style={{ fontSize: '12px' }}>{r.createdAtMs ? formatDate(new Date(r.createdAtMs)) : '—'}</td>
                    <td>{supplierOrderLabel(r.status)}</td>
                    <td style={{ fontSize: '12px' }}>{r.quantity} × {label(r.cylinderSize)} · {label(r.orderType)}</td>
                    <td>{r.total == null ? '—' : `GH₵${r.total.toFixed(2)}`}</td>
                    <td style={{ fontSize: '12px', color: 'var(--tone-danger-fg)' }}>{orderAttention(r, now).join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 25 && <div style={muted}>Showing the latest 25.</div>}
        </>
      )}
    </Card>
  )
}

interface StatementRow { id: string; businessDate?: string; party?: string; lines?: Array<{ amountPesewas: unknown }>; netPesewas?: unknown; payoutStatus?: string; payoutMethod?: string }

export function SupplierSettlementPanel({ supplierId }: { supplierId: string }) {
  const [data, setData] = useState<{ statements: StatementRow[]; openDebts: number; ownTerms: Record<string, any> | null; platformOk: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    Promise.all([
      getDocs(query(collection(db, 'gas_settlement_statements'), where('partyId', '==', supplierId))),
      getDocs(query(collection(db, 'gas_settlement_debts'), where('partyId', '==', supplierId))),
      getDoc(doc(db, 'gas_commission_terms', `current_s_${supplierId}`)),
      getDoc(doc(db, 'gas_commission_terms', 'current')),
    ]).then(([st, debts, own, platform]) => setData({
      statements: st.docs.map((d) => ({ id: d.id, ...d.data() }) as StatementRow)
        .filter((s) => s.party === 'supplier')
        .sort((a, b) => String(b.businessDate ?? '').localeCompare(String(a.businessDate ?? ''))),
      openDebts: debts.docs.filter((d) => ['outstanding', 'resolution_proposed'].includes(d.data().status)).length,
      ownTerms: own.exists() && termsUsable(own.data(), { supplier: true }) ? own.data() : null,
      platformOk: platform.exists() && termsUsable(platform.data()),
    })).catch((e) => setError(gasLoadError(e, 'gas_settlement_statements, gas_settlement_debts, gas_commission_terms', 'Settlement')))
  }, [supplierId])

  return (
    <Card title="Settlement" actions={<Link href="/gas-settlement" className="btn btn-secondary">Open Gas Settlement</Link>}>
      {error ? <ErrorState message={error} /> : !data ? <div className="skeleton" style={{ height: '96px' }} /> : (
        <>
          <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', fontSize: '13px' }}>
            <span>Commission: <b>{data.ownTerms ? `${formatBps(data.ownTerms.rateBps)} (own terms)` : data.platformOk ? 'platform default' : 'no usable terms'}</b></span>
            <span>Open debts: <b>{data.openDebts}</b></span>
          </div>
          {data.statements.length === 0 ? <div style={muted}>No statements prepared for this supplier.</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Business date</th><th>Lines</th><th>Net (from lines)</th><th>Payout</th></tr></thead>
                <tbody>
                  {data.statements.slice(0, 20).map((s) => {
                    // The settlement page's own check: the net is summed from the lines and compared with the stored net.
                    const c = checkStatement(s)
                    return (
                      <tr key={s.id}>
                        <td>{s.businessDate ?? '—'}</td>
                        <td>{s.lines?.length ?? 0}</td>
                        <td style={{ color: c.reconciles ? 'inherit' : 'var(--tone-danger-fg)' }}>
                          {c.netPesewas == null ? '—' : formatPesewas(c.netPesewas)}{c.reconciles ? '' : ' (stored net differs)'}
                        </td>
                        <td style={{ fontSize: '12px' }}>{payoutStatusLabel(s.payoutStatus, s.party, s.payoutMethod)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div style={muted}>Read-only. Payouts, Bridge results, reversals and debts are handled in Gas Settlement, where each amount is reconciled against its lines.</div>
        </>
      )}
    </Card>
  )
}
