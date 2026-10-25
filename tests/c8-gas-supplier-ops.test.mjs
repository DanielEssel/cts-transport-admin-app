// C8: Gas supplier orders and settlement, as the admin's operations pages
// show them. Uses only Node's built-in test runner.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const o = await import('../src/lib/gas-supplier-ops.ts')
const NOW = Date.parse('2026-10-24T12:00:00Z')
const MIN = 60 * 1000

test('C8-01 admins can cancel only orders that are not finished', () => {
  for (const s of ['awaiting_payment', 'pendingApproval', 'confirmed', 'driverAssigned', 'atStation', 'outForDelivery']) assert.ok(o.ADMIN_CANCELLABLE.includes(s), s)
  for (const s of ['delivered', 'cancelled']) assert.ok(!o.ADMIN_CANCELLABLE.includes(s), s)
})

test('C8-02 orders needing attention: refunds first, then stuck stages', () => {
  assert.deepEqual(o.orderAttention({ status: 'cancelled', refundPending: true }, NOW), ['Refund not completed'])
  assert.match(o.orderAttention({ status: 'cancelled', refundPending: true, refundReview: 'escrow_released' }, NOW)[0], /needs review \(escrow released\)/)
  assert.equal(o.orderAttention({ status: 'confirmed', updatedAtMs: NOW - 10 * MIN }, NOW).length, 0)
  assert.match(o.orderAttention({ status: 'confirmed', updatedAtMs: NOW - 45 * MIN }, NOW)[0], /finding driver for over 30 min/)
  assert.equal(o.orderAttention({ status: 'delivered', updatedAtMs: NOW - 9999 * MIN }, NOW).length, 0)
})

test('C8-03 ledger sums use whole pesewas only', () => {
  const s = o.summarizeLedger([
    { party: 'supplier', kind: 'entitlement', amountPesewas: 27000 },
    { party: 'driver', kind: 'entitlement', amountPesewas: 2160 },
    { party: 'platform', kind: 'commission', amountPesewas: 3000 },
    { party: 'supplier', kind: 'entitlement', amountPesewas: 1.5 },
  ])
  assert.deepEqual(s.byParty, { supplier: 27000, driver: 2160, platform: 3000 })
  assert.equal(s.rejected, 1)
  assert.equal(o.formatPesewas(32160), 'GH₵321.60')
  assert.equal(o.formatPesewas(-5), '−GH₵0.05')
})

test('C8-04 an order reconciles only when its three entries add up to the snapshot total', () => {
  const ok = [{ party: 'supplier', kind: 'entitlement', amountPesewas: 27000 }, { party: 'driver', kind: 'entitlement', amountPesewas: 2160 }, { party: 'platform', kind: 'commission', amountPesewas: 3000 }]
  assert.equal(o.orderReconciles(ok, 321.6), true)
  assert.equal(o.orderReconciles(ok, 321.61), false)
  assert.equal(o.orderReconciles(ok.slice(0, 2), 291.6), false)
  assert.equal(o.orderReconciles([...ok.slice(0, 2), { party: 'platform', kind: 'commission', amountPesewas: 'x' }], 321.6), false)
})

test('C8-05 a statement shows the sum of its lines and flags a stored net that differs', () => {
  assert.deepEqual(o.checkStatement({ lines: [{ amountPesewas: 100 }, { amountPesewas: -40 }], netPesewas: 60 }), { netPesewas: 60, reconciles: true })
  assert.deepEqual(o.checkStatement({ lines: [{ amountPesewas: 100 }], netPesewas: 999 }), { netPesewas: 100, reconciles: false })
  assert.deepEqual(o.checkStatement({ lines: [] }), { netPesewas: null, reconciles: false })
})

test('C8-06 statements are prepared only for closed days', () => {
  assert.equal(o.isClosedBusinessDate('2026-10-23', NOW), true)
  for (const d of ['2026-10-24', '2026-10-25', '2026-02-30', '23-10-2026', '']) assert.equal(o.isClosedBusinessDate(d, NOW), false, d)
})

test('C8-07 the supplier portal URL must be a plain origin; plain http only on this machine', () => {
  assert.equal(o.portalBaseUrl('https://suppliers.example.com'), 'https://suppliers.example.com')
  assert.equal(o.portalBaseUrl('http://localhost:3201'), 'http://localhost:3201')
  for (const bad of [undefined, '', 'http://suppliers.example.com', 'https://u:p@x.example.com', 'https://x.example.com/path', 'https://x.example.com/?a=1', 'javascript:alert(1)', 'ftp://x']) {
    assert.equal(o.portalBaseUrl(bad), null, String(bad))
  }
})

test('C8-20 a denied read names the collections and the rules candidate; other failures keep their code', () => {
  const denied = o.gasLoadError({ code: 'permission-denied' }, 'gas_supplier_orders', 'supplier orders')
  assert.match(denied, /^Permission denied reading gas_supplier_orders\./)
  assert.match(denied, /rules-candidate/)
  assert.match(denied, /active/)
  assert.equal(o.gasLoadError({ code: 'unavailable' }, 'gas_suppliers', 'Gas suppliers'), 'Could not load Gas suppliers: unavailable')
  assert.equal(o.gasLoadError(new Error('boom'), 'x', 'y'), 'Could not load y: boom')
})
