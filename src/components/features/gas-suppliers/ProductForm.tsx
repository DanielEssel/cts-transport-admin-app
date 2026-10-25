'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  CYLINDER_SIZES, GAS_BRANDS, GAS_ORDER_TYPES, label, productProblems,
  type CylinderSize, type GasBrand, type GasOrderType, type Product,
} from '@/lib/gas-suppliers'
import { changeProductPrice, createProduct, listPriceHistory, type PriceHistoryEntry } from '@/lib/gas-supplier-data'
import { Field, Modal, Notice, Row, Select, TextArea, TextInput, buttonStyle } from './ui'

/** Adds a product to a station, or records a new price for one. */
export function ProductForm({ supplierId, stationId, product, onClose, onSaved }: {
  supplierId: string; stationId: string; product?: Product; onClose: () => void; onSaved: () => void
}) {
  const { admin } = useAuth()
  const [orderType, setOrderType] = useState<GasOrderType | undefined>(product?.orderType)
  const [size, setSize] = useState<CylinderSize | undefined>(product?.cylinderSize)
  const [brand, setBrand] = useState<GasBrand | undefined>(product?.brand)
  const [price, setPrice] = useState(product ? String(product.price) : '')
  const [fee, setFee] = useState(product ? String(product.handlingFee) : '0')
  const [notes, setNotes] = useState(product?.notes ?? '')
  const [reason, setReason] = useState('')
  const [history, setHistory] = useState<PriceHistoryEntry[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!product) return
    listPriceHistory(supplierId, stationId, product.id).then(setHistory).catch((e) => console.error('priceHistory', e))
  }, [supplierId, stationId, product])

  const save = async () => {
    if (!admin) return
    const p = { orderType, cylinderSize: size, brand, price: Number(price), handlingFee: Number(fee || 0) }
    const problems = productProblems(p)
    if (problems.length) { toast.error(`Check: ${problems.join(', ')}`); return }
    if (product && reason.trim().length < 3) { toast.error('Say where the new price comes from.'); return }
    setSaving(true)
    try {
      if (product) {
        await changeProductPrice(supplierId, stationId, product.id, { price: p.price, handlingFee: p.handlingFee, reason }, admin)
        toast.success('Price change recorded')
      } else {
        await createProduct(supplierId, stationId, { orderType: orderType!, cylinderSize: size!, brand: brand!, price: p.price, handlingFee: p.handlingFee, notes }, admin)
        toast.success('Product added (unverified)')
      }
      onSaved()
    } catch (e: any) {
      console.error('saveProduct', e)
      toast.error(`Could not save: ${e?.code || e?.message || e}`)
    } finally { setSaving(false) }
  }

  const keepsVerification = product?.verified && admin?.role === 'super_admin'

  return (
    <Modal title={product ? `Change price — ${label(product.orderType)}, ${label(product.cylinderSize)}, ${label(product.brand)}` : 'Add product'}
      onClose={onClose}
      footer={<>
        <button onClick={onClose} style={buttonStyle('secondary')}>Cancel</button>
        <button onClick={save} disabled={saving} style={buttonStyle('primary', saving)}>{saving ? 'Saving…' : product ? 'Record new price' : 'Add product'}</button>
      </>}>
      {product ? (
        <Notice tone={product.verified && !keepsVerification ? 'warning' : 'info'}>
          A price change is saved as a new version; earlier prices stay in the history below and existing orders are
          not affected.{product.verified && !keepsVerification && ' Because you are not a super admin, the product will become unverified and come off sale until a super admin checks the new price.'}
        </Notice>
      ) : (
        <Notice>
          Products start <b>unverified and unavailable</b>. Enter the price the supplier has confirmed; a super admin
          verifies it before it can be offered. Delivery fees remain set in Settings → Gas.
        </Notice>
      )}

      <Row>
        <Field label="Order type"><Select value={orderType} options={GAS_ORDER_TYPES} onChange={setOrderType} disabled={!!product} placeholder="Select…" /></Field>
        <Field label="Cylinder size"><Select value={size} options={CYLINDER_SIZES} onChange={setSize} disabled={!!product} placeholder="Select…" /></Field>
        <Field label="Brand"><Select value={brand} options={GAS_BRANDS} onChange={setBrand} disabled={!!product} placeholder="Select…" /></Field>
      </Row>
      <Row>
        <Field label="Product price (GHS)" hint="Per cylinder: refill price, or full cylinder for New Cylinder.">
          <TextInput type="number" value={price} onChange={setPrice} />
        </Field>
        <Field label="Handling fee (GHS)" hint="Station handling charge, if any.">
          <TextInput type="number" value={fee} onChange={setFee} />
        </Field>
      </Row>
      {product
        ? <Field label="Source of new price *" hint="e.g. Supplier price list dated 1 Nov"><TextInput value={reason} onChange={setReason} /></Field>
        : <Field label="Notes"><TextArea value={notes} onChange={setNotes} /></Field>}

      {product && history.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Version</th><th>Price</th><th>Handling</th><th>Source</th><th>When</th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>v{h.version}</td>
                  <td>{formatCurrency(h.price)}</td>
                  <td>{formatCurrency(h.handlingFee)}</td>
                  <td style={{ fontSize: '12px' }}>{h.reason || '—'}</td>
                  <td style={{ fontSize: '11px' }}>{formatDate(h.changedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
