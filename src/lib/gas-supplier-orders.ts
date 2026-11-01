// A supplier order as the admin pages list it, from the stored document.
// Pure, shared by Supplier Gas Orders, the Gas overview and the supplier
// workspace. Orders are written only by Cloud Functions.
import type { OrderOffers } from './gas-supplier-ops'

export interface SupplierOrderRow {
  id: string
  status: string
  supplierId: string
  stationId: string
  orderType: string
  cylinderSize: string
  quantity: number
  total: number | null
  driverId: string | null
  escrowId: string | null
  paymentStatus: string | null
  deliveryMode: string | null
  completionFailures: number
  refundPending: boolean
  refundReview: string | null
  offers: OrderOffers
  fallbackReason: string | null
  createdAtMs: number | null
  updatedAtMs: number | null
}

const ms = (v: unknown): number | null => (v && typeof (v as { toMillis?: unknown }).toMillis === 'function' ? (v as { toMillis(): number }).toMillis() : null)
const LAST_CHANGE = ['deliveredAt', 'handedOverAt', 'arrivedAtStationAt', 'acceptedAt', 'confirmedAt', 'paidAt', 'cancelledAt', 'createdAt'] as const

export function toRow(id: string, d: Record<string, any>): SupplierOrderRow {
  const changes = LAST_CHANGE.map((k) => ms(d[k])).filter((x): x is number => x != null)
  return {
    id, status: d.status, supplierId: d.supplierId, stationId: d.stationId, orderType: d.orderType, cylinderSize: d.cylinderSize,
    quantity: d.quantity, total: typeof d.priceSnapshot?.total === 'number' ? d.priceSnapshot.total : null,
    driverId: d.driverId ?? null, escrowId: d.payment?.escrowId ?? null,
    paymentStatus: typeof d.payment?.status === 'string' ? d.payment.status : null, refundPending: d.refundPending === true,
    deliveryMode: typeof d.deliveryMode === 'string' ? d.deliveryMode : null, completionFailures: Number.isInteger(d.completionFailures) ? d.completionFailures : 0,
    refundReview: typeof d.refundReview === 'string' ? d.refundReview : null,
    offers: {
      riderOffer: d.riderOffer ? { driverId: d.riderOffer.driverId, seq: d.riderOffer.seq, expiresAtMs: ms(d.riderOffer.expiresAt) } : null,
      lastRiderOffer: d.lastRiderOffer ? { driverId: d.lastRiderOffer.driverId, seq: d.lastRiderOffer.seq, outcome: d.lastRiderOffer.outcome, atMs: ms(d.lastRiderOffer.at) } : null,
      declinedRiderIds: d.declinedRiderIds,
    },
    fallbackReason: typeof d.ctsgoFallbackReason === 'string' ? d.ctsgoFallbackReason : null,
    createdAtMs: ms(d.createdAt), updatedAtMs: changes.length ? Math.max(...changes) : null,
  }
}

