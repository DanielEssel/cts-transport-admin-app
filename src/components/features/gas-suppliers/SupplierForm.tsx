'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import {
  GAS_ORDER_TYPES, OPERATING_MODELS, PAYOUT_METHODS, RIDER_ARRANGEMENTS, payoutPreferenceProblem,
  type PayoutPreference, type Supplier, type SupplierDetails,
} from '@/lib/gas-suppliers'
import { createSupplier, setPayoutPreference, updateSupplierDetails } from '@/lib/gas-supplier-data'
import { CheckboxGroup, Field, Modal, Notice, Row, SectionTitle, Select, TextArea, TextInput, buttonStyle } from './ui'

/** Creates a draft supplier, or edits one. */
export function SupplierForm({ supplier, onClose, onSaved }: {
  supplier?: Supplier; onClose: () => void; onSaved: (id: string) => void
}) {
  const { admin } = useAuth()
  const [d, setD] = useState<SupplierDetails>(() => supplier ? pickDetails(supplier) : {
    legalName: '', riderArrangement: 'undecided', fulfillment: {}, contact: {}, registration: {},
  })
  const [saving, setSaving] = useState(false)

  // The rules allow only contact details and notes to change once a supplier
  // has left draft / pending verification.
  const identityLocked = !!supplier && !['draft', 'pending_verification'].includes(supplier.status)
  const set = <K extends keyof SupplierDetails>(k: K, v: SupplierDetails[K]) => setD((p) => ({ ...p, [k]: v }))

  // After approval the payout destination is a super-admin change of its own.
  const payoutLocked = identityLocked && admin?.role !== 'super_admin'
  const pref = d.payoutPreference
  const prefEntered = !!(pref && (pref.method || pref.accountNumber || pref.accountName))
  const prefChanged = JSON.stringify(pref ?? null) !== JSON.stringify(supplier?.payoutPreference ?? null)

  const save = async () => {
    if (!admin) return
    if (!d.legalName?.trim()) { toast.error('Enter the legal or registered business name.'); return }
    const prefProblem = prefEntered ? payoutPreferenceProblem(pref) : null
    if (prefProblem) { toast.error(prefProblem); return }
    const details = { ...d, payoutPreference: prefEntered ? pref : undefined }
    setSaving(true)
    try {
      if (supplier) {
        await updateSupplierDetails(supplier.id, identityLocked
          ? { contact: d.contact, verificationNotes: d.verificationNotes, internalNotes: d.internalNotes }
          : details, admin)
        if (identityLocked && prefEntered && prefChanged && !payoutLocked) {
          await setPayoutPreference(supplier.id, pref as PayoutPreference, admin)
        }
        toast.success('Supplier updated')
        onSaved(supplier.id)
      } else {
        const id = await createSupplier(details, admin)
        toast.success('Draft supplier created')
        onSaved(id)
      }
    } catch (e: any) {
      console.error('saveSupplier', e)
      toast.error(`Could not save: ${e?.code || e?.message || e}`)
    } finally { setSaving(false) }
  }

  return (
    <Modal title={supplier ? `Edit ${supplier.tradingName || supplier.legalName}` : 'New supplier (draft)'} onClose={onClose} width={720}
      footer={<>
        <button onClick={onClose} style={buttonStyle('secondary')}>Cancel</button>
        <button onClick={save} disabled={saving} style={buttonStyle('primary', saving)}>{saving ? 'Saving…' : supplier ? 'Save changes' : 'Create draft'}</button>
      </>}>
      {!supplier && (
        <Notice>
          A new supplier is saved as a <b>draft</b>. It cannot take orders until it is submitted, approved by a
          different super admin, and its stations and products are verified. Only record details the supplier has
          actually provided; leave anything unconfirmed blank.
        </Notice>
      )}
      {identityLocked && (
        <Notice tone="warning">
          This supplier is {supplier!.status.replace('_', ' ')}. Only contact details and notes can be edited.
          To change business details, request re-verification first.
        </Notice>
      )}

      <SectionTitle>Business</SectionTitle>
      <Row>
        <Field label="Legal / registered name *"><TextInput value={d.legalName} onChange={(v) => set('legalName', v)} disabled={identityLocked} /></Field>
        <Field label="Trading name"><TextInput value={d.tradingName} onChange={(v) => set('tradingName', v)} disabled={identityLocked} /></Field>
      </Row>
      <Row>
        <Field label="Operating model">
          <Select value={d.operatingModel} options={OPERATING_MODELS} onChange={(v) => set('operatingModel', v)} disabled={identityLocked} placeholder="Select…" />
        </Field>
        <Field label="Business address"><TextInput value={d.address} onChange={(v) => set('address', v)} disabled={identityLocked} /></Field>
      </Row>

      <SectionTitle>Contact</SectionTitle>
      <Row>
        <Field label="Contact person"><TextInput value={d.contact?.name} onChange={(v) => set('contact', { ...d.contact, name: v })} /></Field>
        <Field label="Business phone"><TextInput value={d.contact?.phone} onChange={(v) => set('contact', { ...d.contact, phone: v })} placeholder="+233…" /></Field>
        <Field label="Business email"><TextInput type="email" value={d.contact?.email} onChange={(v) => set('contact', { ...d.contact, email: v })} /></Field>
      </Row>

      <SectionTitle>Registration and licensing</SectionTitle>
      <Notice>Record reference numbers only. Do not upload or paste identity documents here.</Notice>
      <Row>
        <Field label="Business registration no."><TextInput value={d.registration?.businessRegNo} onChange={(v) => set('registration', { ...d.registration, businessRegNo: v })} disabled={identityLocked} /></Field>
        <Field label="LPG / NPA licence no."><TextInput value={d.registration?.licenceNo} onChange={(v) => set('registration', { ...d.registration, licenceNo: v })} disabled={identityLocked} /></Field>
        <Field label="Licence expiry"><TextInput type="date" value={d.registration?.licenceExpiry} onChange={(v) => set('registration', { ...d.registration, licenceExpiry: v })} disabled={identityLocked} /></Field>
      </Row>

      <SectionTitle>Operations</SectionTitle>
      <Field label="Fulfilment capabilities" hint="Which Gas order types this supplier can fulfil.">
        <CheckboxGroup options={GAS_ORDER_TYPES} disabled={identityLocked}
          checked={(t) => d.fulfillment?.[t] === true}
          onChange={(t, on) => set('fulfillment', { ...d.fulfillment, [t]: on })} />
      </Field>
      <Field label="Rider arrangement" hint="Today, Gas orders are dispatched only to CTSGo drivers. Supplier riders are not yet supported by dispatch.">
        <Select value={d.riderArrangement} options={RIDER_ARRANGEMENTS} onChange={(v) => set('riderArrangement', v)} disabled={identityLocked} />
      </Field>

      <SectionTitle>Payout preference</SectionTitle>
      <Notice>
        Where this supplier wants its settlements paid. Recorded only: CTSGo does not send supplier payouts yet.
        {identityLocked && ' After approval only a super admin can change it.'}
      </Notice>
      <Row>
        <Field label="Method">
          <Select value={pref?.method} options={PAYOUT_METHODS} disabled={payoutLocked} placeholder="Select…"
            onChange={(v) => set('payoutPreference', { ...(pref ?? {}), method: v } as PayoutPreference)} />
        </Field>
        <Field label="Mobile-money number"><TextInput value={pref?.accountNumber} placeholder="0241234567" disabled={payoutLocked}
          onChange={(v) => set('payoutPreference', { ...(pref ?? {}), accountNumber: v } as PayoutPreference)} /></Field>
        <Field label="Registered account name"><TextInput value={pref?.accountName} disabled={payoutLocked}
          onChange={(v) => set('payoutPreference', { ...(pref ?? {}), accountName: v } as PayoutPreference)} /></Field>
      </Row>

      <SectionTitle>Review</SectionTitle>
      <Field label="Verification notes" hint="What has been checked, how, and what is still outstanding.">
        <TextArea value={d.verificationNotes} onChange={(v) => set('verificationNotes', v)} />
      </Field>
      <Field label="Internal notes"><TextArea value={d.internalNotes} onChange={(v) => set('internalNotes', v)} /></Field>
    </Modal>
  )
}

function pickDetails(s: Supplier): SupplierDetails {
  return {
    legalName: s.legalName, tradingName: s.tradingName, operatingModel: s.operatingModel,
    contact: { ...s.contact }, address: s.address, registration: { ...s.registration },
    fulfillment: { ...s.fulfillment }, riderArrangement: s.riderArrangement ?? 'undecided',
    payoutPreference: s.payoutPreference ? { ...s.payoutPreference } : undefined,
    verificationNotes: s.verificationNotes, internalNotes: s.internalNotes,
  }
}
