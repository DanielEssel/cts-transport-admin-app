// Gas administration views: how suppliers are grouped for review, how long
// they have waited, who owns a station's stock, and switch states. Pure (no
// Firebase, no runtime imports), for tests. Nothing here
// decides a status, a permission or an amount: those stay in gas-suppliers.ts,
// gas-supplier-ops.ts and the server.

import type { StockApproach, Supplier } from './gas-suppliers'

// ── Supplier list groups ────────────────────────────────────────────────────

export const SUPPLIER_GROUPS = ['applications', 'corrections', 'drafts', 'approved', 'suspended', 'rejected'] as const
export type SupplierGroup = typeof SUPPLIER_GROUPS[number]

export const SUPPLIER_GROUP_LABELS: Record<SupplierGroup, string> = {
  applications: 'Awaiting approval',
  corrections: 'Returned for corrections',
  drafts: 'Drafts',
  approved: 'Approved',
  suspended: 'Suspended',
  rejected: 'Rejected',
}

/**
 * Which list a supplier belongs in. A draft with a recorded reason came back
 * from review (Request corrections, or a rejected application reopened);
 * a draft without one has never been submitted.
 */
export function supplierGroup(s: Pick<Supplier, 'status' | 'statusReason'>): SupplierGroup {
  switch (s.status) {
    case 'pending_verification': return 'applications'
    case 'draft': return s.statusReason?.trim() ? 'corrections' : 'drafts'
    case 'approved': return 'approved'
    case 'suspended': return 'suspended'
    case 'rejected': return 'rejected'
  }
}

/** Milliseconds from a Firestore Timestamp, a Date or epoch ms; null otherwise. */
export function toMillis(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (v instanceof Date) return v.getTime()
  const t = v as { toMillis?: () => number } | null
  return t && typeof t.toMillis === 'function' ? t.toMillis() : null
}

/** "3 days", "5 hours", "under an hour": how long since `since`. */
export function waitingFor(since: unknown, now: number): string | null {
  const ms = toMillis(since)
  if (ms == null || ms > now) return null
  const hours = Math.floor((now - ms) / 3_600_000)
  if (hours < 1) return 'under an hour'
  if (hours < 48) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  return `${Math.floor(hours / 24)} days`
}

// ── Stock ownership ─────────────────────────────────────────────────────────

export const STOCK_OWNER_LABELS: Record<StockApproach, string> = {
  supplier_reported: 'Stock reported by supplier',
  admin_managed: 'Stock managed by CTSGo',
  not_tracked: 'Stock not tracked',
}

export function stockOwnerLabel(a: StockApproach | undefined): string {
  return a ? STOCK_OWNER_LABELS[a] : 'Stock owner not set'
}

/**
 * What an admin availability change means. In stock / out of stock at a
 * station whose stock the supplier reports is an override of the supplier's
 * value (the portal lets suppliers set only those two, there). Listing or
 * delisting (to or from "unavailable") is always CTSGo's decision.
 */
export function availabilityChangeKind(approach: StockApproach | undefined, from: string, to: string): 'override' | 'listing' | 'admin' | 'none' {
  if (from === to) return 'none'
  if (from === 'unavailable' || to === 'unavailable') return 'listing'
  return approach === 'supplier_reported' ? 'override' : 'admin'
}

// ── Switches ────────────────────────────────────────────────────────────────

/** Stored switch value: on, off, or unknown when the setting could not be read. */
export function switchState(doc: { enabled?: unknown } | null | undefined, readFailed = false): 'on' | 'off' | 'unknown' {
  if (readFailed) return 'unknown'
  return doc?.enabled === true ? 'on' : 'off'
}
