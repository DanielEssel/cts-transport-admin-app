// Choosing a CTSGo driver to link as a supplier rider, without copying IDs.
// Pure, for tests. The list comes from the drivers the admin can already
// read (drivers where role == 'driver_delivery'); linking itself is still the
// adminLinkGasSupplierRider callable, which re-checks everything below plus
// what the browser cannot see (an admin or supplier-member account, or an
// active link to another supplier).

export interface RiderCandidate {
  id: string
  name: string
  phone: string
  vehicle: string
  serviceType: string
  role: string
  isApproved: boolean
  signupStep: string
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** A driver document as the fields the picker shows and checks. */
export function toRiderCandidate(id: string, d: Record<string, unknown>): RiderCandidate {
  return {
    id,
    name: str(d.displayName) || str(d.fullName) || 'Unnamed driver',
    phone: str(d.phone),
    vehicle: [str(d.vehiclePlate), str(d.vehicleModel) || str(d.vehicleType)].filter(Boolean).join(' · '),
    serviceType: str(d.serviceType),
    role: str(d.role),
    isApproved: d.isApproved === true,
    signupStep: str(d.signupStep),
  }
}

/** Why the server would refuse to link this driver, or null. Mirrors linkRider in gas_supplier_riders.js. */
export function riderIneligibility(c: RiderCandidate, linkedHere: ReadonlySet<string>): string | null {
  if (linkedHere.has(c.id)) return 'Already linked to this supplier'
  if (c.role !== 'driver_delivery') return 'Not a delivery driver'
  if (c.signupStep === 'suspended') return 'Suspended'
  if (!c.isApproved) return 'Not approved'
  return null
}

const digits = (s: string) => s.replace(/\D/g, '')
// Ghana numbers are stored as +233… or 0…; compare on the national part.
const national = (s: string) => digits(s).replace(/^233/, '').replace(/^0/, '')
const compact = (s: string) => s.toLowerCase().replace(/[\s-]/g, '')

/** Name, phone (any of +233 / 0 / spaced forms), vehicle plate or driver ID. */
export function matchesDriverSearch(c: RiderCandidate, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (c.name.toLowerCase().includes(q)) return true
  const qn = national(q)
  if (qn.length >= 3 && national(c.phone).includes(qn)) return true
  const qc = compact(q)
  if (qc.length >= 2 && compact(c.vehicle).includes(qc)) return true
  return qc.length >= 4 && c.id.toLowerCase().startsWith(qc)
}

/** Matching drivers, eligible first, then by name. */
export function searchRiderCandidates(all: readonly RiderCandidate[], query: string, linkedHere: ReadonlySet<string>) {
  return all
    .filter((c) => matchesDriverSearch(c, query))
    .map((c) => ({ candidate: c, problem: riderIneligibility(c, linkedHere) }))
    .sort((a, b) => Number(!!a.problem) - Number(!!b.problem) || a.candidate.name.localeCompare(b.candidate.name))
}
