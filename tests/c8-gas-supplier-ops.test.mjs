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

test('C8-R1 a driver can be released (reassignment) only before the supplier hands over, as the server allows', async () => {
  assert.deepEqual([...o.ADMIN_RELEASABLE], ['driverAssigned', 'atStation'])
  const { readFileSync, existsSync } = await import('node:fs')
  const src = new URL('../../passenger/cts-transport-passenger-app-clean/functions/gas_supplier_fulfilment.js', import.meta.url)
  if (!existsSync(src)) return
  assert.match(readFileSync(src, 'utf8'), /const RELEASABLE = Object\.freeze\(\["driverAssigned", "atStation"\]\);/)
})

// ── Financial allocation and commission terms ───────────────────────────────

// Test fixture (10%, not a commercial rate): 2 × 150.00, handling 2 × 2.50, delivery 16.60.
const ALLOC = {
  productSubtotalPesewas: 30000, handlingFeePesewas: 500, deliveryFeePesewas: 1660, customerTotalPesewas: 32160,
  commissionBasePesewas: 30000, commissionRateBps: 1000, commissionPesewas: 3000, commissionTermsId: 'v1', commissionTermsVersion: 1,
  commissionTermsReference: 'TEST-FIXTURE', supplierGrossPesewas: 30500, supplierAdjustmentsPesewas: 0, supplierNetPesewas: 27500,
  driverAdjustmentsPesewas: 0, driverNetPesewas: 1660,
}

test('C8-30 an allocation that follows the agreed equations passes, also against its snapshot total', () => {
  assert.deepEqual(o.checkAllocation(ALLOC, 321.6), { ok: true, problems: [] })
  assert.deepEqual(o.checkAllocation({ ...ALLOC, commissionRateBps: 0, commissionPesewas: 0, supplierNetPesewas: 30500 }), { ok: true, problems: [] })
})

test('C8-31 each broken equation is named', () => {
  const bad = (patch, re) => {
    const r = o.checkAllocation({ ...ALLOC, ...patch })
    assert.equal(r.ok, false, JSON.stringify(patch))
    assert.ok(r.problems.some((p) => re.test(p)), `${JSON.stringify(patch)} → ${r.problems.join('; ')}`)
  }
  bad({ customerTotalPesewas: 32161 }, /Total ≠ product \+ handling \+ delivery/)
  bad({ commissionBasePesewas: 30500, commissionPesewas: 3050 }, /base is not the product subtotal/) // handling commissioned
  bad({ commissionPesewas: 3001, supplierNetPesewas: 27499 }, /Commission ≠ floor/)
  bad({ supplierNetPesewas: 27000 }, /Supplier net/) // commission also taken from the handling fee
  bad({ driverNetPesewas: 1500 }, /Driver net/) // commission taken from the driver
  bad({ commissionRateBps: 10001 }, /Commission ≠ floor/)
  assert.ok(o.checkAllocation(ALLOC, 400).problems.some((p) => /price snapshot/.test(p)))
  assert.deepEqual(o.checkAllocation(null), { ok: false, problems: ['No allocation recorded'] })
  assert.deepEqual(o.checkAllocation({ ...ALLOC, commissionPesewas: 30.5 }), { ok: false, problems: ['Unreadable amounts'] })
})

test('C8-32 settlement stages: accrued, reversed, prepared; payout approved/completed only from the statement', () => {
  const e = { kind: 'entitlement' }
  assert.equal(o.settlementStage(e, {}), 'accrued')
  assert.equal(o.settlementStage(e, { reversed: true }), 'reversed')
  assert.equal(o.settlementStage(e, { claimed: true, statementPayoutStatus: 'not_started' }), 'statement_prepared')
  assert.equal(o.settlementStage(e, { claimed: true, statementPayoutStatus: 'payout_in_progress' }), 'payout_approved')
  assert.equal(o.settlementStage(e, { claimed: true, statementPayoutStatus: 'paid' }), 'payout_completed')
  assert.equal(o.settlementStage(e, { claimed: false, statementPayoutStatus: 'paid' }), 'accrued', 'never completed without a claiming statement')
  assert.equal(o.payoutStatusLabel(undefined), 'Not started')
  assert.equal(o.payoutStatusLabel('anything'), 'Not started')
  assert.equal(o.payoutStatusLabel('failed'), 'Payout failed (can be sent again)')
  assert.equal(o.payoutStatusLabel('paid'), 'Payout completed')
})

test('C8-33 commission terms proposals are checked as the server checks them; nothing is assumed', () => {
  const ok = { rateBps: '1000', termsReference: 'Agreement ref', settlementHoldHours: '24' }
  assert.equal(o.termsProposalProblem(ok), null)
  assert.equal(o.termsProposalProblem({ ...ok, rateBps: '0' }), null)
  for (const rateBps of ['', '10001', '12.5', '-1', '10%', 'abc']) assert.match(o.termsProposalProblem({ ...ok, rateBps }), /Rate/, rateBps)
  for (const termsReference of ['', '  ', 'ab']) assert.match(o.termsProposalProblem({ ...ok, termsReference }), /reference/, termsReference)
  for (const settlementHoldHours of ['', '-1', '721', 'x']) assert.match(o.termsProposalProblem({ ...ok, settlementHoldHours }), /hold/, settlementHoldHours)
  assert.deepEqual(o.parseTermsProposal({ rateBps: ' 1000 ', termsReference: ' Ref ', settlementHoldHours: '24' }), { rateBps: 1000, termsReference: 'Ref', settlementHoldHours: 24 })
  assert.equal(o.formatBps(1250), '12.50%')
  assert.equal(o.formatBps(null), '—')
})

test('C8-34 a proposer cannot approve their own terms; only proposed versions can be approved', () => {
  assert.equal(o.canApproveTerms({ status: 'proposed', proposedBy: 'a' }, 'b'), true)
  assert.equal(o.canApproveTerms({ status: 'proposed', proposedBy: 'a' }, 'a'), false)
  assert.equal(o.canApproveTerms({ status: 'proposed', proposedBy: 'a' }, null), false)
  for (const status of ['approved', 'rejected', 'superseded', undefined]) assert.equal(o.canApproveTerms({ status, proposedBy: 'a' }, 'b'), false)
})

test('C8-35 a refused allocation read is reported as a rules problem, never as "no allocation recorded"', () => {
  const denied = o.allocationReadError({ code: 'permission-denied', message: 'Missing or insufficient permissions.' })
  assert.match(denied, /Permission denied reading gas_supplier_orders\/\{orderId\}\/finance/)
  assert.match(denied, /rules/)
  assert.doesNotMatch(denied, /No financial allocation/)
  assert.match(o.allocationReadError({ code: 'unavailable' }), /^Could not load order allocations: unavailable$/)
})

test('C8-36 payout actions follow the server: send, record a confirmed result, credit a driver; never for commission or nothing to pay', () => {
  const sup = (o) => ({ party: 'supplier', status: 'prepared', netPesewas: 27000, payoutStatus: 'not_started', ...o })
  assert.equal(o.statementPayoutAction(sup()), 'send_mobile_money')
  assert.equal(o.statementPayoutAction(sup({ payoutStatus: 'failed' })), 'send_mobile_money')
  assert.equal(o.statementPayoutAction(sup({ payoutStatus: 'payout_in_progress', payout: { outcome: 'sent' } })), 'record_result')
  assert.equal(o.statementPayoutAction(sup({ payoutStatus: 'payout_in_progress', payout: { outcome: 'unknown' } })), 'record_result')
  assert.equal(o.statementPayoutAction(sup({ payoutStatus: 'payout_in_progress', payout: { outcome: 'sending' } })), null, 'still sending: wait')
  assert.equal(o.statementPayoutAction(sup({ payoutStatus: 'paid' })), null)
  assert.equal(o.statementPayoutAction(sup({ status: 'prepared_no_payout', netPesewas: 0 })), null)
  assert.equal(o.statementPayoutAction(sup({ netPesewas: 1.5 })), null)
  assert.equal(o.statementPayoutAction({ party: 'driver', status: 'prepared', netPesewas: 2160, payoutStatus: 'not_started' }), 'credit_driver_wallet')
  assert.equal(o.statementPayoutAction({ party: 'driver', status: 'prepared', netPesewas: 2160, payoutStatus: 'failed' }), null)
  assert.equal(o.statementPayoutAction({ party: 'platform', status: 'prepared', netPesewas: 3000, payoutStatus: 'not_started' }), null)
  assert.equal(o.payoutEvidenceOk(' ok  '), false)
  assert.equal(o.payoutEvidenceOk('Bridge ref 123'), true)
})

test('C8-37 who delivers is shown with who earns the delivery fee', () => {
  assert.match(o.deliveryModeLabel('supplier_rider'), /own rider.*supplier/)
  assert.match(o.deliveryModeLabel('ctsgo_driver'), /CTSGo driver.*driver/)
  assert.equal(o.deliveryModeLabel(undefined), 'Not chosen yet')
})
