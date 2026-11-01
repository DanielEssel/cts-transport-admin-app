// C13: driver picker for supplier riders, and one driver status for badge and actions.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const p = await import('../src/lib/rider-picker.ts')
const s = await import('../src/lib/driver-status.ts')

const drv = (id, over = {}) => p.toRiderCandidate(id, {
  displayName: 'Kofi Mensah', phone: '+233 24 123 4567', vehiclePlate: 'GR 1234-22', vehicleModel: 'Honda Ace',
  serviceType: 'delivery', role: 'driver_delivery', isApproved: true, signupStep: 'approved', ...over,
})

test('C13-01 a driver document becomes a candidate with safe fallbacks', () => {
  const c = drv('uid-kofi')
  assert.equal(c.name, 'Kofi Mensah')
  assert.equal(c.vehicle, 'GR 1234-22 · Honda Ace')
  const bare = p.toRiderCandidate('x', {})
  assert.equal(bare.name, 'Unnamed driver')
  assert.equal(bare.isApproved, false)
  assert.equal(p.toRiderCandidate('y', { fullName: 'Ama O', isApproved: 'true' }).isApproved, false, 'only boolean true counts')
})

test('C13-02 eligibility mirrors the server: role, suspension, approval, existing link', () => {
  const none = new Set()
  assert.equal(p.riderIneligibility(drv('a'), none), null)
  assert.equal(p.riderIneligibility(drv('a'), new Set(['a'])), 'Already linked to this supplier')
  assert.equal(p.riderIneligibility(drv('a', { role: 'driver_okada' }), none), 'Not a delivery driver')
  assert.equal(p.riderIneligibility(drv('a', { signupStep: 'suspended', isApproved: true }), none), 'Suspended')
  assert.equal(p.riderIneligibility(drv('a', { isApproved: false, signupStep: 'pendingApproval' }), none), 'Not approved')
})

test('C13-03 search by name, any phone form, plate or ID prefix', () => {
  const c = drv('Ab12Cd34')
  for (const q of ['kofi', 'MENSAH', '0241234567', '+233241234567', '24 123', 'gr1234', 'GR 1234', 'ab12']) {
    assert.ok(p.matchesDriverSearch(c, q), q)
  }
  for (const q of ['ama', '999', 'zz99', 'cd34']) assert.ok(!p.matchesDriverSearch(c, q), q)
  assert.ok(p.matchesDriverSearch(c, '  '), 'empty query lists everyone')
})

test('C13-04 results list eligible drivers first, then by name', () => {
  const all = [drv('1', { displayName: 'Zed', isApproved: false }), drv('2', { displayName: 'Yaw' }), drv('3', { displayName: 'Ama' })]
  const r = p.searchRiderCandidates(all, '', new Set(['2']))
  assert.deepEqual(r.map((x) => [x.candidate.name, x.problem]), [['Ama', null], ['Yaw', 'Already linked to this supplier'], ['Zed', 'Not approved']])
})

test('C13-05 one account status per driver; suspended wins, rejected is not shown as pending', () => {
  assert.equal(s.driverAccountStatus({ isApproved: true, signupStep: 'suspended' }), 'suspended')
  assert.equal(s.driverAccountStatus({ isApproved: false, signupStep: 'suspended' }), 'suspended')
  assert.equal(s.driverAccountStatus({ isApproved: true, signupStep: 'approved' }), 'approved')
  assert.equal(s.driverAccountStatus({ isApproved: false, signupStep: 'rejected' }), 'rejected')
  assert.equal(s.driverAccountStatus({ isApproved: false, signupStep: 'pendingApproval' }), 'pending')
  assert.equal(s.driverAccountStatus({}), 'pending')
})
