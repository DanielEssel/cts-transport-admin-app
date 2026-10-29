// Which drivers are waiting for an approval decision. One definition for the
// Drivers page's "Pending" tab, the sidebar badge and the dashboard KPI, so
// the three always agree. Pure, for tests.

const PENDING_STEPS = new Set(['documentsUploaded', 'pendingApproval', 'documents_submitted', 'pending_review'])

export function isPendingDriverApproval(d: { isApproved?: boolean; signupStep?: string | null }): boolean {
  return !d.isApproved && PENDING_STEPS.has(d.signupStep ?? '')
}
