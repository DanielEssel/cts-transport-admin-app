'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, CheckCircle2, Circle, Pencil, Plus, ShieldCheck, Power, PowerOff, Tag } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { EmptyState, StatusBadge, TableSkeleton } from '@/components/shared'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  PRODUCT_AVAILABILITY, enabledOrderTypes, label, stationVerificationProblems, submissionProblems,
  supplierReadiness, transitionProblem, transitionsFrom,
  type Product, type ProductAvailability, type Station, type Supplier, type Transition,
} from '@/lib/gas-suppliers'
import {
  changeSupplierStatus, getSupplier, listHistory, listProducts, listStations, setOrdersEnabled,
  setProductAvailability, setStationStatus, verifyProduct, type HistoryEntry,
} from '@/lib/gas-supplier-data'
import { SupplierForm } from '@/components/features/gas-suppliers/SupplierForm'
import { StationForm } from '@/components/features/gas-suppliers/StationForm'
import { ProductForm } from '@/components/features/gas-suppliers/ProductForm'
import { SupplierLogins } from '@/components/features/gas-suppliers/SupplierLogins'
import { Card, Field, KeyValue, Modal, Notice, OrdersBadge, TextArea, buttonStyle, inputStyle } from '@/components/features/gas-suppliers/ui'

type StationRow = { station: Station; products: Product[] }

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { admin } = useAuth()
  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [stations, setStations] = useState<StationRow[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)

  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState<Transition | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [stationForm, setStationForm] = useState<{ station?: Station } | null>(null)
  const [productForm, setProductForm] = useState<{ stationId: string; product?: Product } | null>(null)

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

  const actor = { uid: admin.uid, role: admin.role }
  const isSuper = admin.role === 'super_admin'
  const readiness = supplierReadiness(supplier, stations)
  const missingForSubmit = submissionProblems(supplier)

  const confirmTransition = () => {
    if (!pending) return
    const t = pending
    run(t.action, async () => {
      await changeSupplierStatus(supplier.id, t.to, reason.trim() || null, admin)
      setPending(null); setReason('')
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <Link href="/gas-suppliers" style={{ ...buttonStyle('secondary'), textDecoration: 'none' }}><ArrowLeft size={13} /> Suppliers</Link>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>{supplier.tradingName || supplier.legalName}</h1>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
            {supplier.legalName} · <span style={{ fontFamily: 'var(--font-mono)' }}>{supplier.id}</span>
          </div>
        </div>
        <StatusBadge status={supplier.status} />
        <OrdersBadge on={supplier.ordersEnabled} />
        <button onClick={() => setEditing(true)} style={buttonStyle('secondary')}><Pencil size={13} /> Edit</button>
      </div>

      {/* Workflow */}
      <Card title="Onboarding status">
        {supplier.statusReason && <Notice tone={supplier.status === 'approved' ? 'info' : 'warning'}>Last reason: {supplier.statusReason}</Notice>}
        {supplier.status === 'draft' && missingForSubmit.length > 0 && (
          <Notice tone="warning">Before submitting for verification, add: {missingForSubmit.join(', ')}.</Notice>
        )}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {transitionsFrom(supplier.status).map((t) => {
            // The reason is asked for in the dialog, so ignore it here.
            const problem = transitionProblem(actor, supplier, t.to, 'x'.repeat(10))
              ?? (t.to === 'pending_verification' && supplier.status === 'draft' && missingForSubmit.length ? 'Complete the required details first.' : null)
            const kind = t.to === 'approved' ? 'primary' : t.to === 'rejected' || t.to === 'suspended' ? 'danger' : 'secondary'
            return (
              <button key={t.to} disabled={!!problem || busy} title={problem ?? undefined}
                onClick={() => { setPending(t); setReason('') }} style={buttonStyle(kind, !!problem || busy)}>
                {t.action}
              </button>
            )
          })}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
          Approving, rejecting, suspending and reinstating need a super admin; the admin who created a supplier cannot approve it.
          Every change is recorded below.
        </div>
      </Card>

      {/* Readiness */}
      <Card title="Ready for live orders?" actions={
        supplier.ordersEnabled ? (
          <button disabled={busy} onClick={() => run('Orders turned off', () => setOrdersEnabled(supplier.id, false, admin))} style={buttonStyle('warning', busy)}>
            <PowerOff size={13} /> Turn orders off
          </button>
        ) : (
          <button disabled={busy || !isSuper || !readiness.canEnableOrders}
            title={!isSuper ? 'Only a super admin can turn orders on.' : !readiness.canEnableOrders ? 'Every check below must pass first.' : undefined}
            onClick={() => run('Orders turned on', () => setOrdersEnabled(supplier.id, true, admin))}
            style={buttonStyle('primary', busy || !isSuper || !readiness.canEnableOrders)}>
            <Power size={13} /> Turn orders on
          </button>
        )
      }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {readiness.checks.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: c.ok ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
              {c.ok ? <CheckCircle2 size={15} color="#4ade80" /> : <Circle size={15} color="#f87171" />}
              {c.label}{c.detail && <span style={{ color: 'var(--text-tertiary)' }}> — {c.detail}</span>}
            </div>
          ))}
        </div>
        <Notice>
          Gas dispatch does not use suppliers yet: orders are still priced from Settings → Gas and offered to CTSGo
          drivers. This switch records that the supplier is cleared for orders; it starts routing orders only once
          supplier dispatch is built and released.
        </Notice>
      </Card>

      {/* Details */}
      <Card title="Supplier details">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
          <KeyValue k="Operating model" v={label(supplier.operatingModel)} />
          <KeyValue k="Business address" v={supplier.address} />
          <KeyValue k="Contact person" v={supplier.contact?.name} />
          <KeyValue k="Phone" v={supplier.contact?.phone} />
          <KeyValue k="Email" v={supplier.contact?.email} />
          <KeyValue k="Registration no." v={supplier.registration?.businessRegNo} />
          <KeyValue k="Licence no." v={supplier.registration?.licenceNo} />
          <KeyValue k="Licence expiry" v={supplier.registration?.licenceExpiry} />
          <KeyValue k="Fulfilment" v={enabledOrderTypes(supplier.fulfillment).map(label).join(', ')} />
          <KeyValue k="Rider arrangement" v={label(supplier.riderArrangement)} />
          <KeyValue k="Created" v={formatDate(supplier.createdAt)} />
          <KeyValue k="Last updated" v={formatDate(supplier.updatedAt)} />
        </div>
        {supplier.verificationNotes && <KeyValue k="Verification notes" v={<span style={{ whiteSpace: 'pre-wrap' }}>{supplier.verificationNotes}</span>} />}
        {supplier.internalNotes && <KeyValue k="Internal notes" v={<span style={{ whiteSpace: 'pre-wrap' }}>{supplier.internalNotes}</span>} />}
      </Card>

      {/* Stations and catalog */}
      <Card title={`Stations (${stations.length})`} actions={
        <button onClick={() => setStationForm({})} style={buttonStyle('primary')}><Plus size={13} /> Add station</button>
      }>
        {stations.length === 0 && <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>No stations yet.</div>}
        {stations.map(({ station, products }) => {
          const verifyProblems = stationVerificationProblems(station)
          return (
            <div key={station.id} style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '180px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{station.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    {station.address || 'No address'}
                    {station.location && ` · ${station.location.latitude.toFixed(5)}, ${station.location.longitude.toFixed(5)}`}
                  </div>
                </div>
                <StatusBadge status={station.status} />
                <button onClick={() => setStationForm({ station })} style={buttonStyle('secondary')}><Pencil size={12} /> Edit</button>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
                <KeyValue k="Contact" v={[station.contact?.name, station.contact?.phone].filter(Boolean).join(' · ')} />
                <KeyValue k="Hours" v={station.operatingHours} />
                <KeyValue k="Service area" v={[station.serviceArea, station.serviceRadiusKm ? `${station.serviceRadiusKm} km` : ''].filter(Boolean).join(' · ')} />
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
                            <select value={p.availability} disabled={busy}
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
          )
        })}
      </Card>

      {/* Orders and settlement */}
      <Card title="Orders and settlement">
        <Notice>
          No Gas orders are linked to suppliers yet, so there are no supplier orders, commissions, payable balances or
          settlement statements to show. These appear here once orders carry a supplier and station and the backend
          records supplier settlement. No supplier payouts can be made from the dashboard.
        </Notice>
      </Card>

      {/* Supplier logins (managed by the supplier portal's staff API) */}
      <SupplierLogins supplierId={supplier.id} />

      {/* History */}
      <Card title="History">
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

      {pending && (
        <Modal title={`${pending.action}: ${supplier.tradingName || supplier.legalName}`} onClose={() => setPending(null)} width={480}
          footer={<>
            <button onClick={() => setPending(null)} style={buttonStyle('secondary')}>Cancel</button>
            <button disabled={busy || (pending.reasonRequired && reason.trim().length < 3)} onClick={confirmTransition}
              style={buttonStyle(pending.to === 'rejected' || pending.to === 'suspended' ? 'danger' : 'primary', busy || (pending.reasonRequired && reason.trim().length < 3))}>
              {busy ? 'Saving…' : pending.action}
            </button>
          </>}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {label(supplier.status)} → <b>{label(pending.to)}</b>.
            {supplier.ordersEnabled && ' Orders will be turned off.'}
            {pending.to === 'approved' && ' Approval does not turn orders on; that is a separate step once stations and products are verified.'}
          </div>
          <Field label={pending.reasonRequired ? 'Reason *' : 'Reason (optional)'}>
            <TextArea value={reason} onChange={setReason} />
          </Field>
        </Modal>
      )}

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
