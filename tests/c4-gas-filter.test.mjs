// C4-B — Admin gas-order "Pending" filter shows orders as they are actually
// created (pendingApproval). Uses only Node's built-in test runner.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const { matchesGasFilter } = await import('../src/lib/gas-order-filters.ts')
const page = readFileSync(fileURLToPath(new URL('../src/app/gas-orders/page.tsx', import.meta.url)), 'utf8')

test('a pendingApproval order appears under Pending', () => {
  assert.equal(matchesGasFilter('pendingApproval', 'pendingApproval'), true)
})

test('the Pending button uses pendingApproval, and pendingReview is gone', () => {
  assert.match(page, /\{ key: 'pendingApproval', label: 'Pending' \}/)
  assert.doesNotMatch(page, /pendingReview/)
  assert.match(page, /matchesGasFilter\(o\.status, filter\)/)
})

test('other filters behave exactly as before', () => {
  const statuses = ['pendingApproval', 'driverAssigned', 'driverEnRoute', 'delivered', 'cancelled', 'cancelledByPassenger']
  const expected = {
    all: statuses,
    driverAssigned: ['driverAssigned'],
    delivered: ['delivered'],
    cancelled: ['cancelled', 'cancelledByPassenger'],
    pendingApproval: ['pendingApproval'],
  }
  for (const [filter, want] of Object.entries(expected)) {
    assert.deepEqual(statuses.filter((s) => matchesGasFilter(s, filter)), want, filter)
  }
})
