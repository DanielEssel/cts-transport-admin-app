'use client'
// Review one supplier from the list without leaving it: the submitted
// details, what is still missing, and the same status actions as the
// supplier workspace (StatusActions), which keeps every rule and dialog.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Circle, ExternalLink } from 'lucide-react'
import type { Admin } from '@/types'
import { StatusBadge } from '@/components/shared'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  applicationChecklist, enabledOrderTypes, historyLabel, label, stationVerificationProblems,
  type Product, type Station, type Supplier,
} from '@/lib/gas-suppliers'
import { listHistory, listProducts, listStations, type HistoryEntry } from '@/lib/gas-supplier-data'
import { stockOwnerLabel, waitingFor } from '@/lib/gas-admin'
import { KeyValue, Modal, Notice, OrdersBadge } from './ui'
import { StatusActions } from './StatusActions'

export function SupplierReview({ supplier, stationCount, admin, position, onClose, onChanged }: {
  supplier: Supplier; stationCount: number | null; admin: Admin
  /** e.g. "2 of 5 awaiting verification" */
  position?: string
  onClose: () => void; onChanged: () => void | Promise<void>
}) {
  const name = supplier.tradingName || supplier.legalName
  const [stations, setStations] = useState<Array<{ station: Station; products: Product[] }> | null>(null)
  const [stationsError, setStationsError] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryEntry[] | null>(null)

  useEffect(() => {
    let live = true
    setStations(null); setStationsError(null)
    listStations(supplier.id)
      .then((st) => Promise.all(st.map(async (station) => ({ station, products: await listProducts(supplier.id, station.id) }))))
      .then((rows) => { if (live) setStations(rows) })
      .catch((e) => { if (live) { setStations([]); setStationsError(e?.code || e?.message || 'Stations could not be loaded.') } })
    listHistory(supplier.id).then((h) => { if (live) setHistory(h) }, () => { if (live) setHistory([]) })
    return () => { live = false }
  }, [supplier.id, supplier.auditSeq])

  const checks = stations && applicationChecklist(supplier, stations, new Date().toISOString().slice(0, 10))
  return (
    <Modal title={`Review: ${name}`} onClose={onClose} width={760} footer={<>
      <Link href={`/gas-suppliers/${supplier.id}`} className="btn btn-secondary" style={{ marginRight: 'auto', textDecoration: 'none' }}>
        <ExternalLink size={13} /> Open workspace
      </Link>
      <StatusActions supplier={supplier} admin={admin} onChanged={onChanged} />
    </>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <StatusBadge status={supplier.status} />
        <OrdersBadge on={supplier.ordersEnabled} />
        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{supplier.id}</span>
        {supplier.status === 'pending_verification' && (
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
            · submitted {formatDate(supplier.statusChangedAt)}{waitingFor(supplier.statusChangedAt, Date.now()) && `, waiting ${waitingFor(supplier.statusChangedAt, Date.now())}`}
          </span>
        )}
        {position && <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-tertiary)' }}>{position}</span>}
      </div>

      {supplier.status === 'pending_verification' && (
        <Notice>
          Approval needs a super admin who did not create this supplier. Rejecting or requesting corrections needs a reason,
          recorded in the history. Approval does not turn orders on. The checklist is a guide; it does not block a decision.
        </Notice>
      )}
      {supplier.statusReason && <Notice tone="warning">Last reason: {supplier.statusReason}</Notice>}

      <section aria-label="Verification checklist" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '6px 16px' }}>
        {checks === null ? <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Checking the application…</div> : checks.map((c) => (
          <div key={c.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '13px', color: 'var(--text-primary)' }}>
            {c.ok ? <CheckCircle2 size={15} color="var(--accent-text)" style={{ flexShrink: 0, marginTop: '2px' }} />
              : <Circle size={15} color="var(--tone-warning-fg)" style={{ flexShrink: 0, marginTop: '2px' }} />}
            <span>{c.label}{c.detail && <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-tertiary)' }}>{c.detail}</span>}</span>
          </div>
        ))}
      </section>

      <ReviewSection title="Business">
        <KeyValue k="Legal name" v={supplier.legalName} />
        <KeyValue k="Trading name" v={supplier.tradingName} />
        <KeyValue k="Operating model" v={label(supplier.operatingModel)} />
        <KeyValue k="Business address" v={supplier.address} />
        <KeyValue k="Fulfilment" v={enabledOrderTypes(supplier.fulfillment).map(label).join(', ')} />
        <KeyValue k="Rider arrangement" v={label(supplier.riderArrangement)} />
      </ReviewSection>
      <ReviewSection title="Contact">
        <KeyValue k="Contact person" v={supplier.contact?.name} />
        <KeyValue k="Phone" v={supplier.contact?.phone} />
        <KeyValue k="Email" v={supplier.contact?.email} />
      </ReviewSection>
      <ReviewSection title="Registration">
        <KeyValue k="Registration no." v={supplier.registration?.businessRegNo} />
        <KeyValue k="Licence no." v={supplier.registration?.licenceNo} />
        <KeyValue k="Licence expiry" v={supplier.registration?.licenceExpiry} />
        <KeyValue k="Created" v={formatDate(supplier.createdAt)} />
        <KeyValue k="Last updated" v={formatDate(supplier.updatedAt)} />
      </ReviewSection>
      <section style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
        <h4 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Stations and prices {stations ? `(${stations.length})` : stationCount !== null ? `(${stationCount})` : ''}
        </h4>
        {stationsError && <Notice tone="danger">Stations could not be loaded ({stationsError}).</Notice>}
        {stations === null ? <div className="skeleton" style={{ height: '48px' }} /> : stations.length === 0 ? (
          <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>No stations yet.</div>
        ) : stations.map(({ station, products }) => {
          const gaps = station.status === 'verified' ? [] : stationVerificationProblems(station)
          return (
            <div key={station.id} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '160px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{station.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    {[station.address, station.operatingHours, station.contact?.phone].filter(Boolean).join(' · ') || 'No address, hours or phone'}
                  </div>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{stockOwnerLabel(station.stockApproach)}</span>
                <StatusBadge status={station.status} />
              </div>
              {gaps.length > 0 && <div style={{ fontSize: '12px', color: 'var(--tone-warning-fg)' }}>Needed to verify: {gaps.join(', ')}</div>}
              {products.length === 0 ? <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>No products.</div> : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead><tr><th>Product</th><th>Proposed price</th><th>Handling</th><th>Verified</th><th>Availability</th></tr></thead>
                    <tbody>
                      {products.map((p) => (
                        <tr key={p.id}>
                          <td style={{ fontSize: '12px' }}>{label(p.orderType)} · {label(p.cylinderSize)} · {label(p.brand)}</td>
                          <td style={{ fontWeight: 700 }}>{formatCurrency(p.price)}</td>
                          <td>{formatCurrency(p.handlingFee)}</td>
                          <td><StatusBadge status={p.verified ? 'verified' : 'unverified'} /></td>
                          <td><StatusBadge status={p.availability} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Verify stations and prices in the supplier workspace (Stations &amp; prices).</div>
      </section>

      <ReviewSection title="Verification">
        <KeyValue k="Documents" v={supplier.verificationNotes?.trim() ? 'Manual verification recorded' : 'Not yet provided'} />
        <KeyValue k="Verification notes" v={supplier.verificationNotes && <span style={{ whiteSpace: 'pre-wrap' }}>{supplier.verificationNotes}</span>} />
      </ReviewSection>
      <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '-6px' }}>
        Suppliers cannot upload documents through CTSGo yet; record what you checked in the verification notes (Edit, in the workspace).
      </div>

      <section style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
        <h4 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Activity</h4>
        {history === null ? <div className="skeleton" style={{ height: '40px' }} /> : history.length === 0 ? (
          <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>No history.</div>
        ) : history.slice(0, 6).map((h) => (
          <div key={h.id} style={{ display: 'flex', gap: '10px', fontSize: '12.5px', alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{historyLabel(h)}</span>
            {h.reason && <span style={{ color: 'var(--text-secondary)' }}>“{h.reason}”</span>}
            <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)' }}>{h.byEmail || h.by} · {formatDate(h.at)}</span>
          </div>
        ))}
      </section>
    </Modal>
  )
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
      <h4 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</h4>
      <div className="sw-kv">{children}</div>
    </section>
  )
}
