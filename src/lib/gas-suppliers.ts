// Gas supplier onboarding — the rules the admin pages work from. Pure (no
// Firebase), so the tests run it directly.
//
// The same rules are enforced server-side by firestore.rules in the passenger
// repo (gas_suppliers). This file only decides what the pages offer and
// explains why something is not possible; the rules decide what is written.
//
// Value lists mirror the passenger app (lib/features/gas/models/
// gas_refill_request.dart): GasRefillType, CylinderSize and GasBrand store
// their enum names in Firestore, so a catalog product can be matched to an
// order without translation.

export const SUPPLIER_STATUSES = ['draft', 'pending_verification', 'approved', 'rejected', 'suspended'] as const
export type SupplierStatus = typeof SUPPLIER_STATUSES[number]

export const GAS_ORDER_TYPES = ['exchangeEmpty', 'newCylinder', 'pickupAndReturn', 'commercialBulk'] as const
export type GasOrderType = typeof GAS_ORDER_TYPES[number]

export const CYLINDER_SIZES = ['kg3', 'kg6', 'kg12_5', 'kg14_5', 'kg19', 'kg45'] as const
export type CylinderSize = typeof CYLINDER_SIZES[number]

// GasBrand without `any`: a catalog product is always one brand.
export const GAS_BRANDS = [
  'goGas', 'totalEnergies', 'goil', 'shell', 'benab', 'blueOcean', 'newGas',
  'louisGas', 'manbahGas', 'rootsenaf', 'zola', 'radix', 'soilGroup',
] as const
export type GasBrand = typeof GAS_BRANDS[number]

export const OPERATING_MODELS = ['lpg_station', 'distributor', 'retail_outlet', 'other'] as const
export type OperatingModel = typeof OPERATING_MODELS[number]

export const RIDER_ARRANGEMENTS = ['undecided', 'supplier_riders', 'ctsgo_dispatch', 'supplier_riders_ctsgo_fallback'] as const
export type RiderArrangement = typeof RIDER_ARRANGEMENTS[number]

/**
 * Arrangements whose orders CTSGo drivers can deliver today. Dispatch has no
 * supplier riders yet, so a supplier relying only on its own riders cannot
 * take orders (gas_supplier_orders.js optionProblem refuses it as well).
 */
export const DISPATCHABLE_RIDER_ARRANGEMENTS: readonly RiderArrangement[] = ['ctsgo_dispatch', 'supplier_riders_ctsgo_fallback']

/** Mobile-money payout methods a supplier may choose (recorded only; payouts are not enabled). */
export const PAYOUT_METHODS = ['mtn_momo', 'telecel_cash', 'at_money'] as const
export type PayoutMethod = typeof PAYOUT_METHODS[number]

export interface PayoutPreference {
  method: PayoutMethod
  /** 10-digit Ghana number, e.g. 0241234567. */
  accountNumber: string
  /** Name registered on the mobile-money account. */
  accountName: string
}

/** Why a payout preference would be refused (firestore.rules payoutPreferenceOk), or null. */
export function payoutPreferenceProblem(p: Partial<PayoutPreference> | null | undefined): string | null {
  if (p == null) return null
  if (!PAYOUT_METHODS.includes(p.method as PayoutMethod)) return 'Choose MTN MoMo, Telecel Cash or AT Money.'
  if (typeof p.accountNumber !== 'string' || !/^0[0-9]{9}$/.test(p.accountNumber.trim())) return 'Enter the 10-digit mobile-money number, starting with 0.'
  const name = typeof p.accountName === 'string' ? p.accountName.trim() : ''
  if (name.length < 2 || name.length > 100) return 'Enter the name registered on the mobile-money account.'
  return null
}

export const STATION_STATUSES = ['draft', 'verified', 'inactive'] as const
export type StationStatus = typeof STATION_STATUSES[number]

export const STOCK_APPROACHES = ['not_tracked', 'admin_managed', 'supplier_reported'] as const
export type StockApproach = typeof STOCK_APPROACHES[number]

export const PRODUCT_AVAILABILITY = ['unavailable', 'available', 'out_of_stock'] as const
export type ProductAvailability = typeof PRODUCT_AVAILABILITY[number]

export const LABELS: Record<string, string> = {
  mtn_momo: 'MTN MoMo',
  telecel_cash: 'Telecel Cash',
  at_money: 'AT Money',
  draft: 'Draft',
  pending_verification: 'Pending verification',
  approved: 'Approved',
  rejected: 'Rejected',
  suspended: 'Suspended',
  verified: 'Verified',
  inactive: 'Inactive',
  exchangeEmpty: 'Exchange Empty',
  newCylinder: 'New Cylinder',
  pickupAndReturn: 'Pickup & Return',
  commercialBulk: 'Commercial Bulk',
  kg3: '3 kg', kg6: '6 kg', kg12_5: '12.5 kg', kg14_5: '14.5 kg', kg19: '19 kg', kg45: '45 kg',
  goGas: 'GoGas', totalEnergies: 'TotalEnergies', goil: 'GOIL Gas', shell: 'Shell Gas',
  benab: 'Benab Gas', blueOcean: 'Blue Ocean Gas', newGas: 'NewGas', louisGas: 'Louis Gas',
  manbahGas: 'Manbah Gas', rootsenaf: 'Rootsenaf Gas', zola: 'Zola', radix: 'Radix', soilGroup: 'Soil Group',
  lpg_station: 'LPG station operator',
  distributor: 'Distributor / marketer',
  retail_outlet: 'Retail outlet',
  other: 'Other',
  undecided: 'Not decided',
  supplier_riders: 'Supplier-managed riders',
  ctsgo_dispatch: 'CTSGo dispatch',
  supplier_riders_ctsgo_fallback: 'Supplier riders, CTSGo fallback',
  not_tracked: 'Not tracked',
  admin_managed: 'Managed by CTSGo staff',
  supplier_reported: 'Reported by supplier',
  unavailable: 'Unavailable',
  available: 'Available',
  out_of_stock: 'Out of stock',
}

export const label = (v: string | null | undefined): string => (v ? LABELS[v] ?? v : '—')

// ── Records ──────────────────────────────────────────────────────────────────

export type Fulfillment = Partial<Record<GasOrderType, boolean>>

export interface SupplierDetails {
  legalName: string
  tradingName?: string
  operatingModel?: OperatingModel
  contact?: { name?: string; phone?: string; email?: string }
  address?: string
  registration?: { businessRegNo?: string; licenceNo?: string; licenceExpiry?: string; notes?: string }
  fulfillment?: Fulfillment
  riderArrangement?: RiderArrangement
  payoutPreference?: PayoutPreference
  verificationNotes?: string
  internalNotes?: string
}

export interface Supplier extends SupplierDetails {
  id: string
  status: SupplierStatus
  statusReason?: string | null
  statusChangedAt?: unknown
  statusChangedBy?: string
  ordersEnabled: boolean
  auditSeq: number
  createdAt?: unknown
  createdBy: string
  updatedAt?: unknown
  updatedBy?: string
}

export interface StationDetails {
  name: string
  address?: string
  location?: { latitude: number; longitude: number } | null
  contact?: { name?: string; phone?: string; email?: string }
  operatingHours?: string
  serviceArea?: string
  serviceRadiusKm?: number | null
  supportedSizes?: CylinderSize[]
  fulfillment?: Fulfillment
  stockApproach?: StockApproach
  verificationNotes?: string
}

export interface Station extends StationDetails {
  id: string
  supplierId: string
  status: StationStatus
  verifiedBy?: string | null
  verifiedAt?: unknown
  createdBy: string
}

export interface Product {
  id: string
  orderType: GasOrderType
  cylinderSize: CylinderSize
  brand: GasBrand
  price: number
  handlingFee: number
  currency: 'GHS'
  priceVersion: number
  availability: ProductAvailability
  verified: boolean
  verifiedBy?: string | null
  verifiedAt?: unknown
  notes?: string
}

export interface Actor {
  uid: string
  role: 'super_admin' | 'admin' | string
}

// ── Status workflow ──────────────────────────────────────────────────────────

export interface Transition {
  from: SupplierStatus
  to: SupplierStatus
  action: string
  superAdminOnly: boolean
  /** The admin who created the supplier may not take this step. */
  notCreator: boolean
  reasonRequired: boolean
}

// Every status change the rules allow. Any change of status also turns
// orders off; they are re-enabled separately.
export const TRANSITIONS: readonly Transition[] = [
  { from: 'draft', to: 'pending_verification', action: 'Submit for verification', superAdminOnly: false, notCreator: false, reasonRequired: false },
  { from: 'pending_verification', to: 'draft', action: 'Return to draft', superAdminOnly: false, notCreator: false, reasonRequired: false },
  { from: 'pending_verification', to: 'approved', action: 'Approve', superAdminOnly: true, notCreator: true, reasonRequired: false },
  { from: 'pending_verification', to: 'rejected', action: 'Reject', superAdminOnly: true, notCreator: false, reasonRequired: true },
  { from: 'approved', to: 'suspended', action: 'Suspend', superAdminOnly: true, notCreator: false, reasonRequired: true },
  { from: 'approved', to: 'pending_verification', action: 'Request re-verification', superAdminOnly: false, notCreator: false, reasonRequired: true },
  { from: 'suspended', to: 'approved', action: 'Reinstate', superAdminOnly: true, notCreator: true, reasonRequired: false },
  { from: 'rejected', to: 'draft', action: 'Reopen as draft', superAdminOnly: true, notCreator: false, reasonRequired: true },
]

export const MIN_REASON_LENGTH = 3

export function transitionsFrom(status: SupplierStatus): Transition[] {
  return TRANSITIONS.filter((t) => t.from === status)
}

/** Why `actor` may not move `supplier` to `to`, or null when they may. */
export function transitionProblem(
  actor: Actor,
  supplier: Pick<Supplier, 'status' | 'createdBy'>,
  to: SupplierStatus,
  reason?: string | null,
): string | null {
  const t = TRANSITIONS.find((x) => x.from === supplier.status && x.to === to)
  if (!t) return `A ${label(supplier.status).toLowerCase()} supplier cannot be moved to ${label(to).toLowerCase()}.`
  if (t.superAdminOnly && actor.role !== 'super_admin') return `Only a super admin can ${t.action.toLowerCase()} a supplier.`
  if (t.notCreator && actor.uid === supplier.createdBy) return 'The admin who created this supplier cannot approve it. Another super admin must.'
  if (t.reasonRequired && (reason ?? '').trim().length < MIN_REASON_LENGTH) return 'A reason is required for this action.'
  return null
}

/** Information a draft must have before it is submitted for verification. */
export function submissionProblems(s: SupplierDetails): string[] {
  const out: string[] = []
  if (!s.legalName?.trim()) out.push('Legal / registered business name')
  if (!s.operatingModel) out.push('Operating model')
  if (!s.contact?.name?.trim()) out.push('Contact person')
  if (!s.contact?.phone?.trim()) out.push('Business phone')
  if (!s.address?.trim()) out.push('Business address')
  if (!enabledOrderTypes(s.fulfillment).length) out.push('At least one fulfilment capability')
  return out
}

export function enabledOrderTypes(f: Fulfillment | undefined): GasOrderType[] {
  return GAS_ORDER_TYPES.filter((t) => f?.[t] === true)
}

// ── Readiness for live orders ────────────────────────────────────────────────

export interface ReadinessCheck {
  id: string
  label: string
  ok: boolean
  detail?: string
}

export interface Readiness {
  checks: ReadinessCheck[]
  /** Every prerequisite holds, so a super admin may turn orders on. */
  canEnableOrders: boolean
  /** Prerequisites hold and orders are turned on. */
  liveForOrders: boolean
}

export function validPoint(p: { latitude: number; longitude: number } | null | undefined): boolean {
  if (!p) return false
  const { latitude: lat, longitude: lng } = p
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false
  return !(lat === 0 && lng === 0)
}

export function isOfferable(p: Pick<Product, 'verified' | 'availability' | 'price'>): boolean {
  return p.verified === true && p.availability === 'available' && Number.isFinite(p.price) && p.price > 0
}

/**
 * Whether a supplier may take Gas orders, checked independently of its
 * status: approval alone is not enough. Dispatch does not yet read suppliers;
 * when it does, it must apply this same check server-side.
 */
export function supplierReadiness(
  supplier: Pick<Supplier, 'status' | 'ordersEnabled' | 'fulfillment' | 'riderArrangement'>,
  stations: Array<{ station: Pick<Station, 'status' | 'location' | 'name'>; products: Array<Pick<Product, 'orderType' | 'verified' | 'availability' | 'price'>> }>,
): Readiness {
  const types = enabledOrderTypes(supplier.fulfillment)
  const verified = stations.filter((s) => s.station.status === 'verified' && validPoint(s.station.location))
  const offerable = verified.flatMap((s) => s.products.filter(isOfferable))

  const checks: ReadinessCheck[] = [
    { id: 'approved', label: 'Supplier approved', ok: supplier.status === 'approved', detail: supplier.status === 'approved' ? undefined : `Status is ${label(supplier.status).toLowerCase()}` },
    { id: 'fulfillment', label: 'Fulfilment capabilities set', ok: types.length > 0 },
    { id: 'riders', label: 'Rider arrangement CTSGo can deliver', ok: !!supplier.riderArrangement && DISPATCHABLE_RIDER_ARRANGEMENTS.includes(supplier.riderArrangement),
      detail: supplier.riderArrangement === 'supplier_riders' ? 'Supplier riders only: dispatch cannot assign supplier riders yet. Choose CTSGo dispatch or supplier riders with CTSGo fallback.' : undefined },
    { id: 'station', label: 'At least one verified station with coordinates', ok: verified.length > 0 },
  ]
  for (const t of types) {
    const ok = offerable.some((p) => p.orderType === t)
    checks.push({ id: `product:${t}`, label: `${label(t)}: verified, available product at a verified station`, ok })
  }
  const canEnableOrders = checks.every((c) => c.ok)
  return { checks, canEnableOrders, liveForOrders: canEnableOrders && supplier.ordersEnabled === true }
}

// ── Stations and products ────────────────────────────────────────────────────

/** Missing information that stops a station being verified. */
export function stationVerificationProblems(s: StationDetails): string[] {
  const out: string[] = []
  if (!s.name?.trim()) out.push('Station name')
  if (!s.address?.trim()) out.push('Address')
  if (!validPoint(s.location ?? null)) out.push('Valid coordinates')
  if (!s.contact?.phone?.trim()) out.push('Contact phone')
  if (!s.operatingHours?.trim()) out.push('Operating hours')
  return out
}

/** Parses "lat, lng" typed by an admin. Null when it is not a usable point. */
export function parseCoordinates(text: string): { latitude: number; longitude: number } | null {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
  if (!m) return null
  const p = { latitude: Number(m[1]), longitude: Number(m[2]) }
  return validPoint(p) ? p : null
}

export const MAX_PRICE = 100000

/** One product per order type, size and brand at a station. */
export function productId(orderType: GasOrderType, size: CylinderSize, brand: GasBrand): string {
  return `${orderType}_${size}_${brand}`
}

export function productProblems(p: { orderType?: string; cylinderSize?: string; brand?: string; price?: number; handlingFee?: number }): string[] {
  const out: string[] = []
  if (!GAS_ORDER_TYPES.includes(p.orderType as GasOrderType)) out.push('Order type')
  if (!CYLINDER_SIZES.includes(p.cylinderSize as CylinderSize)) out.push('Cylinder size')
  if (!GAS_BRANDS.includes(p.brand as GasBrand)) out.push('Brand')
  if (!validMoney(p.price) || !(p.price! > 0) || p.price! > MAX_PRICE) out.push('Price (GHS, above 0, at most 2 decimals)')
  if (!validMoney(p.handlingFee ?? 0) || (p.handlingFee ?? 0) < 0 || (p.handlingFee ?? 0) > MAX_PRICE) out.push('Handling fee (GHS, 0 or more)')
  return out
}

function validMoney(v: number | undefined): boolean {
  return typeof v === 'number' && Number.isFinite(v) && Math.round(v * 100) === Math.round(v * 100 * 1e6) / 1e6
}

/**
 * The price fields a future order would copy from a product when it is
 * placed. An order keeps its own copy, so later catalog changes never alter
 * it; priceVersion points at the matching price_history entry.
 */
export function orderPriceSnapshot(p: Pick<Product, 'id' | 'price' | 'handlingFee' | 'priceVersion' | 'currency'>, quantity: number) {
  return Object.freeze({
    productId: p.id,
    priceVersion: p.priceVersion,
    unitPrice: p.price,
    handlingFee: p.handlingFee,
    currency: p.currency,
    quantity,
    productTotal: Math.round(p.price * quantity * 100) / 100,
  })
}
