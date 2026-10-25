'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import {
  CYLINDER_SIZES, GAS_ORDER_TYPES, STOCK_APPROACHES, parseCoordinates,
  type Station, type StationDetails,
} from '@/lib/gas-suppliers'
import { createStation, updateStation } from '@/lib/gas-supplier-data'
import { CheckboxGroup, Field, Modal, Notice, Row, SectionTitle, Select, TextArea, TextInput, buttonStyle } from './ui'

export function StationForm({ supplierId, station, onClose, onSaved }: {
  supplierId: string; station?: Station; onClose: () => void; onSaved: () => void
}) {
  const { admin } = useAuth()
  const [d, setD] = useState<StationDetails>(() => station ? {
    name: station.name, address: station.address, location: station.location, contact: { ...station.contact },
    operatingHours: station.operatingHours, serviceArea: station.serviceArea, serviceRadiusKm: station.serviceRadiusKm ?? null,
    supportedSizes: [...(station.supportedSizes ?? [])], fulfillment: { ...station.fulfillment },
    stockApproach: station.stockApproach ?? 'not_tracked', verificationNotes: station.verificationNotes,
  } : { name: '', supportedSizes: [], fulfillment: {}, contact: {}, stockApproach: 'not_tracked' })
  const [coords, setCoords] = useState(station?.location ? `${station.location.latitude}, ${station.location.longitude}` : '')
  const [radius, setRadius] = useState(station?.serviceRadiusKm != null ? String(station.serviceRadiusKm) : '')
  const [saving, setSaving] = useState(false)

  // While verified, only contact, hours, stock approach and notes may change.
  const locked = station?.status === 'verified'
  const set = <K extends keyof StationDetails>(k: K, v: StationDetails[K]) => setD((p) => ({ ...p, [k]: v }))

  const save = async () => {
    if (!admin) return
    if (!d.name?.trim()) { toast.error('Enter the station name.'); return }
    const location = coords.trim() ? parseCoordinates(coords) : null
    if (coords.trim() && !location) { toast.error('Coordinates must be "latitude, longitude", e.g. 5.6698, -0.0166'); return }
    const r = radius.trim() ? Number(radius) : null
    if (r != null && !(r > 0 && r <= 200)) { toast.error('Service radius must be between 0 and 200 km.'); return }
    setSaving(true)
    try {
      const details: StationDetails = { ...d, location, serviceRadiusKm: r }
      if (station) {
        await updateStation(supplierId, station.id, locked
          ? { contact: d.contact, operatingHours: d.operatingHours, stockApproach: d.stockApproach, verificationNotes: d.verificationNotes }
          : details, admin)
        toast.success('Station updated')
      } else {
        await createStation(supplierId, details, admin)
        toast.success('Draft station added')
      }
      onSaved()
    } catch (e: any) {
      console.error('saveStation', e)
      toast.error(`Could not save: ${e?.code || e?.message || e}`)
    } finally { setSaving(false) }
  }

  return (
    <Modal title={station ? `Edit ${station.name}` : 'Add station (draft)'} onClose={onClose} width={720}
      footer={<>
        <button onClick={onClose} style={buttonStyle('secondary')}>Cancel</button>
        <button onClick={save} disabled={saving} style={buttonStyle('primary', saving)}>{saving ? 'Saving…' : 'Save station'}</button>
      </>}>
      {locked
        ? <Notice tone="warning">This station is verified. Location, address and capabilities are locked; mark it as a draft first to change them, then have it verified again.</Notice>
        : <Notice>A draft can be saved with missing details. A super admin verifies it once the address, coordinates, contact phone and operating hours are confirmed.</Notice>}

      <Row>
        <Field label="Station name *"><TextInput value={d.name} onChange={(v) => set('name', v)} disabled={locked} /></Field>
        <Field label="Address"><TextInput value={d.address} onChange={(v) => set('address', v)} disabled={locked} /></Field>
      </Row>
      <Row>
        <Field label="Coordinates" hint="latitude, longitude — from a verified source, e.g. a site visit or the supplier.">
          <TextInput value={coords} onChange={setCoords} placeholder="5.6698, -0.0166" disabled={locked} />
        </Field>
        <Field label="Service radius (km)"><TextInput type="number" value={radius} onChange={setRadius} disabled={locked} /></Field>
      </Row>
      <Field label="Service area" hint="Areas served, in words."><TextInput value={d.serviceArea} onChange={(v) => set('serviceArea', v)} disabled={locked} /></Field>

      <SectionTitle>Contact and hours</SectionTitle>
      <Row>
        <Field label="Contact name"><TextInput value={d.contact?.name} onChange={(v) => set('contact', { ...d.contact, name: v })} /></Field>
        <Field label="Contact phone"><TextInput value={d.contact?.phone} onChange={(v) => set('contact', { ...d.contact, phone: v })} placeholder="+233…" /></Field>
      </Row>
      <Field label="Operating hours"><TextInput value={d.operatingHours} onChange={(v) => set('operatingHours', v)} placeholder="Mon–Sat 07:00–19:00" /></Field>

      <SectionTitle>Capabilities</SectionTitle>
      <Field label="Cylinder sizes handled">
        <CheckboxGroup options={CYLINDER_SIZES} disabled={locked}
          checked={(s) => d.supportedSizes?.includes(s) ?? false}
          onChange={(s, on) => set('supportedSizes', on ? [...(d.supportedSizes ?? []), s] : (d.supportedSizes ?? []).filter((x) => x !== s))} />
      </Field>
      <Field label="Fulfilment at this station">
        <CheckboxGroup options={GAS_ORDER_TYPES} disabled={locked}
          checked={(t) => d.fulfillment?.[t] === true}
          onChange={(t, on) => set('fulfillment', { ...d.fulfillment, [t]: on })} />
      </Field>
      <Field label="Stock availability approach" hint="How product availability will be kept up to date. No stock quantities are recorded.">
        <Select value={d.stockApproach} options={STOCK_APPROACHES} onChange={(v) => set('stockApproach', v)} />
      </Field>
      <Field label="Verification notes"><TextArea value={d.verificationNotes} onChange={(v) => set('verificationNotes', v)} /></Field>
    </Modal>
  )
}
