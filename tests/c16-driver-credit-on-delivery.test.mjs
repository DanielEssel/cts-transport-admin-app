// C16: the driver's on-delivery statement (functions gas_settlement_ledger.js
// creditDriverOnDelivery), as Gas Settlement shows it. Created already
// credited, so the admin is never offered "Credit driver wallet" for it.
// Uses only Node's built-in test runner.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const o = await import('../src/lib/gas-supplier-ops.ts')

/** What the posting transaction writes for a GH₵4.44 delivery fee. */
const onDelivery = (o2 = {}) => ({
  statementId: 'gas_driver_credit_o1', businessDate: '2026-11-05', party: 'driver', partyId: 'd1', currency: 'GHS',
  lines: [{ entryId: 'o1__driver__entitlement', orderId: 'o1', kind: 'entitlement', amountPesewas: 444 }],
  creditsPesewas: 444, debitsPesewas: 0, netPesewas: 444, status: 'prepared', settlement: 'on_delivery',
  payoutStatus: 'paid', payoutMethod: 'driver_wallet', ...o2,
})

test('C16-01 an on-delivery driver statement offers no credit action and reads as credited', () => {
  const s = onDelivery()
  assert.equal(o.statementPayoutAction(s), null)
  assert.equal(o.payoutStatusLabel(s.payoutStatus, s.party, s.payoutMethod), 'Credited to CTSGo wallet')
  assert.deepEqual(o.checkStatement(s), { netPesewas: 444, reconciles: true })
})

test('C16-02 a zero fee is "Nothing to pay"; a daily driver statement still offers the credit', () => {
  const zero = onDelivery({ lines: [{ entryId: 'o1__driver__entitlement', amountPesewas: 0 }], netPesewas: 0, status: 'prepared_no_payout', payoutStatus: 'not_required', payoutMethod: null })
  assert.equal(o.statementPayoutAction(zero), null)
  assert.equal(o.payoutStatusLabel(zero.payoutStatus, zero.party, zero.payoutMethod), 'Nothing to pay')
  // Entries posted while the payment was only held still take the daily path.
  assert.equal(o.statementPayoutAction(onDelivery({ payoutStatus: 'not_started', payoutMethod: null, settlement: undefined })), 'credit_driver_wallet')
})
