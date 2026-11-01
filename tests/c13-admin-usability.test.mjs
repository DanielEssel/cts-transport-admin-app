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

const g = await import('../src/lib/gas-suppliers.ts')

const applicant = (over = {}) => ({
  legalName: 'Tema Gas Ltd', operatingModel: 'lpg_station', address: 'Spintex Rd',
  contact: { name: 'Abena', phone: '+233 20 555 0101' }, fulfillment: { exchangeEmpty: true },
  registration: { businessRegNo: 'CS-1', licenceNo: 'NPA-7', licenceExpiry: '2027-06-30' },
  verificationNotes: 'Licence seen.', ...over,
})
const station = (over = {}) => ({ station: { name: 'Spintex', status: 'draft', address: 'Rd', location: { latitude: 5.6, longitude: -0.1 }, contact: { phone: '024' }, operatingHours: '6-9', ...over }, products: [{ verified: false, price: 120 }] })
const failing = (c) => c.filter((x) => !x.ok).map((x) => x.id)

test('C13-06 application checklist: a complete application passes every check', () => {
  assert.deepEqual(failing(g.applicationChecklist(applicant(), [station()], '2026-11-01')), [])
})

test('C13-07 application checklist names what is missing, expired or unproposed', () => {
  const c = g.applicationChecklist(applicant({ registration: { licenceNo: 'NPA-7', licenceExpiry: '2026-10-31' }, verificationNotes: '' }), [], '2026-11-01')
  assert.deepEqual(failing(c), ['registration', 'licence', 'documents', 'stations', 'prices'])
  assert.equal(c.find((x) => x.id === 'registration').detail, 'Missing: registration no.')
  assert.equal(c.find((x) => x.id === 'licence').detail, 'Expired 2026-10-31')
  const gaps = g.applicationChecklist(applicant(), [station({ location: null, operatingHours: '' })], '2026-11-01').find((x) => x.id === 'stations')
  assert.equal(gaps.ok, true)
  assert.match(gaps.detail, /1 station is missing details/)
})

test('C13-08 requesting corrections (pending -> draft) needs a reason; the rules and approvers are unchanged', () => {
  const t = g.TRANSITIONS.find((x) => x.from === 'pending_verification' && x.to === 'draft')
  assert.equal(t.action, 'Request corrections')
  assert.equal(t.superAdminOnly, false)
  const admin = { uid: 'a', role: 'admin' }
  assert.match(g.transitionProblem(admin, { status: 'pending_verification', createdBy: 'x' }, 'draft', ''), /reason is required/)
  assert.equal(g.transitionProblem(admin, { status: 'pending_verification', createdBy: 'x' }, 'draft', 'Licence copy unreadable'), null)
  assert.match(g.transitionProblem({ uid: 'x', role: 'super_admin' }, { status: 'pending_verification', createdBy: 'x' }, 'approved'), /created this supplier cannot approve/)
})
