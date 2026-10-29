'use client'
// Riders linked to one supplier (gas_supplier_riders), managed through the
// super-admin callables in gas_supplier_riders.js: link a CTSGo driver, revoke
// a link with a reason, and read the audit trail. A linked rider delivers only
// this supplier's orders, and CTSGo (not the supplier) pays the rider's fee.
// Revoking voids any order already confirmed to the rider; the server decides.
import { useCallback, useEffect, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { toast } from 'sonner'
import { functions } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import { Card, Field, Modal, Notice, TextArea, TextInput, buttonStyle } from './ui'

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
  const [driverId, setDriverId] = useState('')
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

      {isSuper && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Field label="Driver ID" hint="The CTSGo driver's ID. The server checks the driver is eligible and not linked to another supplier.">
            <TextInput value={driverId} onChange={setDriverId} />
          </Field>
          <button style={buttonStyle('primary', busy || !driverId.trim())} disabled={busy || !driverId.trim()} onClick={() => run(async () => {
            await httpsCallable(functions, 'adminLinkGasSupplierRider')({ supplierId, driverId: driverId.trim() })
            setDriverId(''); toast.success('Rider linked.'); await load()
          })}>Link rider</button>
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

      {revoking && (
        <Modal title={`Revoke ${revoking.name ?? revoking.driverId}?`} onClose={() => setRevoking(null)} footer={
          <button style={buttonStyle('danger', busy || reason.trim().length < 3)} disabled={busy || reason.trim().length < 3} onClick={() => run(async () => {
            await httpsCallable(functions, 'adminRevokeGasSupplierRider')({ driverId: revoking.driverId, reason: reason.trim() })
            setRevoking(null); setReason(''); toast.success('Rider link revoked.'); await load()
          })}>Revoke</button>
        }>
          <Notice tone="warning">An order already confirmed to this rider is voided. The server records which one in the audit trail.</Notice>
          <Field label="Reason" hint="Required and recorded."><TextArea value={reason} onChange={setReason} /></Field>
        </Modal>
      )}
    </Card>
  )
}
