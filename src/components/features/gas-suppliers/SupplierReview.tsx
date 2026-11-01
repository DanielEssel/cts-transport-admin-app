'use client'
// Review one supplier from the list without leaving it: the submitted
// details, what is still missing, and the same status actions as the
// supplier workspace (StatusActions), which keeps every rule and dialog.
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import type { Admin } from '@/types'
import { StatusBadge } from '@/components/shared'
import { formatDate } from '@/lib/utils'
import { enabledOrderTypes, label, submissionProblems, type Supplier } from '@/lib/gas-suppliers'
import { KeyValue, Modal, Notice, OrdersBadge } from './ui'
import { StatusActions } from './StatusActions'

export function SupplierReview({ supplier, stationCount, admin, position, onClose, onChanged }: {
  supplier: Supplier; stationCount: number | null; admin: Admin
  /** e.g. "2 of 5 awaiting verification" */
  position?: string
  onClose: () => void; onChanged: () => void | Promise<void>
}) {
  const missing = submissionProblems(supplier)
  const name = supplier.tradingName || supplier.legalName
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
        {position && <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-tertiary)' }}>{position}</span>}
      </div>

      {supplier.status === 'pending_verification' && (
        <Notice>
          Check the details below against the supplier&apos;s documents before deciding. Approval needs a super admin who did not
          create this supplier; rejecting needs a reason. Approval does not turn orders on.
        </Notice>
      )}
      {missing.length > 0 && <Notice tone="warning">Missing: {missing.join(', ')}.</Notice>}
      {supplier.statusReason && <Notice tone="warning">Last reason: {supplier.statusReason}</Notice>}

      <ReviewSection title="Business">
        <KeyValue k="Legal name" v={supplier.legalName} />
        <KeyValue k="Trading name" v={supplier.tradingName} />
        <KeyValue k="Operating model" v={label(supplier.operatingModel)} />
        <KeyValue k="Business address" v={supplier.address} />
        <KeyValue k="Fulfilment" v={enabledOrderTypes(supplier.fulfillment).map(label).join(', ')} />
        <KeyValue k="Rider arrangement" v={label(supplier.riderArrangement)} />
        <KeyValue k="Stations" v={stationCount === null ? '—' : String(stationCount)} />
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
      {supplier.verificationNotes && (
        <KeyValue k="Verification notes" v={<span style={{ whiteSpace: 'pre-wrap' }}>{supplier.verificationNotes}</span>} />
      )}
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
