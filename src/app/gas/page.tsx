'use client'
// Gas overview: what needs an admin across the Gas module, read from the same
// collections the Gas pages use. Counts only; amounts stay on the settlement
// page, which reconciles them. Every figure links to where it is handled.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { AlertTriangle, ClipboardCheck, Factory, Power, Scale } from 'lucide-react'
import { db } from '@/lib/firebase'
import { ErrorState, Panel, StatsCard, StatusBadge } from '@/components/shared'
import { GasSwitches } from '@/components/features/gas-suppliers/GasSwitches'
import { listProducts, listStations, listSuppliers } from '@/lib/gas-supplier-data'
import { label, type Product, type Station, type Supplier } from '@/lib/gas-suppliers'
import { gasLoadError, orderAttention, settlementQueue, supplierOrderLabel, termsUsable } from '@/lib/gas-supplier-ops'
import { toRow, type SupplierOrderRow } from '@/lib/gas-supplier-orders'
import { SUPPLIER_GROUPS, SUPPLIER_GROUP_LABELS, supplierGroup, toMillis, waitingFor } from '@/lib/gas-admin'

type Catalog = Array<{ supplier: Supplier; station: Station; products: Product[] }>
type Load<T> = { data: T } | { error: string } | null

const row = { display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', padding: '8px 0', borderBottom: '1px solid var(--border)' } as const
const muted = { fontSize: '12px', color: 'var(--text-tertiary)' } as const
const ok = <T,>(l: Load<T>): T | null => (l && 'data' in l ? l.data : null)

export default function GasOverviewPage() {
  const [suppliers, setSuppliers] = useState<Load<Supplier[]>>(null)
  const [catalog, setCatalog] = useState<Load<Catalog>>(null)
  const [orders, setOrders] = useState<Load<SupplierOrderRow[]>>(null)
  const [settlement, setSettlement] = useState<Load<{ queue: ReturnType<typeof settlementQueue>; termsOk: boolean; proposals: number }>>(null)
  const now = Date.now()

  const load = useCallback(() => {
    setSuppliers(null); setCatalog(null); setOrders(null); setSettlement(null)
    listSuppliers().then(async (list) => {
      setSuppliers({ data: list })
      try {
        const rows = await Promise.all(list.map(async (supplier) => Promise.all(
          (await listStations(supplier.id)).map(async (station) => ({ supplier, station, products: await listProducts(supplier.id, station.id) })))))
        setCatalog({ data: rows.flat() })
      } catch (e) { setCatalog({ error: gasLoadError(e, 'gas_suppliers stations and products', 'Stations') }) }
    }).catch((e) => {
      const msg = gasLoadError(e, 'gas_suppliers', 'Gas suppliers')
      setSuppliers({ error: msg }); setCatalog({ error: msg })
    })
    getDocs(query(collection(db, 'gas_supplier_orders'), orderBy('createdAt', 'desc'), limit(200)))
      .then((s) => setOrders({ data: s.docs.map((d) => toRow(d.id, d.data())) }))
      .catch((e) => setOrders({ error: gasLoadError(e, 'gas_supplier_orders', 'Supplier orders') }))
    Promise.all([
      getDocs(query(collection(db, 'gas_settlement_statements'), orderBy('businessDate', 'desc'), limit(100))),
      getDocs(query(collection(db, 'gas_settlement_debts'), where('status', 'in', ['outstanding', 'resolution_proposed']))),
      getDoc(doc(db, 'gas_commission_terms', 'current')),
      getDocs(query(collection(db, 'gas_commission_terms'), where('status', '==', 'proposed'))),
    ]).then(([st, debts, current, proposed]) => setSettlement({ data: {
      queue: settlementQueue(st.docs.map((d) => d.data()), debts.docs.map((d) => d.data())),
      termsOk: current.exists() && termsUsable(current.data()),
      proposals: proposed.size,
    } })).catch((e) => setSettlement({ error: gasLoadError(e, 'gas_settlement_statements, gas_settlement_debts, gas_commission_terms', 'Settlement') }))
  }, [])
  useEffect(() => { load() }, [load])

  const sup = ok(suppliers)
  const cat = ok(catalog)
  const ord = ok(orders)
  const set = ok(settlement)
  const groups = sup ? Object.fromEntries(SUPPLIER_GROUPS.map((g) => [g, sup.filter((s) => supplierGroup(s) === g)])) as Record<string, Supplier[]> : null
  const applications = (groups?.applications ?? []).slice().sort((a, b) => (toMillis(a.statusChangedAt) ?? 0) - (toMillis(b.statusChangedAt) ?? 0))
  const attention = ord?.filter((o) => orderAttention(o, now).length > 0) ?? null
  const openOrders = ord?.filter((o) => !['delivered', 'cancelled'].includes(o.status)).length ?? null
  const names = Object.fromEntries((sup ?? []).map((s) => [s.id, s.tradingName || s.legalName]))
  const stationsToVerify = cat?.filter((c) => c.station.status === 'draft' && c.supplier.status !== 'rejected') ?? null
  const products = cat?.flatMap((c) => c.products) ?? null
  const settlementWork = set ? set.queue.supplierPayoutsToSend + set.queue.payoutResultsToRecord + set.queue.driverStatementsToCredit + set.queue.openDebts : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '220px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>Gas Overview</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>What needs CTSGo across suppliers, supplier orders and settlement.</p>
        </div>
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
      </div>

      <div className="grid-kpi">
        <StatsCard title="Awaiting approval" value={groups?.applications.length ?? '—'} hint="Supplier applications" loading={!suppliers}
          icon={<ClipboardCheck size={20} />} iconColor="var(--tone-warning-fg)" iconBg="var(--tone-warning-bg)" />
        <StatsCard title="Approved suppliers" value={groups?.approved.length ?? '—'} loading={!suppliers}
          hint={sup ? `${sup.filter((s) => s.ordersEnabled).length} taking orders` : undefined} icon={<Factory size={20} />} />
        <StatsCard title="Orders needing attention" value={attention?.length ?? '—'} loading={!orders}
          hint={openOrders != null ? `${openOrders} outstanding of the latest ${ord!.length}` : undefined}
          icon={<AlertTriangle size={20} />} iconColor="var(--tone-danger-fg)" iconBg="var(--tone-danger-bg)" />
        <StatsCard title="Settlement to action" value={settlementWork ?? '—'} hint="Payouts, wallet credits and open debts" loading={!settlement}
          icon={<Scale size={20} />} iconColor="var(--tone-info-fg)" iconBg="var(--tone-info-bg)" />
      </div>

      <div className="grid-2">
        <Panel title="Applications awaiting approval" subtitle="Oldest first" actions={<Link href="/gas-suppliers?group=applications" className="btn btn-secondary">All applications</Link>}>
          {suppliers && 'error' in suppliers ? <ErrorState message={suppliers.error} onRetry={load} /> : !sup ? <div className="skeleton" style={{ height: '96px' }} /> : applications.length === 0 ? (
            <div style={muted}>No applications are waiting.</div>
          ) : applications.slice(0, 6).map((s) => (
            <div key={s.id} style={row}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.tradingName || s.legalName}</div>
                <div style={muted}>Waiting {waitingFor(s.statusChangedAt, now) ?? '—'}</div>
              </div>
              <Link href={`/gas-suppliers?review=${s.id}`} className="btn btn-primary" style={{ minHeight: '30px', fontSize: '12px' }}>Review</Link>
            </div>
          ))}
        </Panel>

        <Panel title="Suppliers" subtitle="By status" actions={<Link href="/gas-suppliers" className="btn btn-secondary">Manage</Link>}>
          {suppliers && 'error' in suppliers ? <ErrorState message={suppliers.error} onRetry={load} /> : !groups ? <div className="skeleton" style={{ height: '96px' }} /> : (
            <>
              {SUPPLIER_GROUPS.map((g) => (
                <Link key={g} href={`/gas-suppliers?group=${g}`} style={{ ...row, textDecoration: 'none' }}>
                  <span style={{ flex: 1, color: 'var(--text-primary)' }}>{SUPPLIER_GROUP_LABELS[g]}</span>
                  <b style={{ color: 'var(--text-primary)' }}>{groups[g].length}</b>
                </Link>
              ))}
              <div style={{ ...row, borderBottom: 'none' }}>
                <Power size={14} color="var(--text-tertiary)" />
                <span style={{ flex: 1, color: 'var(--text-secondary)' }}>Orders on / approved</span>
                <b>{sup!.filter((s) => s.ordersEnabled).length} / {groups.approved.length}</b>
              </div>
            </>
          )}
        </Panel>

        <Panel title="Supplier orders" subtitle="Latest 200" actions={<Link href="/gas-supplier-orders" className="btn btn-secondary">Open orders</Link>}>
          {orders && 'error' in orders ? <ErrorState message={orders.error} onRetry={load} /> : !attention ? <div className="skeleton" style={{ height: '96px' }} /> : attention.length === 0 ? (
            <div style={muted}>Nothing needs attention. {openOrders} outstanding.</div>
          ) : attention.slice(0, 6).map((o) => (
            <div key={o.id} style={row}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{names[o.supplierId] ?? o.supplierId} · {supplierOrderLabel(o.status)}</div>
                <div style={{ ...muted, color: 'var(--tone-danger-fg)' }}>{orderAttention(o, now).join('; ')}</div>
              </div>
              <span style={{ ...muted, fontFamily: 'var(--font-mono)' }}>{o.id.slice(0, 8)}</span>
            </div>
          ))}
        </Panel>

        <Panel title="Stations and products" subtitle="Verification" actions={<Link href="/gas-suppliers?group=approved" className="btn btn-secondary">Suppliers</Link>}>
          {catalog && 'error' in catalog ? <ErrorState message={catalog.error} onRetry={load} /> : !cat || !products ? <div className="skeleton" style={{ height: '96px' }} /> : (
            <>
              <div style={row}><span style={{ flex: 1 }}>Stations verified</span><b>{cat.filter((c) => c.station.status === 'verified').length} of {cat.length}</b></div>
              <div style={row}><span style={{ flex: 1 }}>Products verified</span><b>{products.filter((p) => p.verified).length} of {products.length}</b></div>
              {stationsToVerify!.slice(0, 4).map((c) => (
                <Link key={`${c.supplier.id}/${c.station.id}`} href={`/gas-suppliers/${c.supplier.id}#stations`} style={{ ...row, textDecoration: 'none' }}>
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--text-primary)' }}>{c.station.name}<span style={{ ...muted, display: 'block' }}>{c.supplier.tradingName || c.supplier.legalName} · supplier {label(c.supplier.status).toLowerCase()}</span></span>
                  <StatusBadge status={c.station.status} />
                </Link>
              ))}
              {stationsToVerify!.length === 0 && <div style={{ ...muted, paddingTop: '8px' }}>No draft stations waiting.</div>}
            </>
          )}
        </Panel>

        <Panel title="Settlement" subtitle="Work waiting for a super admin" actions={<Link href="/gas-settlement" className="btn btn-secondary">Open settlement</Link>}>
          {settlement && 'error' in settlement ? <ErrorState message={settlement.error} onRetry={load} /> : !set ? <div className="skeleton" style={{ height: '96px' }} /> : (
            <>
              <Link href="/gas-settlement#statements" style={{ ...row, textDecoration: 'none' }}><span style={{ flex: 1, color: 'var(--text-primary)' }}>Supplier payouts ready to send</span><b>{set.queue.supplierPayoutsToSend}</b></Link>
              <Link href="/gas-settlement#statements" style={{ ...row, textDecoration: 'none' }}><span style={{ flex: 1, color: 'var(--text-primary)' }}>Bridge results to record</span><b>{set.queue.payoutResultsToRecord}</b></Link>
              <Link href="/gas-settlement#statements" style={{ ...row, textDecoration: 'none' }}><span style={{ flex: 1, color: 'var(--text-primary)' }}>Driver statements to credit</span><b>{set.queue.driverStatementsToCredit}</b></Link>
              <Link href="/gas-settlement#debts" style={{ ...row, textDecoration: 'none' }}><span style={{ flex: 1, color: 'var(--text-primary)' }}>Open debts</span><b>{set.queue.openDebts}</b></Link>
              <Link href="/gas-settlement#terms" style={{ ...row, textDecoration: 'none', borderBottom: 'none' }}>
                <span style={{ flex: 1, color: 'var(--text-primary)' }}>Platform commission terms</span>
                <b style={{ color: set.termsOk ? 'var(--accent-text)' : 'var(--tone-danger-fg)' }}>{set.termsOk ? 'Current' : 'Missing'}</b>
                {set.proposals > 0 && <span style={muted}>· {set.proposals} proposed</span>}
              </Link>
              <div style={{ ...muted, paddingTop: '6px' }}>Counts from the latest 100 statements. Amounts are on the settlement page.</div>
            </>
          )}
        </Panel>

        <Panel title="Master switches" subtitle="Read-only" actions={<Link href="/gas-configuration" className="btn btn-secondary">Configuration</Link>}>
          <GasSwitches compact />
        </Panel>
      </div>
    </div>
  )
}
