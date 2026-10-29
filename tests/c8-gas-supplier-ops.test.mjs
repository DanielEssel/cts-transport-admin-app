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

// ── Task 11: labels, the rider payment view, order mode reconciliation ──────

test('AO-01 a driver wallet credit is never shown as a completed payout', () => {
  assert.equal(o.payoutStatusLabel('paid', 'driver', 'driver_wallet'), 'Credited to CTSGo wallet')
  assert.equal(o.payoutStatusLabel('paid', 'supplier', 'mobile_money'), 'Payout completed')
  assert.match(o.payoutStatusLabel('paid'), /Payout completed/)
  assert.equal(o.payoutStatusLabel('paid', 'driver', null), 'Credited to CTSGo wallet', 'a driver is never "Payout completed", whatever the method')
  assert.equal(o.payoutStatusLabel('paid', 'driver', 'mobile_money'), 'Credited to CTSGo wallet')
  assert.equal(o.settlementStage({ kind: 'entitlement' }, { claimed: true, statementPayoutStatus: 'paid', party: 'driver' }), 'credited_to_wallet')
  assert.equal(o.settlementStage({ kind: 'entitlement' }, { claimed: true, statementPayoutStatus: 'paid', party: 'driver', payoutMethod: 'mobile_money' }), 'credited_to_wallet')
  assert.equal(o.riderPaymentSummary([], [], [{ party: 'driver', payoutStatus: 'paid', netPesewas: 100 }], [], []).credited, 100)
  assert.equal(o.payoutStatusLabel('not_required', 'driver', 'driver_wallet'), 'Nothing to pay')
  assert.equal(o.payoutStatusLabel('not_required'), 'Nothing to pay')
  const e = { kind: 'entitlement' }
  assert.equal(o.settlementStage(e, { claimed: true, statementPayoutStatus: 'paid', party: 'driver', payoutMethod: 'driver_wallet' }), 'credited_to_wallet')
  assert.equal(o.settlementStage(e, { claimed: true, statementPayoutStatus: 'paid', party: 'supplier', payoutMethod: 'mobile_money' }), 'payout_completed')
  assert.equal(o.settlementStage({ kind: 'reversal' }, { claimed: true, debtStatus: 'outstanding' }), 'outstanding_adjustment')
  assert.equal(o.SETTLEMENT_STAGE_LABELS.credited_to_wallet, 'Credited to CTSGo wallet')
  assert.ok(o.SETTLEMENT_STAGE_LABELS.outstanding_adjustment)
})

test('AO-02 the rider payment summary keeps each stage in its own bucket (pesewas)', () => {
  const entries = [
    { id: 'o1__driver__entitlement', party: 'driver', kind: 'entitlement', amountPesewas: 1500 }, // pending
    { id: 'o2__driver__entitlement', party: 'driver', kind: 'entitlement', amountPesewas: 2000 }, // in a prepared statement
    { id: 'o3__driver__entitlement', party: 'driver', kind: 'entitlement', amountPesewas: 3000 }, // credited
    { id: 'o9__driver__reversal', party: 'driver', kind: 'reversal', amountPesewas: -700 },       // a debt
  ]
  const claims = [
    { entryId: 'o2__driver__entitlement', statementId: 's2' },
    { entryId: 'o3__driver__entitlement', statementId: 's3' },
    { entryId: 'o9__driver__reversal', debtId: 'o9__driver__reversal' },
  ]
  const statements = [
    { id: 's2', party: 'driver', status: 'prepared', netPesewas: 2000, payoutStatus: 'not_started' },
    { id: 's3', party: 'driver', status: 'prepared', netPesewas: 3000, payoutStatus: 'paid', payoutMethod: 'driver_wallet' },
    { id: 's4', party: 'driver', status: 'prepared', netPesewas: 5000, withheldPesewas: 700, payablePesewas: 4300, payoutStatus: 'paid', payoutMethod: 'driver_wallet' },
    { id: 's5', party: 'driver', status: 'prepared', netPesewas: 400, withheldPesewas: 400, payablePesewas: 0, payoutStatus: 'not_required' },
  ]
  const debts = [{ id: 'o9__driver__reversal', status: 'outstanding', amountPesewas: 700 }, { id: 'old', status: 'resolved', amountPesewas: 900 }]
  const withdrawals = [
    { status: 'pending', amount: 10 },
    { status: 'processing', payoutOutcome: 'sent', amount: 20 },
    { status: 'processing', payoutOutcome: 'unknown', amount: 30.5 },
    { status: 'completed', amount: 40 },
    { status: 'failed', amount: 50 },
  ]
  const s = o.riderPaymentSummary(entries, claims, statements, debts, withdrawals)
  assert.deepEqual(s, {
    earnedPending: 1500, owed: 2000, credited: 7300, withdrawalRequested: 1000, sentAwaitingConfirmation: 2000,
    outcomeUnknown: 3050, paidOutConfirmed: 4000, failed: 5000, outstandingAdjustments: 700,
  })
  assert.equal(o.riderPaymentSummary([], [], [], [], []).paidOutConfirmed, 0)
  // credited never leaks into paid out, and only a completed withdrawal is paid out
  const only = o.riderPaymentSummary([], [], [statements[1]], [], [{ status: 'processing', payoutOutcome: 'sent', amount: 5 }])
  assert.equal(only.credited, 3000); assert.equal(only.paidOutConfirmed, 0)
})

test('AO-03 an order\'s delivery party must match its mode', () => {
  const e = (id, party, extra = {}) => ({ id: `o1__${id}`, party, kind: 'entitlement', amountPesewas: 100, ...extra })
  const sup = e('supplier__entitlement', 'supplier'), com = e('platform__commission', 'platform')
  const drv = e('driver__entitlement', 'driver', { partyId: 'd1' }), fee = e('supplier__delivery_fee', 'supplier')
  assert.equal(o.orderModeReconciles({ deliveryMode: 'linked_rider', driverId: 'd1' }, [sup, com, drv]), true)
  assert.equal(o.orderModeReconciles({ deliveryMode: 'ctsgo_driver', driverId: 'd1' }, [sup, com, drv]), true)
  assert.equal(o.orderModeReconciles({ deliveryMode: 'supplier_rider' }, [sup, com, fee]), true)
  assert.equal(o.orderModeReconciles({ deliveryMode: 'linked_rider', driverId: 'd1' }, [sup, com, fee]), false)
  assert.equal(o.orderModeReconciles({ deliveryMode: 'linked_rider', driverId: 'd1' }, [sup, com, drv, fee]), false, 'linked_rider never has a supplier delivery fee')
  assert.equal(o.orderModeReconciles({ deliveryMode: 'supplier_rider' }, [sup, com, drv]), false)
  assert.equal(o.orderModeReconciles({ deliveryMode: 'linked_rider', driverId: 'other' }, [sup, com, drv]), false, 'paid to a different driver')
  assert.equal(o.orderModeReconciles({ deliveryMode: 'mystery' }, [sup, com, drv]), false)
  assert.equal(o.orderModeReconciles({ deliveryMode: null }, [sup, com, drv]), false)
  // reversals do not count as a second delivery entry
  assert.equal(o.orderModeReconciles({ deliveryMode: 'linked_rider', driverId: 'd1' }, [sup, com, drv, { id: 'o1__driver__reversal', party: 'driver', kind: 'reversal', amountPesewas: -100 }]), true)
})

test('AO-04 the linked supplier rider mode is named, with who is paid', () => {
  assert.equal(o.deliveryModeLabel('linked_rider'), 'Linked supplier rider (delivery fee paid by CTSGo to the rider)')
})

test('AO-05 a debt offers only the resolutions its stage allows; a proposer cannot decide their own proposal', () => {
  const pick = (c) => c.map((x) => x.resolution ?? x.action)
  assert.deepEqual(pick(o.debtChoices({ status: 'outstanding', stage: 'before_payout' }, 'a1')), ['withhold', 'pay_in_full'])
  assert.deepEqual(o.debtChoices({ status: 'outstanding', stage: 'before_payout' }, 'a1').map((x) => x.action), ['resolve', 'resolve'])
  assert.deepEqual(pick(o.debtChoices({ status: 'outstanding', stage: 'after_payout' }, 'a1')), ['written_off', 'recovered_externally'])
  assert.deepEqual(o.debtChoices({ status: 'outstanding', stage: 'after_payout' }, 'a1').map((x) => x.action), ['propose', 'propose'])
  const proposed = { status: 'resolution_proposed', stage: 'after_payout', proposal: { by: 'a1', resolution: 'written_off' } }
  assert.deepEqual(o.debtChoices(proposed, 'a1'), [])
  assert.deepEqual(pick(o.debtChoices(proposed, 'a2')), ['approve', 'reject'])
  assert.deepEqual(o.debtChoices({ status: 'resolved', stage: 'before_payout' }, 'a1'), [])
  assert.equal(o.debtEvidenceRequired({ action: 'propose' }), true)
  assert.equal(o.debtEvidenceRequired({ action: 'resolve', resolution: 'withhold' }), false)
  assert.equal(o.debtEvidenceRequired({ action: 'approve' }), false)
})

test('AO-05b a debt\'s stage is the claiming statement\'s live one, and nothing is offered while its payout is unconfirmed', () => {
  const pick = (c) => c.map((x) => x.resolution ?? x.action)
  // Stored after_payout (reversed during payout_in_progress), then Bridge confirmed a failure: the server now allows only withhold / pay in full.
  const debt = { status: 'outstanding', stage: 'after_payout' }
  const failedSupplier = { party: 'supplier', payoutStatus: 'failed' }
  assert.equal(o.debtLiveStage(failedSupplier, 'after_payout'), 'before_payout')
  assert.deepEqual(pick(o.debtChoices(debt, 'a1', failedSupplier)), ['withhold', 'pay_in_full'])
  assert.deepEqual(o.debtChoices(debt, 'a1', failedSupplier).map((x) => x.action), ['resolve', 'resolve'])
  // The same rule as the server's debtStage.
  assert.equal(o.debtLiveStage({ party: 'driver', payoutStatus: 'not_started' }), 'before_payout')
  assert.equal(o.debtLiveStage({ party: 'supplier', payoutStatus: 'not_started' }), 'before_payout')
  assert.equal(o.debtLiveStage({ party: 'driver', payoutStatus: 'failed' }), 'after_payout')
  for (const s of ['paid', 'payout_in_progress', 'not_required', undefined]) assert.equal(o.debtLiveStage({ party: 'supplier', payoutStatus: s }), 'after_payout', String(s))
  assert.equal(o.debtLiveStage(null, 'before_payout'), 'after_payout')
  // A statement that could not be read falls back to the stored stage.
  assert.equal(o.debtLiveStage(undefined, 'before_payout'), 'before_payout')
  assert.deepEqual(pick(o.debtChoices({ status: 'outstanding', stage: 'before_payout' }, 'a1', { party: 'supplier', payoutStatus: 'paid' })), ['written_off', 'recovered_externally'])
  // Payout in progress: no action until the Bridge result is recorded.
  const inProgress = { party: 'supplier', payoutStatus: 'payout_in_progress' }
  assert.equal(o.debtBlocked(inProgress), 'Record the Bridge result first')
  assert.deepEqual(o.debtChoices(debt, 'a1', inProgress), [])
  assert.deepEqual(o.debtChoices({ status: 'resolution_proposed', proposal: { by: 'a1' } }, 'a2', inProgress), [])
  assert.equal(o.debtBlocked(failedSupplier), null)
  assert.equal(o.debtBlocked(null), null)
  assert.equal(o.debtBlocked(undefined), null)
})

test('AO-06 settlement refusals are shown in plain words', () => {
  assert.equal(o.settlementRefusal('debt_payout_unconfirmed'), 'Record the Bridge result first')
  for (const r of ['statement_has_outstanding_debt', 'debt_stage_changed', 'proposer_cannot_approve', 'statement_lines_mismatch', 'statement_claims_mismatch']) assert.ok(o.settlementRefusal(r), r)
  assert.equal(o.settlementRefusal('something_else'), null)
  assert.equal(o.settlementRefusal(undefined), null)
})

const PR = {
  entries: [
    { id: 'o1__driver__entitlement', amountPesewas: 1500 }, { id: 'o2__driver__entitlement', amountPesewas: 2000 },
    { id: 'o3__driver__entitlement', amountPesewas: 3000 }, { id: 'o9__driver__reversal', amountPesewas: -700 },
  ],
  claims: [{ entryId: 'o2__driver__entitlement' }, { entryId: 'o3__driver__entitlement' }, { entryId: 'o9__driver__reversal' }],
  statements: [
    { party: 'driver', status: 'prepared', netPesewas: 2000, payoutStatus: 'not_started' },
    { party: 'driver', status: 'prepared', netPesewas: 3000, payoutStatus: 'paid', payoutMethod: 'driver_wallet' },
  ],
  debts: [{ status: 'outstanding', amountPesewas: 700 }],
}

test('AO-07 a driver whose pending, owed, credited and debts add up to the ledger reconciles', () => {
  assert.deepEqual(o.partyReconciles(PR.entries, PR.claims, PR.statements, PR.debts), { ok: true, problems: [] })
  // a resolved write-off still balances; so does a withheld debt (already out of payable)
  const wo = [{ status: 'resolved', resolution: 'written_off', amountPesewas: 700 }]
  assert.equal(o.partyReconciles(PR.entries, PR.claims, PR.statements, wo).ok, true)
  const withheld = [{ party: 'driver', status: 'prepared', netPesewas: 5000, withheldPesewas: 700, payablePesewas: 4300, payoutStatus: 'paid', payoutMethod: 'driver_wallet' }]
  const e2 = [{ id: 'a', amountPesewas: 5000 }, { id: 'r', amountPesewas: -700 }]
  assert.equal(o.partyReconciles(e2, [{ entryId: 'a' }, { entryId: 'r' }], withheld, [{ status: 'resolved', resolution: 'withhold', amountPesewas: 700 }]).ok, true)
  assert.equal(o.partyReconciles(PR.entries, PR.claims, PR.statements, PR.debts, [{ amountPesewas: 3000 }]).ok, true)
})

test('AO-08 an unbalanced driver is flagged', () => {
  const noDebt = o.partyReconciles(PR.entries, PR.claims, PR.statements, [])
  assert.equal(noDebt.ok, false); assert.match(noDebt.problems[0], /Entries net/)
  const odd = o.partyReconciles(PR.entries, PR.claims, [PR.statements[0], { ...PR.statements[1], payoutMethod: 'mobile_money' }], PR.debts)
  assert.equal(odd.ok, false); assert.ok(odd.problems.some((p) => /driver_wallet/.test(p)))
  const rows = o.partyReconciles(PR.entries, PR.claims, PR.statements, PR.debts, [{ amountPesewas: 2900 }])
  assert.equal(rows.ok, false); assert.ok(rows.problems.some((p) => /Wallet credit rows/.test(p)))
  assert.equal(o.partyReconciles([{ id: 'x', amountPesewas: 1.5 }], [], [], []).ok, false)
})

test('AO-09 an old resolved debt keeps its reversal out of "Earned, pending"', () => {
  const entries = [{ id: 'a', amountPesewas: 5000 }, { id: 'r', amountPesewas: -700 }]
  const statements = [{ party: 'driver', status: 'prepared', netPesewas: 5000, payoutStatus: 'paid', payoutMethod: 'driver_wallet' }]
  const debt = { id: 'r', reversalEntryId: 'r', status: 'resolved', resolution: 'written_off', amountPesewas: 700 }
  // the claims the page builds: the statement's lines plus every known debt's reversal
  const claims = (ds) => [{ entryId: 'a' }, ...ds.map((d) => ({ entryId: d.reversalEntryId }))]
  assert.equal(o.riderPaymentSummary(entries, claims([debt]), statements, [debt], []).earnedPending, 0)
  assert.equal(o.partyReconciles(entries, claims([debt]), statements, [debt]).ok, true)
  // with the debt missing, the reversal leaks into pending and the party is flagged
  assert.equal(o.riderPaymentSummary(entries, claims([]), statements, [], []).earnedPending, -700)
  // (the reconciliation stays balanced there: it cannot tell a missing debt from a pending reversal, so the data must be complete)
})

test('C8-OF1 order view: fallback reasons and offer outcomes in plain words', () => {
  for (const r of ['supplier_request', 'rider_timeout', 'no_rider_assigned', 'riders_declined', 'admin_release']) {
    const t = o.fallbackReasonLabel(r)
    assert.ok(t && !t.includes('_'), r)
  }
  assert.equal(o.fallbackReasonLabel('rider_timeout'), 'The offered rider did not answer in time.')
  assert.equal(o.fallbackReasonLabel('something_new'), 'Passed to CTSGo (something_new)')
  assert.equal(o.fallbackReasonLabel(null), null)
  assert.equal(o.fallbackReasonLabel(''), null)
  for (const x of ['accepted', 'declined', 'timed_out', 'withdrawn', 'cancelled', 'revoked']) assert.ok(!o.offerOutcomeLabel(x).includes('_'), x)
  assert.equal(o.offerOutcomeLabel(undefined), '—')
})

test('C8-OF2 order view: offer history shows the pending offer with its expiry, the last offer with its outcome and the decline count', () => {
  assert.deepEqual(o.offerHistory({}, NOW), [])
  assert.deepEqual(o.offerHistory({ riderOffer: null, lastRiderOffer: null, declinedRiderIds: [] }, NOW), [])
  const lines = o.offerHistory({
    riderOffer: { driverId: 'rB', seq: 3, expiresAtMs: NOW + 4 * MIN },
    lastRiderOffer: { driverId: 'rA', seq: 2, outcome: 'declined', atMs: NOW - MIN },
    declinedRiderIds: ['rA', 'rC'],
  }, NOW)
  assert.equal(lines.length, 3)
  assert.match(lines[0], /^Pending offer to rB \(offer #3\): expires in 4 min \(2026-10-24T12:04:00\.000Z\)$/)
  assert.match(lines[1], /^Last offer to rA \(offer #2\): declined at 2026-10-24T11:59:00\.000Z$/)
  assert.equal(lines[2], '2 riders declined this order')
  assert.match(o.offerHistory({ riderOffer: { driverId: 'rB', seq: 1, expiresAtMs: NOW - 2 * MIN } }, NOW)[0], /expired 2 min ago, awaiting the fallback sweep/)
  assert.match(o.offerHistory({ riderOffer: { seq: 1 } }, NOW)[0], /^Pending offer to unknown rider \(offer #1\): no expiry recorded$/)
  assert.match(o.offerHistory({ lastRiderOffer: { driverId: 'rA', seq: 1, outcome: 'timed_out' } }, NOW)[0], /timed out$/)
  assert.deepEqual(o.offerHistory({ declinedRiderIds: ['rA'] }, NOW), ['1 rider declined this order'])
})

test('C8-OF3 order view: the cylinder-recovery alert, when present', () => {
  assert.equal(o.cylinderRecoveryNotice(null), null)
  assert.equal(o.cylinderRecoveryNotice(undefined), null)
  const open = o.cylinderRecoveryNotice({ resolved: false, message: 'Cancelled Gas supplier order X after hand-over: recover the cylinder' })
  assert.equal(open.tone, 'danger')
  assert.match(open.text, /^Cylinder recovery needed \(offline\): Cancelled Gas supplier order X/)
  assert.equal(o.cylinderRecoveryNotice({ resolved: true, message: 'm' }).tone, 'info')
  assert.match(o.cylinderRecoveryNotice({}).text, /recover the cylinder/)
})
