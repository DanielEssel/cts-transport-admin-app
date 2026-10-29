// C6 — Gas supplier onboarding: the workflow, readiness and catalog rules
// the admin pages apply. Uses only Node's built-in test runner.
// Run: npm run test:c1
//
// The same rules are enforced server-side by firestore.rules (passenger
// repo, rules-tests/test/gas_suppliers.test.js); these tests check the admin
// side agrees with them.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const g = await import('../src/lib/gas-suppliers.ts')

const SUPER_A = { uid: 'superA', role: 'super_admin' }
const SUPER_B = { uid: 'superB', role: 'super_admin' }
const PLAIN = { uid: 'plain', role: 'admin' }
const sup = (status, createdBy = 'superA') => ({ status, createdBy })

const TEMA = { latitude: 5.6698, longitude: -0.0166 }
const goodStation = { name: 'Tema 1', status: 'verified', location: TEMA }
const product = (o = {}) => ({ id: 'exchangeEmpty_kg12_5_goGas', orderType: 'exchangeEmpty', cylinderSize: 'kg12_5', brand: 'goGas',
  price: 150, handlingFee: 0, currency: 'GHS', priceVersion: 1, verified: true, availability: 'available', ...o })
const readySupplier = (o = {}) => ({ status: 'approved', ordersEnabled: false, riderArrangement: 'ctsgo_dispatch',
  fulfillment: { exchangeEmpty: true }, ...o })

// ── Workflow ──

test('a new supplier can only move forward by submission', () => {
  assert.equal(g.transitionProblem(PLAIN, sup('draft'), 'pending_verification'), null)
  assert.match(g.transitionProblem(SUPER_B, sup('draft'), 'approved'), /cannot be moved/)
})

test('only a super admin approves, rejects, suspends or reinstates', () => {
  assert.match(g.transitionProblem(PLAIN, sup('pending_verification'), 'approved'), /super admin/)
  assert.match(g.transitionProblem(PLAIN, sup('pending_verification'), 'rejected', 'No licence'), /super admin/)
  assert.match(g.transitionProblem(PLAIN, sup('approved'), 'suspended', 'Complaint'), /super admin/)
  assert.match(g.transitionProblem(PLAIN, sup('suspended'), 'approved'), /super admin/)
  assert.equal(g.transitionProblem(SUPER_B, sup('pending_verification'), 'approved'), null)
})

test('the creator cannot approve or reinstate their own supplier', () => {
  assert.match(g.transitionProblem(SUPER_A, sup('pending_verification', 'superA'), 'approved'), /created this supplier/)
  assert.match(g.transitionProblem(SUPER_A, sup('suspended', 'superA'), 'approved'), /created this supplier/)
  // They may still suspend it: stopping a supplier is a safety action.
  assert.equal(g.transitionProblem(SUPER_A, sup('approved', 'superA'), 'suspended', 'Complaint'), null)
})

test('reject, suspend, re-verify and reopen need a reason', () => {
  assert.match(g.transitionProblem(SUPER_B, sup('pending_verification'), 'rejected'), /reason/)
  assert.match(g.transitionProblem(SUPER_B, sup('approved'), 'suspended', '  '), /reason/)
  assert.match(g.transitionProblem(PLAIN, sup('approved'), 'pending_verification', ''), /reason/)
  assert.match(g.transitionProblem(SUPER_B, sup('rejected'), 'draft'), /reason/)
})

test('the transition table matches the one in firestore.rules', () => {
  const allowed = g.TRANSITIONS.map((t) => `${t.from}>${t.to}`).sort()
  assert.deepEqual(allowed, [
    'approved>pending_verification', 'approved>suspended', 'draft>pending_verification',
    'pending_verification>approved', 'pending_verification>draft', 'pending_verification>rejected',
    'rejected>draft', 'suspended>approved',
  ])
})

test('a draft needs its core details before submission', () => {
  assert.deepEqual(g.submissionProblems({ legalName: 'X' }).length, 5)
  assert.deepEqual(g.submissionProblems({
    legalName: 'X', operatingModel: 'lpg_station', contact: { name: 'A', phone: '+233' }, address: 'Accra',
    fulfillment: { exchangeEmpty: true },
  }), [])
})

// ── Readiness ──

test('draft, pending, rejected and suspended suppliers are never ready for orders', () => {
  for (const status of ['draft', 'pending_verification', 'rejected', 'suspended']) {
    const r = g.supplierReadiness(readySupplier({ status, ordersEnabled: true }), [{ station: goodStation, products: [product()] }])
    assert.equal(r.canEnableOrders, false, status)
    assert.equal(r.liveForOrders, false, status)
  }
})

test('approval alone is not enough: stations, products and riders are checked independently', () => {
  const full = [{ station: goodStation, products: [product()] }]
  assert.equal(g.supplierReadiness(readySupplier(), full).canEnableOrders, true)
  assert.equal(g.supplierReadiness(readySupplier(), full).liveForOrders, false) // orders still off
  assert.equal(g.supplierReadiness(readySupplier({ ordersEnabled: true }), full).liveForOrders, true)

  assert.equal(g.supplierReadiness(readySupplier(), []).canEnableOrders, false)
  assert.equal(g.supplierReadiness(readySupplier({ riderArrangement: 'undecided' }), full).canEnableOrders, false)
  assert.equal(g.supplierReadiness(readySupplier({ fulfillment: {} }), full).canEnableOrders, false)
  assert.equal(g.supplierReadiness(readySupplier(), [{ station: { ...goodStation, status: 'draft' }, products: [product()] }]).canEnableOrders, false)
  assert.equal(g.supplierReadiness(readySupplier(), [{ station: { ...goodStation, location: null }, products: [product()] }]).canEnableOrders, false)
})

test('unverified or unavailable products do not count; each enabled order type needs one', () => {
  const at = (p) => [{ station: goodStation, products: p }]
  assert.equal(g.supplierReadiness(readySupplier(), at([product({ verified: false })])).canEnableOrders, false)
  assert.equal(g.supplierReadiness(readySupplier(), at([product({ availability: 'out_of_stock' })])).canEnableOrders, false)
  const both = readySupplier({ fulfillment: { exchangeEmpty: true, pickupAndReturn: true } })
  const r = g.supplierReadiness(both, at([product()]))
  assert.equal(r.canEnableOrders, false)
  assert.deepEqual(r.checks.filter((c) => !c.ok).map((c) => c.id), ['product:pickupAndReturn'])
})

test('an unverified product is never offerable', () => {
  assert.equal(g.isOfferable(product({ verified: false, availability: 'available' })), false)
  assert.equal(g.isOfferable(product()), true)
})

// ── Stations ──

test('missing or invalid station details block verification but not a draft', () => {
  assert.deepEqual(g.stationVerificationProblems({ name: 'Tema 1' }), ['Address', 'Valid coordinates', 'Contact phone', 'Operating hours'])
  assert.deepEqual(g.stationVerificationProblems({ name: 'T', address: 'A', location: { latitude: 0, longitude: 0 }, contact: { phone: '1' }, operatingHours: 'h' }), ['Valid coordinates'])
})

test('coordinates are parsed strictly', () => {
  assert.deepEqual(g.parseCoordinates('5.6698, -0.0166'), TEMA)
  for (const bad of ['', '0, 0', '91, 0', '5.6 -0.1', 'abc', '5.6,']) assert.equal(g.parseCoordinates(bad), null, bad)
})

// ── Catalog ──

test('product ids are one per order type, size and brand (the format the rules check)', () => {
  assert.equal(g.productId('pickupAndReturn', 'kg6', 'goil'), 'pickupAndReturn_kg6_goil')
})

test('prices must be positive GHS amounts with at most two decimals', () => {
  const p = (price, handlingFee = 0) => g.productProblems({ orderType: 'exchangeEmpty', cylinderSize: 'kg6', brand: 'goGas', price, handlingFee })
  assert.deepEqual(p(150), [])
  assert.deepEqual(p(12.5), [])
  for (const bad of [0, -1, NaN, 12.345, g.MAX_PRICE + 1]) assert.equal(p(bad).length, 1, String(bad))
  assert.equal(p(150, -1).length, 1)
  assert.equal(g.productProblems({ orderType: 'x', cylinderSize: 'kg6', brand: 'any', price: 1 }).length, 2)
})

test('an order price snapshot does not change when the catalog does', () => {
  const p = product()
  const snap = g.orderPriceSnapshot(p, 2)
  p.price = 999; p.priceVersion = 2
  assert.deepEqual({ ...snap }, {
    productId: 'exchangeEmpty_kg12_5_goGas', priceVersion: 1, unitPrice: 150, handlingFee: 0, currency: 'GHS', quantity: 2, productTotal: 300,
  })
  assert.throws(() => { 'use strict'; snap.unitPrice = 1 })
})

// ── Agreement with the passenger app and the rules ──

const passenger = fileURLToPath(new URL('../../passenger/cts-transport-passenger-app-clean/', import.meta.url))
const dart = passenger + 'lib/features/gas/models/gas_refill_request.dart'
const rules = passenger + 'firestore.rules'

function dartEnum(src, name) {
  const body = src.match(new RegExp(`enum ${name} \\{([^;]*);`))[1]
  return body.split(',').map((s) => s.trim()).filter(Boolean)
}

test('order types, sizes and brands match the passenger app', { skip: !existsSync(dart) && 'passenger repo not alongside' }, () => {
  const src = readFileSync(dart, 'utf8')
  assert.deepEqual([...g.GAS_ORDER_TYPES], dartEnum(src, 'GasRefillType'))
  assert.deepEqual([...g.CYLINDER_SIZES], dartEnum(src, 'CylinderSize'))
  assert.deepEqual([...g.GAS_BRANDS], dartEnum(src, 'GasBrand').filter((b) => b !== 'any'))
})

test('the rules accept exactly these order types, sizes and brands', { skip: !existsSync(rules) && 'passenger repo not alongside' }, () => {
  const src = readFileSync(rules, 'utf8')
  const list = (field) => {
    const m = src.match(new RegExp(`d\\.${field} in \\[([^\\]]*)\\]`))
    return m[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean)
  }
  assert.deepEqual(list('orderType'), [...g.GAS_ORDER_TYPES])
  assert.deepEqual(list('cylinderSize'), [...g.CYLINDER_SIZES])
  assert.deepEqual(list('brand'), [...g.GAS_BRANDS])
  assert.deepEqual(list('availability'), [...g.PRODUCT_AVAILABILITY])
})

// ── Round 4: payout preference and rider arrangement ──

test('payout preference: MTN MoMo, Telecel Cash or AT Money, a 10-digit number and the account name', () => {
  assert.deepEqual([...g.PAYOUT_METHODS], ['mtn_momo', 'telecel_cash', 'at_money'])
  assert.deepEqual(g.PAYOUT_METHODS.map((m) => g.LABELS[m]), ['MTN MoMo', 'Telecel Cash', 'AT Money'])
  assert.equal(g.payoutPreferenceProblem(null), null, 'optional')
  for (const method of g.PAYOUT_METHODS) {
    assert.equal(g.payoutPreferenceProblem({ method, accountNumber: '0241234567', accountName: 'Test Gas Ltd' }), null, method)
  }
  for (const p of [{ method: 'bank', accountNumber: '0241234567', accountName: 'Ab' },
    { method: 'mtn_momo', accountNumber: '+233241234567', accountName: 'Ab' },
    { method: 'mtn_momo', accountNumber: '024123456', accountName: 'Ab' },
    { method: 'mtn_momo', accountNumber: '0241234567', accountName: 'A' }]) {
    assert.ok(g.payoutPreferenceProblem(p), JSON.stringify(p))
  }
})

test('the payout validation agrees with firestore.rules', { skip: !existsSync(rules) && 'passenger repo not alongside' }, () => {
  const src = readFileSync(rules, 'utf8')
  assert.match(src, /p\.method in \['mtn_momo', 'telecel_cash', 'at_money'\]/)
  assert.match(src, /p\.accountNumber\.matches\('\^0\[0-9\]\{9\}\$'\)/)
})

test('a supplier relying only on its own riders is not ready: dispatch cannot assign supplier riders yet', () => {
  const full = [{ station: goodStation, products: [product()] }]
  const r = g.supplierReadiness(readySupplier({ riderArrangement: 'supplier_riders' }), full)
  assert.equal(r.canEnableOrders, false)
  assert.match(r.checks.find((c) => c.id === 'riders').detail, /cannot assign supplier riders/)
  for (const a of ['ctsgo_dispatch', 'supplier_riders_ctsgo_fallback']) {
    assert.equal(g.supplierReadiness(readySupplier({ riderArrangement: a }), full).canEnableOrders, true, a)
  }
})

