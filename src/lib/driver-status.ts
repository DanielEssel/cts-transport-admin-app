// Which drivers are waiting for an approval decision. One definition for the
// Drivers page's "Pending" tab, the sidebar badge and the dashboard KPI, so
// the three always agree. Pure, for tests.

const PENDING_STEPS = new Set(['documentsUploaded', 'pendingApproval', 'documents_submitted', 'pending_review'])

export function isPendingDriverApproval(d: { isApproved?: boolean; signupStep?: string | null }): boolean {
  return !d.isApproved && PENDING_STEPS.has(d.signupStep ?? '')
}

export type DriverAccountStatus = 'suspended' | 'approved' | 'rejected' | 'pending'

/** One status per driver, so the badge and the offered actions never disagree. */
export function driverAccountStatus(d: { isApproved?: boolean; signupStep?: string | null }): DriverAccountStatus {
  if (d.signupStep === 'suspended') return 'suspended'
  if (d.isApproved) return 'approved'
  if (d.signupStep === 'rejected') return 'rejected'
  return 'pending'
}
