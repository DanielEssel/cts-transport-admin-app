// C11: supplier commission rates and Gas service times, as the admin forms
// send them and as the server reads them. Uses only Node's built-in test runner.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const o = await import('../src/lib/gas-supplier-ops.ts')
const t = await import('../src/lib/gas-service-times.ts')

test('C11-01 a supplier rate needs no hold period and is sent with its supplier; the platform default needs one', () => {
  const base = { rateBps: '1000', termsReference: 'CTSGo standard proposal', settlementHoldHours: '' }
  assert.match(o.termsProposalProblem(base), /hold/)
  assert.equal(o.termsProposalProblem({ ...base, supplierId: 'sup1' }), null)
  assert.deepEqual(o.parseTermsProposal({ ...base, supplierId: 'sup1' }), { rateBps: 1000, termsReference: 'CTSGo standard proposal', supplierId: 'sup1' })
  assert.deepEqual(o.parseTermsProposal({ ...base, settlementHoldHours: '24', supplierId: '' }), { rateBps: 1000, termsReference: 'CTSGo standard proposal', settlementHoldHours: 24 })
})

test('C11-02 current terms split into the platform default and each supplier rate; versions exclude the current documents', () => {
  const s = o.splitTermsDocs([{ id: 'current' }, { id: 'current_s_sup1' }, { id: 'v1' }, { id: 's_sup1_v1' }])
  assert.equal(s.platform.id, 'current')
  assert.deepEqual(Object.keys(s.suppliers), ['sup1'])
  assert.deepEqual(s.versions.map((v) => v.id), ['v1', 's_sup1_v1'])
  const ok = { active: true, rateBps: 1000, termsReference: 'r', approvedBy: 'a', commissionBase: 'product_subtotal', handlingFeeCommissionable: false, deliveryFeeCommissionable: false }
  assert.equal(o.termsUsable(ok), false, 'the platform default needs a hold period')
  assert.equal(o.termsUsable({ ...ok, settlementHoldHours: 24 }), true)
  assert.equal(o.termsUsable(ok, { supplier: true }), true)
  assert.equal(o.termsUsable(null), false, 'missing terms are never usable (never 0%)')
})

test('C11-03 service times: station, then defaults, then built-in; exchange has no refill; malformed means no ETA', () => {
  assert.deepEqual(t.effectiveServiceTimes(null, 'st1', 'exchangeEmpty'), { preparationMinutes: 10, refillMinutes: 0 })
  assert.deepEqual(t.effectiveServiceTimes(null, 'st1', 'pickupAndReturn'), { preparationMinutes: 10, refillMinutes: 15 })
  const doc = { defaults: { exchangeEmpty: { preparationMinutes: 12 } }, stations: { st1: { exchangeEmpty: { preparationMinutes: 8 } } } }
  assert.equal(t.effectiveServiceTimes(doc, 'st1', 'exchangeEmpty').preparationMinutes, 8)
  assert.equal(t.effectiveServiceTimes(doc, 'st2', 'exchangeEmpty').preparationMinutes, 12)
  assert.equal(t.effectiveServiceTimes({ defaults: { exchangeEmpty: { preparationMinutes: 2.5 } } }, 'st1', 'exchangeEmpty'), null)
  const form = Object.fromEntries(t.SERVICE_TIME_TYPES.map((k) => [k, { preparationMinutes: '', refillMinutes: '' }]))
  assert.equal(t.serviceTimesProblem(form), null)
  assert.deepEqual(t.parseServiceTimes({ ...form, newCylinder: { preparationMinutes: ' 7 ', refillMinutes: '' } }), { newCylinder: { preparationMinutes: 7 } })
  assert.match(t.serviceTimesProblem({ ...form, newCylinder: { preparationMinutes: '481', refillMinutes: '' } }), /480/)
})
