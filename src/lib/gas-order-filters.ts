// Gas-order list filters for the admin Gas Orders page.
//
// Status values are the ones the system actually writes: the passenger app
// creates orders as `pendingApproval`; the acceptGasOrder function sets
// `driverAssigned`. (`pendingReview` was never written, so the old "Pending"
// filter always showed nothing.)

export type GasFilter = 'all' | 'pendingApproval' | 'driverAssigned' | 'delivered' | 'cancelled'

export function matchesGasFilter(status: string, filter: GasFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'cancelled') return status.toLowerCase().includes('cancel')
  return status === filter
}
