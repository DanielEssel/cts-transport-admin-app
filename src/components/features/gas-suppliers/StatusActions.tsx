'use client'
// A supplier's status actions (Submit, Approve, Reject, Suspend, …) and their
// confirmation dialog, shared by the supplier list's review panel and the
// supplier workspace. Which actions exist, who may take them and whether a
// reason is needed all come from TRANSITIONS / transitionProblem; the change
// itself is changeSupplierStatus, as before.
import { useState } from 'react'
import { toast } from 'sonner'
import type { Admin } from '@/types'
import {
  MIN_REASON_LENGTH, label, submissionProblems, transitionProblem, transitionsFrom,
  type Supplier, type Transition,
} from '@/lib/gas-suppliers'
import { changeSupplierStatus } from '@/lib/gas-supplier-data'
import { Field, Modal, Notice, TextArea } from './ui'

const kindOf = (t: Transition) =>
  t.to === 'approved' ? 'btn-primary' : t.to === 'rejected' || t.to === 'suspended' ? 'btn-danger' : 'btn-secondary'

/** Why this action is unavailable to the admin now, or null. The reason is asked for in the dialog. */
export function actionProblem(admin: Admin, supplier: Supplier, t: Transition): string | null {
  const missing = submissionProblems(supplier)
  return transitionProblem({ uid: admin.uid, role: admin.role }, supplier, t.to, 'x'.repeat(200))
    ?? (t.to === 'pending_verification' && supplier.status === 'draft' && missing.length ? 'Complete the required details first.' : null)
}

export function StatusActions({ supplier, admin, onChanged, compact }: {
  supplier: Supplier; admin: Admin; onChanged: () => void | Promise<void>; compact?: boolean
}) {
  const [pending, setPending] = useState<Transition | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const transitions = transitionsFrom(supplier.status)
  if (transitions.length === 0) return null

  const confirm = async () => {
    if (!pending) return
    setBusy(true)
    try {
      await changeSupplierStatus(supplier.id, pending.to, reason.trim() || null, admin)
      toast.success(`${pending.action}: ${supplier.tradingName || supplier.legalName} is now ${label(pending.to).toLowerCase()}.`)
      setPending(null); setReason('')
      await onChanged()
    } catch (e: any) {
      console.error(pending.action, e)
      toast.error(`${pending.action} failed: ${e?.code || e?.message || e}`)
    } finally { setBusy(false) }
  }

  // The same check the save runs, with the reason as typed (permissions were checked on the button).
  const reasonProblem = pending && (pending.reasonRequired || reason.trim())
    ? transitionProblem({ uid: admin.uid, role: admin.role }, supplier, pending.to, reason)
    : null
  const reasonShort = !!pending?.reasonRequired && (reason.trim().length < MIN_REASON_LENGTH || !!reasonProblem)

  return (
    <>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {transitions.map((t) => {
          const problem = actionProblem(admin, supplier, t)
          return (
            <button key={t.to} disabled={!!problem || busy} title={problem ?? undefined}
              onClick={() => { setPending(t); setReason('') }}
              className={`btn ${kindOf(t)}`} style={compact ? { minHeight: '32px', fontSize: '12.5px' } : undefined}>
              {t.action}
            </button>
          )
        })}
      </div>

      {pending && (
        <Modal title={`${pending.action}: ${supplier.tradingName || supplier.legalName}`} onClose={() => setPending(null)} width={480}
          footer={<>
            <button onClick={() => setPending(null)} className="btn btn-secondary">Cancel</button>
            <button disabled={busy || reasonShort} onClick={confirm} className={`btn ${kindOf(pending) === 'btn-secondary' ? 'btn-primary' : kindOf(pending)}`}>
              {busy ? 'Saving…' : pending.action}
            </button>
          </>}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {label(supplier.status)} → <b>{label(pending.to)}</b>.
            {supplier.ordersEnabled && ' Orders will be turned off.'}
            {pending.to === 'approved' && ' Approval does not turn orders on; that is a separate step once stations and products are verified.'}
          </div>
          {pending.to === 'rejected' && <Notice tone="warning">The supplier stays rejected until a super admin reopens it as a draft.</Notice>}
          {supplier.status === 'pending_verification' && pending.to === 'draft' && (
            <Notice>
              The application returns to draft so its details can be corrected, then submitted again. Say what needs fixing.
              The supplier portal does not show this reason yet, so send it to the supplier as well.
            </Notice>
          )}
          <Field label={pending.reasonRequired ? 'Reason *' : 'Reason (optional)'} hint={reason.trim() && reasonProblem ? reasonProblem : pending.reasonRequired ? 'Recorded in the supplier history.' : undefined}>
            <TextArea value={reason} onChange={setReason} />
          </Field>
        </Modal>
      )}
    </>
  )
}
