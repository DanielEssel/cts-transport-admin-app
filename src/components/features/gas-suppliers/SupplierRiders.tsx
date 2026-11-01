'use client'
// Riders linked to one supplier (gas_supplier_riders), managed through the
// super-admin callables in gas_supplier_riders.js: link a CTSGo driver, revoke
// a link with a reason, and read the audit trail. A linked rider delivers only
// this supplier's orders, and CTSGo (not the supplier) pays the rider's fee.
// Revoking voids any order already confirmed to the rider; the server decides.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { toast } from 'sonner'
import { functions } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import { Card, Field, Modal, Notice, TextArea, buttonStyle } from './ui'
import { DriverPicker } from './DriverPicker'
import type { RiderCandidate } from '@/lib/rider-picker'

interface Rider { driverId: string; name: string | null; vehicle: string | null; status: string; version: number; linkedAt: number | null; linkedBy: string | null; revokedAt: number | null; revokeReason: string | null }
interface AuditRow { id: string; action: string; driverId?: string; by?: string; at: number | null; reason?: string; voidedOrderId?: string }

const when = (ms: number | null | undefined) => (typeof ms === 'number' ? new Date(ms).toLocaleString() : '—')
const callError = (e: unknown) => {
  const reason = (e as { details?: { reason?: string } })?.details?.reason
  return reason ? `${(e as Error).message} (${reason})` : (e as Error)?.message || 'The request failed.'
}

export function SupplierRiders({ supplierId }: { supplierId: string }) {
  const { admin } = useAuth()
  const isSuper = admin?.role === 'super_admin'
  const [riders, setRiders] = useState<Rider[] | null>(null)
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<RiderCandidate | null>(null)
  const [confirmLink, setConfirmLink] = useState(false)
  const [revoking, setRevoking] = useState<Rider | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const r: any = (await httpsCallable(functions, 'adminListGasSupplierRiders')({ supplierId })).data
      setRiders(Array.isArray(r?.riders) ? r.riders : []); setAudit(Array.isArray(r?.audit) ? r.audit : []); setError(null)
    } catch (e) { setRiders([]); setError(callError(e)) }
  }, [supplierId])
  useEffect(() => { load() }, [load])

  const linkedHere = useMemo(() => new Set((riders ?? []).filter((r) => r.status === 'active').map((r) => r.driverId)), [riders])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } catch (e) { toast.error(callError(e)) } finally { setBusy(false) }
  }

  return (
    <Card title="Supplier riders">
      <Notice>
        A linked rider is a CTSGo driver who delivers this supplier&apos;s orders. CTSGo pays the rider&apos;s delivery fee to the rider&apos;s
        wallet; it is never added to the supplier&apos;s proceeds. Revoking a link voids any order already confirmed to that rider.
      </Notice>
      {error && <Notice tone="danger">{error}</Notice>}
      {isSuper ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Link a rider</div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 320px', minWidth: 0 }}>
              <DriverPicker linkedHere={linkedHere} selected={picked} onSelect={setPicked} disabled={busy} />
            </div>
            <button className="btn btn-primary" disabled={busy || !picked} onClick={() => setConfirmLink(true)} style={{ minHeight: '38px' }}>
              Link rider…
            </button>
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>
            Only approved delivery drivers can be chosen. On linking, the server also checks the driver is not an admin, a supplier login or linked to another supplier.
          </div>
        </div>
      ) : (
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Only a super admin can link or revoke riders.</div>
      )}

      {riders === null ? <div style={{ fontSize: '13px' }}>Loading…</div> : riders.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>No riders linked to this supplier.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Rider</th><th>Vehicle</th><th>Status</th><th>Linked</th><th /></tr></thead>
            <tbody>
              {riders.map((r) => (
                <tr key={r.driverId}>
                  <td>{r.name ?? '—'}<div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-tertiary)' }}>{r.driverId}</div></td>
                  <td>{r.vehicle ?? '—'}</td>
                  <td>{r.status === 'active' ? 'Active' : `Revoked${r.revokeReason ? ` (${r.revokeReason})` : ''}`}</td>
                  <td>{when(r.linkedAt)}{r.status !== 'active' && r.revokedAt ? ` · revoked ${when(r.revokedAt)}` : ''}</td>
                  <td style={{ textAlign: 'right' }}>
                    {isSuper && r.status === 'active' && <button style={buttonStyle('danger', busy)} disabled={busy} onClick={() => { setRevoking(r); setReason('') }}>Revoke…</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {audit.length > 0 && (
        <details>
          <summary style={{ fontSize: '13px', cursor: 'pointer' }}>Audit trail ({audit.length})</summary>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>When</th><th>Action</th><th>Driver</th><th>By</th><th>Reason</th></tr></thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td>{when(a.at)}</td>
                    <td>{a.action}{a.voidedOrderId ? ` · voided order ${a.voidedOrderId.slice(0, 10)}` : ''}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{a.driverId ?? '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{a.by ?? '—'}</td>
                    <td>{a.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {confirmLink && picked && (
        <Modal title={`Link ${picked.name} as a rider?`} onClose={() => setConfirmLink(false)} width={480} footer={<>
          <button className="btn btn-secondary" onClick={() => setConfirmLink(false)}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => run(async () => {
            await httpsCallable(functions, 'adminLinkGasSupplierRider')({ supplierId, driverId: picked.id })
            toast.success(`${picked.name} linked as a rider.`); setConfirmLink(false); setPicked(null); await load()
          })}>{busy ? 'Linking…' : 'Link rider'}</button>
        </>}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <b style={{ color: 'var(--text-primary)' }}>{picked.name}</b>{picked.phone ? ` (${picked.phone})` : ''} will deliver only this supplier&apos;s orders.
            CTSGo pays the rider&apos;s delivery fee to the rider&apos;s wallet.
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>Driver ID {picked.id}</div>
        </Modal>
      )}

      {revoking && (
        <Modal title={`Revoke ${revoking.name ?? revoking.driverId}?`} onClose={() => setRevoking(null)} footer={<>
          <button className="btn btn-secondary" onClick={() => setRevoking(null)}>Cancel</button>
          <button style={buttonStyle('danger', busy || reason.trim().length < 3)} disabled={busy || reason.trim().length < 3} onClick={() => run(async () => {
            await httpsCallable(functions, 'adminRevokeGasSupplierRider')({ driverId: revoking.driverId, reason: reason.trim() })
            setRevoking(null); setReason(''); toast.success('Rider link revoked.'); await load()
          })}>Revoke</button>
        </>}>
          <Notice tone="warning">An order already confirmed to this rider is voided. The server records which one in the audit trail.</Notice>
          <Field label="Reason" hint="Required and recorded."><TextArea value={reason} onChange={setReason} /></Field>
        </Modal>
      )}
    </Card>
  )
}
