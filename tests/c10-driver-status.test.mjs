// C10: one definition of "waiting for an approval decision" (Drivers tab, sidebar badge, dashboard KPI).
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { isPendingDriverApproval: pending } = await import('../src/lib/driver-status.ts')

test('C10-01 only unapproved drivers at a submitted-documents step are pending', () => {
  for (const s of ['documentsUploaded', 'pendingApproval', 'documents_submitted', 'pending_review']) assert.ok(pending({ isApproved: false, signupStep: s }), s)
  for (const s of ['suspended', 'rejected', 'approved', 'personalInfo', undefined, null]) assert.ok(!pending({ isApproved: false, signupStep: s }), String(s))
  assert.ok(!pending({ isApproved: true, signupStep: 'documentsUploaded' }))
})
