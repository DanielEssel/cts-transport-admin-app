// Firestore reads and writes for Gas supplier onboarding. The shapes here
// are the ones firestore.rules (gas_suppliers) accepts; the rules tests in
// the passenger repo (rules-tests/test/gas_suppliers.test.js) replay them.
//
// Status, orders and price changes run in a transaction: the next history
// number is read fresh, and the record and its history entry are written
// together, so two admins acting at once cannot skip or reuse a number.

import {
  collection, doc, getDoc, getDocs, getCountFromServer, orderBy, query,
  runTransaction, serverTimestamp, setDoc, updateDoc, writeBatch, GeoPoint,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Admin } from '@/types'
import {
  productId, transitionProblem, payoutPreferenceProblem,
  type PayoutPreference, type Product, type Station, type StationDetails, type Supplier, type SupplierDetails, type SupplierStatus,
  type GasOrderType, type CylinderSize, type GasBrand, type ProductAvailability,
} from '@/lib/gas-suppliers'

const SUPPLIERS = 'gas_suppliers'

const supplierRef = (id: string) => doc(db, SUPPLIERS, id)
const historyRef = (id: string, seq: number) => doc(db, SUPPLIERS, id, 'status_history', String(seq))
const stationsCol = (sid: string) => collection(db, SUPPLIERS, sid, 'stations')
const productsCol = (sid: string, stid: string) => collection(db, SUPPLIERS, sid, 'stations', stid, 'products')
const priceHistoryRef = (sid: string, stid: string, pid: string, v: number) =>
  doc(db, SUPPLIERS, sid, 'stations', stid, 'products', pid, 'price_history', String(v))

export interface HistoryEntry {
  id: string
  seq: number
  type: 'created' | 'status_changed' | 'orders_enabled' | 'orders_disabled'
  fromStatus: SupplierStatus | null
  toStatus: SupplierStatus
  ordersEnabled: boolean
  reason: string | null
  by: string
  byEmail?: string | null
  at?: unknown
}

export interface PriceHistoryEntry {
  id: string
  version: number
  price: number
  handlingFee: number
  previousPrice: number | null
  previousHandlingFee: number | null
  reason?: string | null
  changedBy: string
  changedAt?: unknown
}

/**
 * Drops undefined values (Firestore rejects them) and trims strings, in
 * plain nested maps only; GeoPoints and serverTimestamp() pass through.
 */
function clean<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined) continue
    if (typeof v === 'string') out[k] = v.trim()
    else if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) out[k] = clean(v as Record<string, unknown>)
    else out[k] = v
  }
  return out as T
}

// ── Suppliers ────────────────────────────────────────────────────────────────

export async function listSuppliers(): Promise<Supplier[]> {
  const snap = await getDocs(query(collection(db, SUPPLIERS), orderBy('updatedAt', 'desc')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Supplier)
}

export async function getSupplier(id: string): Promise<Supplier | null> {
  const snap = await getDoc(supplierRef(id))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Supplier) : null
}

export async function countStations(id: string): Promise<number> {
  return (await getCountFromServer(stationsCol(id))).data().count
}

/** A new supplier is always a draft with orders off; history/1 records it. */
export async function createSupplier(details: SupplierDetails, admin: Admin): Promise<string> {
  const ref = doc(collection(db, SUPPLIERS))
  const b = writeBatch(db)
  b.set(ref, clean({
    ...details,
    status: 'draft',
    statusReason: null,
    statusChangedAt: serverTimestamp(),
    statusChangedBy: admin.uid,
    ordersEnabled: false,
    auditSeq: 1,
    createdAt: serverTimestamp(),
    createdBy: admin.uid,
    updatedAt: serverTimestamp(),
    updatedBy: admin.uid,
  }))
  b.set(historyRef(ref.id, 1), {
    seq: 1, type: 'created', fromStatus: null, toStatus: 'draft', ordersEnabled: false,
    reason: null, by: admin.uid, byEmail: admin.email ?? null, at: serverTimestamp(),
  })
  await b.commit()
  return ref.id
}

export async function updateSupplierDetails(id: string, details: Partial<SupplierDetails>, admin: Admin): Promise<void> {
  await updateDoc(supplierRef(id), clean({ ...details, updatedAt: serverTimestamp(), updatedBy: admin.uid }))
}

/**
 * Records where the supplier wants settlements paid. While the supplier is a
 * draft or pending verification any admin may set it (with the other
 * details); after approval only a super admin, in a write of its own
 * (firestore.rules). Nothing is paid: no payout integration exists.
 */
export async function setPayoutPreference(id: string, pref: PayoutPreference, admin: Admin): Promise<void> {
  const problem = payoutPreferenceProblem(pref)
  if (problem) throw new Error(problem)
  await updateDoc(supplierRef(id), {
    payoutPreference: { method: pref.method, accountNumber: pref.accountNumber.trim(), accountName: pref.accountName.trim() },
    updatedAt: serverTimestamp(), updatedBy: admin.uid,
  })
}

/** Moves a supplier along the workflow. Any status change turns orders off. */
export async function changeSupplierStatus(id: string, to: SupplierStatus, reason: string | null, admin: Admin): Promise<void> {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(supplierRef(id))
    if (!snap.exists()) throw new Error('Supplier not found.')
    const s = snap.data() as Supplier
    const problem = transitionProblem({ uid: admin.uid, role: admin.role }, s, to, reason)
    if (problem) throw new Error(problem)
    const seq = s.auditSeq + 1
    const why = reason?.trim() || null
    tx.update(supplierRef(id), {
      status: to, statusReason: why, statusChangedAt: serverTimestamp(), statusChangedBy: admin.uid,
      ordersEnabled: false, auditSeq: seq, updatedAt: serverTimestamp(), updatedBy: admin.uid,
    })
    tx.set(historyRef(id, seq), {
      seq, type: 'status_changed', fromStatus: s.status, toStatus: to, ordersEnabled: false,
      reason: why, by: admin.uid, byEmail: admin.email ?? null, at: serverTimestamp(),
    })
  })
}

/** Turns orders on or off without changing status. */
export async function setOrdersEnabled(id: string, enabled: boolean, admin: Admin): Promise<void> {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(supplierRef(id))
    if (!snap.exists()) throw new Error('Supplier not found.')
    const s = snap.data() as Supplier
    if (s.ordersEnabled === enabled) return
    if (enabled && s.status !== 'approved') throw new Error('Only an approved supplier can take orders.')
    if (enabled && admin.role !== 'super_admin') throw new Error('Only a super admin can turn orders on.')
    const seq = s.auditSeq + 1
    tx.update(supplierRef(id), {
      ordersEnabled: enabled, auditSeq: seq, statusChangedAt: serverTimestamp(), statusChangedBy: admin.uid,
      updatedAt: serverTimestamp(), updatedBy: admin.uid,
    })
    tx.set(historyRef(id, seq), {
      seq, type: enabled ? 'orders_enabled' : 'orders_disabled', fromStatus: s.status, toStatus: s.status,
      ordersEnabled: enabled, reason: null, by: admin.uid, byEmail: admin.email ?? null, at: serverTimestamp(),
    })
  })
}

export async function listHistory(id: string): Promise<HistoryEntry[]> {
  const snap = await getDocs(query(collection(db, SUPPLIERS, id, 'status_history'), orderBy('seq', 'desc')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as HistoryEntry)
}

// ── Stations ─────────────────────────────────────────────────────────────────

export async function listStations(sid: string): Promise<Station[]> {
  const snap = await getDocs(query(stationsCol(sid), orderBy('createdAt', 'asc')))
  return snap.docs.map((d) => {
    const data = d.data()
    const loc = data.location as GeoPoint | null | undefined
    return { id: d.id, ...data, location: loc ? { latitude: loc.latitude, longitude: loc.longitude } : null } as Station
  })
}

function stationFields(s: StationDetails) {
  return clean({
    ...s,
    location: s.location ? new GeoPoint(s.location.latitude, s.location.longitude) : null,
    serviceRadiusKm: s.serviceRadiusKm ?? null,
  })
}

/** New stations start as drafts. */
export async function createStation(sid: string, s: StationDetails, admin: Admin): Promise<string> {
  const ref = doc(stationsCol(sid))
  await setDoc(ref, {
    ...stationFields(s), supplierId: sid, status: 'draft',
    createdAt: serverTimestamp(), createdBy: admin.uid, updatedAt: serverTimestamp(), updatedBy: admin.uid,
  })
  return ref.id
}

export async function updateStation(sid: string, stid: string, s: Partial<StationDetails>, admin: Admin): Promise<void> {
  const fields: Record<string, unknown> = { ...s }
  if ('location' in s) fields.location = s.location ? new GeoPoint(s.location.latitude, s.location.longitude) : null
  await updateDoc(doc(stationsCol(sid), stid), clean({ ...fields, updatedAt: serverTimestamp(), updatedBy: admin.uid }))
}

/** Verifying is super-admin only and records who and when. */
export async function setStationStatus(sid: string, stid: string, status: Station['status'], admin: Admin): Promise<void> {
  const fields: Record<string, unknown> = { status, updatedAt: serverTimestamp(), updatedBy: admin.uid }
  if (status === 'verified') Object.assign(fields, { verifiedBy: admin.uid, verifiedAt: serverTimestamp() })
  await updateDoc(doc(stationsCol(sid), stid), fields)
}

// ── Products and prices ──────────────────────────────────────────────────────

export async function listProducts(sid: string, stid: string): Promise<Product[]> {
  const snap = await getDocs(productsCol(sid, stid))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Product)
}

export interface NewProduct {
  orderType: GasOrderType
  cylinderSize: CylinderSize
  brand: GasBrand
  price: number
  handlingFee: number
  notes?: string
}

/** A new product is unverified and off sale; price_history/1 records its price. */
export async function createProduct(sid: string, stid: string, p: NewProduct, admin: Admin): Promise<string> {
  const pid = productId(p.orderType, p.cylinderSize, p.brand)
  const ref = doc(productsCol(sid, stid), pid)
  await runTransaction(db, async (tx) => {
    if ((await tx.get(ref)).exists()) throw new Error('This station already lists that product. Edit it instead.')
    tx.set(ref, clean({
      ...p, currency: 'GHS', priceVersion: 1, availability: 'unavailable', verified: false,
      createdAt: serverTimestamp(), createdBy: admin.uid, updatedAt: serverTimestamp(), updatedBy: admin.uid,
    }))
    tx.set(priceHistoryRef(sid, stid, pid, 1), {
      version: 1, price: p.price, handlingFee: p.handlingFee, previousPrice: null, previousHandlingFee: null,
      reason: 'Initial price', changedBy: admin.uid, changedAt: serverTimestamp(),
    })
  })
  return pid
}

/**
 * Records a new price. A super admin's change keeps a verified product
 * verified (re-verified by them); anyone else's change un-verifies it and
 * takes it off sale until a super admin checks it.
 */
export async function changeProductPrice(
  sid: string, stid: string, pid: string,
  change: { price: number; handlingFee: number; reason: string }, admin: Admin,
): Promise<void> {
  const ref = doc(productsCol(sid, stid), pid)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Product not found.')
    const p = snap.data() as Product
    if (p.price === change.price && p.handlingFee === change.handlingFee) return
    const version = p.priceVersion + 1
    const keepVerified = p.verified && admin.role === 'super_admin'
    tx.update(ref, {
      price: change.price, handlingFee: change.handlingFee, priceVersion: version,
      ...(keepVerified
        ? { verifiedBy: admin.uid, verifiedAt: serverTimestamp() }
        : { verified: false, availability: p.availability === 'available' ? 'unavailable' : p.availability }),
      updatedAt: serverTimestamp(), updatedBy: admin.uid,
    })
    tx.set(priceHistoryRef(sid, stid, pid, version), {
      version, price: change.price, handlingFee: change.handlingFee,
      previousPrice: p.price, previousHandlingFee: p.handlingFee,
      reason: change.reason.trim() || null, changedBy: admin.uid, changedAt: serverTimestamp(),
    })
  })
}

export async function verifyProduct(sid: string, stid: string, pid: string, verified: boolean, admin: Admin): Promise<void> {
  const ref = doc(productsCol(sid, stid), pid)
  await updateDoc(ref, verified
    ? { verified: true, verifiedBy: admin.uid, verifiedAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: admin.uid }
    : { verified: false, availability: 'unavailable', updatedAt: serverTimestamp(), updatedBy: admin.uid })
}

export async function setProductAvailability(sid: string, stid: string, pid: string, availability: ProductAvailability, admin: Admin): Promise<void> {
  await updateDoc(doc(productsCol(sid, stid), pid), { availability, updatedAt: serverTimestamp(), updatedBy: admin.uid })
}

export async function listPriceHistory(sid: string, stid: string, pid: string): Promise<PriceHistoryEntry[]> {
  const snap = await getDocs(query(collection(db, SUPPLIERS, sid, 'stations', stid, 'products', pid, 'price_history'), orderBy('version', 'desc')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PriceHistoryEntry)
}
