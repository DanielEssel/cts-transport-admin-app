'use client'
// One supplier's workspace: a compact sticky header (name, status, the status
// actions) above sticky tabs. Each tab shows data and actions this page
// already had; nothing here changes what an action does or who may take it.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, CheckCircle2, Circle, Pencil, Plus, ShieldCheck, Power, PowerOff, Tag } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { Avatar, EmptyState, StatusBadge, TableSkeleton } from '@/components/shared'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  PRODUCT_AVAILABILITY, enabledOrderTypes, label, stationVerificationProblems, submissionProblems,
  supplierReadiness,
  type Product, type ProductAvailability, type Station, type Supplier,
} from '@/lib/gas-suppliers'
import {
  getSupplier, listHistory, listProducts, listStations, setOrdersEnabled,
  setProductAvailability, setStationStatus, verifyProduct, type HistoryEntry,
} from '@/lib/gas-supplier-data'
import { SupplierForm } from '@/components/features/gas-suppliers/SupplierForm'
import { StationForm } from '@/components/features/gas-suppliers/StationForm'
import { ServiceTimes } from '@/components/features/gas-suppliers/ServiceTimes'
import { DispatchStatus } from '@/components/features/gas-suppliers/DispatchStatus'
import { ProductForm } from '@/components/features/gas-suppliers/ProductForm'
import { SupplierLogins } from '@/components/features/gas-suppliers/SupplierLogins'
import { SupplierRiders } from '@/components/features/gas-suppliers/SupplierRiders'
import { StatusActions } from '@/components/features/gas-suppliers/StatusActions'
import { Card, KeyValue, Notice, OrdersBadge, buttonStyle, inputStyle } from '@/components/features/gas-suppliers/ui'

type StationRow = { station: Station; products: Product[] }

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'business', label: 'Business details' },
  { id: 'stations', label: 'Stations & prices' },
  { id: 'operations', label: 'Operations' },
  { id: 'riders', label: 'Riders' },
  { id: 'logins', label: 'Logins' },
  { id: 'activity', label: 'Activity' },
] as const
type TabId = typeof TABS[number]['id']
const isTab = (v: string): v is TabId => TABS.some((t) => t.id === v)

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { admin } = useAuth()
  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [stations, setStations] = useState<StationRow[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)

  const [tab, setTab] = useState<TabId>('overview')
  // Tabs are mounted on first visit and then kept, so switching back does not reload them.
  const [visited, setVisited] = useState<ReadonlySet<TabId>>(new Set(['overview']))
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [stationForm, setStationForm] = useState<{ station?: Station } | null>(null)
  const [productForm, setProductForm] = useState<{ stationId: string; product?: Product } | null>(null)

  // The open tab is kept in the address (#riders), so a reload or a shared link opens it.
  useEffect(() => {
    const h = window.location.hash.slice(1)
    if (isTab(h)) { setTab(h); setVisited((v) => new Set(v).add(h)) }
  }, [])
  const openTab = (t: TabId) => {
    setTab(t); setVisited((v) => new Set(v).add(t))
    window.history.replaceState(null, '', `#${t}`)
  }

  const load = useCallback(async () => {
    try {
      const s = await getSupplier(id)
      if (!s) { setMissing(true); return }
      const [st, h] = await Promise.all([listStations(id), listHistory(id)])
      const rows = await Promise.all(st.map(async (station) => ({ station, products: await listProducts(id, station.id) })))
      setSupplier(s); setStations(rows); setHistory(h)
    } catch (e: any) {
      console.error('loadSupplier', e)
      toast.error(`Failed to load supplier: ${e?.code || e?.message || e}`)
    } finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn(); toast.success(what); await load() }
    catch (e: any) { console.error(what, e); toast.error(`${what} failed: ${e?.code || e?.message || e}`) }
    finally { setBusy(false) }
  }

  if (loading) return <TableSkeleton rows={6} cols={4} />
  if (missing || !supplier || !admin) return (
    <EmptyState icon={<Tag size={24} />} title="Supplier not found" description="It may have been removed, or the link is wrong." />
  )

  const isSuper = admin.role === 'super_admin'
  const readiness = supplierReadiness(supplier, stations)
  const missingForSubmit = submissionProblems(supplier)
  const name = supplier.tradingName || supplier.legalName
  const verifiedStations = stations.filter((s) => s.station.status === 'verified').length
  const products = stations.flatMap((s) => s.products)
  const failing = readiness.checks.filter((c) => !c.ok).length
  const count: Partial<Record<TabId, number>> = { stations: stations.length, activity: history.length }

  const ordersButton = supplier.ordersEnabled ? (
    <button disabled={busy} onClick={() => run('Orders turned off', () => setOrdersEnabled(supplier.id, false, admin))} style={buttonStyle('warning', busy)}>
      <PowerOff size={13} /> Turn orders off
    </button>
  ) : (
    <button disabled={busy || !isSuper || !readiness.canEnableOrders}
      title={!isSuper ? 'Only a super admin can turn orders on.' : !readiness.canEnableOrders ? 'Every readiness check must pass first.' : undefined}
      onClick={() => run('Orders turned on', () => setOrdersEnabled(supplier.id, true, admin))}
      style={buttonStyle('primary', busy || !isSuper || !readiness.canEnableOrders)}>
      <Power size={13} /> Turn orders on
    </button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Sticky header + tabs */}
      <div className="sw-sticky">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', paddingBottom: '12px' }}>
          <Link href="/gas-suppliers" aria-label="Back to suppliers" className="btn btn-secondary" style={{ padding: '0 10px' }}><ArrowLeft size={15} /></Link>
          <Avatar name={name || 'Supplier'} size={38} />
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '19px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>{name}</h1>
              <StatusBadge status={supplier.status} />
              <OrdersBadge on={supplier.ordersEnabled} />
            </div>
            <div className="sw-sub" style={{ fontSize: '12px', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {supplier.tradingName ? `${supplier.legalName} · ` : ''}{label(supplier.operatingModel)} · <span style={{ fontFamily: 'var(--font-mono)' }}>{supplier.id}</span>
            </div>
          </div>
          <div className="sw-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <StatusActions supplier={supplier} admin={admin} onChanged={load} compact />
            <button onClick={() => setEditing(true)} className="btn btn-secondary" style={{ minHeight: '32px', fontSize: '12.5px' }}><Pencil size={13} /> Edit</button>
          </div>
        </div>
        <nav className="sw-tabs" role="tablist" aria-label="Supplier sections">
          {TABS.map((t) => (
            <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`}
              onClick={() => openTab(t.id)} className="sw-tab">
              {t.label}
              {count[t.id] !== undefined && <span className="sw-count">{count[t.id]}</span>}
            </button>
          ))}
        </nav>
      </div>

      {/* Overview */}
      <Panel id="overview" tab={tab} visited={visited}>
        <div className="sw-facts">
          <Fact k="Status" v={<StatusBadge status={supplier.status} />} />
          <Fact k="Orders" v={<OrdersBadge on={supplier.ordersEnabled} />} />
          <Fact k="Stations verified" v={`${verifiedStations} of ${stations.length}`} />
          <Fact k="Products verified" v={`${products.filter((p) => p.verified).length} of ${products.length}`} />
          <Fact k="Contact" v={[supplier.contact?.name, supplier.contact?.phone].filter(Boolean).join(' · ')} />
          <Fact k="Fulfilment" v={enabledOrderTypes(supplier.fulfillment).map(label).join(', ')} />
        </div>

        <Card title="Onboarding">
          {supplier.statusReason && <Notice tone={supplier.status === 'approved' ? 'info' : 'warning'}>Last reason: {supplier.statusReason}</Notice>}
          {supplier.status === 'draft' && missingForSubmit.length > 0 && (
            <Notice tone="warning">Before submitting for verification, add: {missingForSubmit.join(', ')}.</Notice>
          )}
          {/* On small screens the header hides its actions; they are here instead. */}
          <div className="sw-actions-inline"><StatusActions supplier={supplier} admin={admin} onChanged={load} /></div>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
            Approving, rejecting, suspending and reinstating need a super admin; the admin who created a supplier cannot approve it.
            Every change is recorded under Activity.
          </div>
        </Card>

        <Card title={<>Ready for live orders? <span style={{ fontSize: '12px', fontWeight: 600, color: failing ? 'var(--tone-warning-fg)' : 'var(--accent-text)', marginLeft: '6px' }}>
          {failing ? `${failing} of ${readiness.checks.length} checks to pass` : 'All checks pass'}</span></>} actions={ordersButton}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '6px 16px' }}>
            {readiness.checks.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: c.ok ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                {c.ok ? <CheckCircle2 size={15} color="var(--accent-text)" style={{ flexShrink: 0, marginTop: '2px' }} /> : <Circle size={15} color="var(--tone-danger-fg)" style={{ flexShrink: 0, marginTop: '2px' }} />}
                <span>{c.label}{c.detail && <span style={{ color: 'var(--text-tertiary)' }}> — {c.detail}</span>}</span>
              </div>
            ))}
          </div>
          {/* Live status from the backend, the switches and this supplier's configuration. */}
          <DispatchStatus supplierId={supplier.id} ordersEnabled={supplier.ordersEnabled === true} readiness={readiness} />
        </Card>
      </Panel>

      {/* Business details */}
      <Panel id="business" tab={tab} visited={visited}>
        <Card title="Business and contact" actions={<button onClick={() => setEditing(true)} className="btn btn-secondary"><Pencil size={13} /> Edit</button>}>
          <div className="sw-kv">
            <KeyValue k="Legal name" v={supplier.legalName} />
            <KeyValue k="Trading name" v={supplier.tradingName} />
            <KeyValue k="Operating model" v={label(supplier.operatingModel)} />
            <KeyValue k="Business address" v={supplier.address} />
            <KeyValue k="Contact person" v={supplier.contact?.name} />
            <KeyValue k="Phone" v={supplier.contact?.phone} />
            <KeyValue k="Email" v={supplier.contact?.email} />
            <KeyValue k="Fulfilment" v={enabledOrderTypes(supplier.fulfillment).map(label).join(', ')} />
            <KeyValue k="Rider arrangement" v={label(supplier.riderArrangement)} />
          </div>
        </Card>
        <Card title="Registration and verification">
          <div className="sw-kv">
            <KeyValue k="Registration no." v={supplier.registration?.businessRegNo} />
            <KeyValue k="Licence no." v={supplier.registration?.licenceNo} />
            <KeyValue k="Licence expiry" v={supplier.registration?.licenceExpiry} />
            <KeyValue k="Created" v={formatDate(supplier.createdAt)} />
            <KeyValue k="Last updated" v={formatDate(supplier.updatedAt)} />
          </div>
          <KeyValue k="Verification notes" v={supplier.verificationNotes && <span style={{ whiteSpace: 'pre-wrap' }}>{supplier.verificationNotes}</span>} />
          <KeyValue k="Internal notes" v={supplier.internalNotes && <span style={{ whiteSpace: 'pre-wrap' }}>{supplier.internalNotes}</span>} />
        </Card>
      </Panel>

      {/* Stations and catalog */}
      <Panel id="stations" tab={tab} visited={visited}>
        <Card title={`Stations (${stations.length})`} actions={
          <button onClick={() => setStationForm({})} className="btn btn-primary"><Plus size={13} /> Add station</button>
        }>
          {stations.length === 0 && <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>No stations yet. Add the supplier&apos;s first station to list its products and prices.</div>}
          {stations.map(({ station, products }) => {
            const verifyProblems = stationVerificationProblems(station)
            return (
              <details key={station.id} open={stations.length === 1} className="sw-station">
                <summary>
                  <div style={{ flex: 1, minWidth: '180px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{station.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                      {station.address || 'No address'} · {products.length} {products.length === 1 ? 'product' : 'products'}
                    </div>
                  </div>
                  <StatusBadge status={station.status} />
                </summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button onClick={() => setStationForm({ station })} style={buttonStyle('secondary')}><Pencil size={12} /> Edit station</button>
                    {station.status !== 'verified' ? (
                      <button disabled={busy || !isSuper || verifyProblems.length > 0}
                        title={!isSuper ? 'Only a super admin can verify a station.' : verifyProblems.length ? `Missing: ${verifyProblems.join(', ')}` : undefined}
                        onClick={() => run('Station verified', () => setStationStatus(supplier.id, station.id, 'verified', admin))}
                        style={buttonStyle('primary', busy || !isSuper || verifyProblems.length > 0)}>
                        <ShieldCheck size={12} /> Verify
                      </button>
                    ) : (
                      <button disabled={busy} onClick={() => run('Station returned to draft', () => setStationStatus(supplier.id, station.id, 'draft', admin))} style={buttonStyle('secondary', busy)}>
                        Mark as draft
                      </button>
                    )}
                    {station.status !== 'inactive' && (
                      <button disabled={busy} onClick={() => run('Station deactivated', () => setStationStatus(supplier.id, station.id, 'inactive', admin))} style={buttonStyle('warning', busy)}>
                        Deactivate
                      </button>
                    )}
                  </div>
                  <div className="sw-kv">
                    <KeyValue k="Contact" v={[station.contact?.name, station.contact?.phone].filter(Boolean).join(' · ')} />
                    <KeyValue k="Hours" v={station.operatingHours} />
                    <KeyValue k="Service area" v={[station.serviceArea, station.serviceRadiusKm ? `${station.serviceRadiusKm} km` : ''].filter(Boolean).join(' · ')} />
                    <KeyValue k="Location" v={station.location && `${station.location.latitude.toFixed(5)}, ${station.location.longitude.toFixed(5)}`} />
                    <KeyValue k="Sizes" v={(station.supportedSizes ?? []).map(label).join(', ')} />
                    <KeyValue k="Fulfilment" v={enabledOrderTypes(station.fulfillment).map(label).join(', ')} />
                    <KeyValue k="Stock approach" v={label(station.stockApproach)} />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', flex: 1 }}>Products and prices</div>
                    <button onClick={() => setProductForm({ stationId: station.id })} style={buttonStyle('secondary')}><Plus size={12} /> Add product</button>
                  </div>
                  {products.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>No products. Add only prices the supplier has confirmed.</div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="data-table">
                        <thead><tr><th>Order type</th><th>Size</th><th>Brand</th><th>Price</th><th>Handling</th><th>Version</th><th>Verified</th><th>Availability</th><th>Actions</th></tr></thead>
                        <tbody>
                          {products.map((p) => (
                            <tr key={p.id}>
                              <td style={{ fontSize: '12px' }}>{label(p.orderType)}</td>
                              <td style={{ fontSize: '12px' }}>{label(p.cylinderSize)}</td>
                              <td style={{ fontSize: '12px' }}>{label(p.brand)}</td>
                              <td style={{ fontWeight: 700 }}>{formatCurrency(p.price)}</td>
                              <td>{formatCurrency(p.handlingFee)}</td>
                              <td>v{p.priceVersion}</td>
                              <td><StatusBadge status={p.verified ? 'verified' : 'unverified'} /></td>
                              <td>
                                <select value={p.availability} disabled={busy} aria-label={`Availability of ${label(p.cylinderSize)} ${label(p.brand)}`}
                                  onChange={(e) => run('Availability updated', () => setProductAvailability(supplier.id, station.id, p.id, e.target.value as ProductAvailability, admin))}
                                  style={{ ...inputStyle, width: 'auto', padding: '4px 8px', fontSize: '12px' }}>
                                  {PRODUCT_AVAILABILITY.map((a) => (
                                    <option key={a} value={a} disabled={a === 'available' && !p.verified}>{label(a)}{a === 'available' && !p.verified ? ' (verify first)' : ''}</option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <button onClick={() => setProductForm({ stationId: station.id, product: p })} style={buttonStyle('secondary')}>Price</button>
                                  {p.verified ? (
                                    <button disabled={busy} onClick={() => run('Product unverified', () => verifyProduct(supplier.id, station.id, p.id, false, admin))} style={buttonStyle('warning', busy)}>Unverify</button>
                                  ) : (
                                    <button disabled={busy || !isSuper} title={!isSuper ? 'Only a super admin can verify a product and its price.' : undefined}
                                      onClick={() => run('Product verified', () => verifyProduct(supplier.id, station.id, p.id, true, admin))} style={buttonStyle('primary', busy || !isSuper)}>Verify</button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </details>
            )
          })}
        </Card>
      </Panel>

      {/* Operations */}
      <Panel id="operations" tab={tab} visited={visited}>
        <ServiceTimes stations={stations.map(({ station }) => ({ id: station.id, name: String(station.name ?? station.id) }))} />
        <Card title="Orders and settlement">
          <Notice>
            No Gas orders are linked to suppliers yet, so there are no supplier orders, commissions, payable balances or
            settlement statements to show. These appear here once orders carry a supplier and station and the backend
            records supplier settlement. No supplier payouts can be made from the dashboard.
          </Notice>
        </Card>
      </Panel>

      {/* Linked riders (super-admin callables in gas_supplier_riders.js) */}
      <Panel id="riders" tab={tab} visited={visited}><SupplierRiders supplierId={supplier.id} /></Panel>

      {/* Supplier logins (managed by the supplier portal's staff API) */}
      <Panel id="logins" tab={tab} visited={visited}><SupplierLogins supplierId={supplier.id} /></Panel>

      {/* History */}
      <Panel id="activity" tab={tab} visited={visited}>
        <Card title="Status and orders history">
          {history.length === 0 ? <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>No history.</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>#</th><th>Change</th><th>Reason</th><th>By</th><th>When</th></tr></thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td>{h.seq}</td>
                      <td style={{ fontSize: '12px' }}>
                        {h.type === 'created' ? 'Created as draft'
                          : h.type === 'orders_enabled' ? 'Orders turned on'
                          : h.type === 'orders_disabled' ? 'Orders turned off'
                          : `${label(h.fromStatus)} → ${label(h.toStatus)}`}
                      </td>
                      <td style={{ fontSize: '12px' }}>{h.reason || '—'}</td>
                      <td style={{ fontSize: '12px' }}>{h.byEmail || h.by}</td>
                      <td style={{ fontSize: '11px' }}>{formatDate(h.at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </Panel>

      {editing && <SupplierForm supplier={supplier} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load() }} />}
      {stationForm && (
        <StationForm supplierId={supplier.id} station={stationForm.station}
          onClose={() => setStationForm(null)} onSaved={() => { setStationForm(null); load() }} />
      )}
      {productForm && (
        <ProductForm supplierId={supplier.id} stationId={productForm.stationId} product={productForm.product}
          onClose={() => setProductForm(null)} onSaved={() => { setProductForm(null); load() }} />
      )}
    </div>
  )
}

function Panel({ id, tab, visited, children }: { id: TabId; tab: TabId; visited: ReadonlySet<TabId>; children: React.ReactNode }) {
  if (!visited.has(id)) return null
  return (
    <section role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={tab !== id}
      style={{ display: tab === id ? 'flex' : 'none', flexDirection: 'column', gap: '16px' }}>
      {children}
    </section>
  )
}

function Fact({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="sw-fact">
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k}</div>
      <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{v || '—'}</div>
    </div>
  )
}
