// C14: Gas administration views. Supplier review groups, waiting time, stock
// ownership and overrides, honest document status, settlement counts, history
// wording, the correction-reason rule and the Gas navigation.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const a = await import('../src/lib/gas-admin.ts')
const g = await import('../src/lib/gas-suppliers.ts')
const ops = await import('../src/lib/gas-supplier-ops.ts')
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

test('C14-01 every status lands in exactly one review group; a draft with a reason was returned', () => {
  assert.equal(a.supplierGroup({ status: 'pending_verification' }), 'applications')
  assert.equal(a.supplierGroup({ status: 'draft', statusReason: null }), 'drafts')
  assert.equal(a.supplierGroup({ status: 'draft', statusReason: '  ' }), 'drafts')
  assert.equal(a.supplierGroup({ status: 'draft', statusReason: 'Add GPS for Tema station' }), 'corrections')
  assert.equal(a.supplierGroup({ status: 'approved', statusReason: 'x' }), 'approved')
  assert.equal(a.supplierGroup({ status: 'suspended' }), 'suspended')
  assert.equal(a.supplierGroup({ status: 'rejected' }), 'rejected')
  for (const st of g.SUPPLIER_STATUSES) assert.ok(a.SUPPLIER_GROUPS.includes(a.supplierGroup({ status: st })))
})

test('C14-02 waiting time reads plainly and never invents a value', () => {
  const now = Date.UTC(2026, 10, 1, 12)
  assert.equal(a.waitingFor({ toMillis: () => now - 20 * 60e3 }, now), 'under an hour')
  assert.equal(a.waitingFor(now - 5 * 3600e3, now), '5 hours')
  assert.equal(a.waitingFor(new Date(now - 3 * 86400e3), now), '3 days')
  assert.equal(a.waitingFor(null, now), null)
  assert.equal(a.waitingFor(now + 60e3, now), null)
})

test('C14-03 stock: in/out of stock at a supplier-reported station is an override; listing is always CTSGo', () => {
  assert.equal(a.availabilityChangeKind('supplier_reported', 'available', 'out_of_stock'), 'override')
  assert.equal(a.availabilityChangeKind('supplier_reported', 'out_of_stock', 'available'), 'override')
  assert.equal(a.availabilityChangeKind('supplier_reported', 'available', 'unavailable'), 'listing')
  assert.equal(a.availabilityChangeKind('supplier_reported', 'unavailable', 'available'), 'listing')
  assert.equal(a.availabilityChangeKind('admin_managed', 'available', 'out_of_stock'), 'admin')
  assert.equal(a.availabilityChangeKind(undefined, 'available', 'out_of_stock'), 'admin')
  assert.equal(a.availabilityChangeKind('supplier_reported', 'available', 'available'), 'none')
  assert.equal(a.stockOwnerLabel('supplier_reported'), 'Stock reported by supplier')
  assert.equal(a.stockOwnerLabel(undefined), 'Stock owner not set')
})

test('C14-04 documents are never reported as uploaded: only "manual verification recorded" or "not yet provided"', () => {
  assert.equal(g.documentStatus({ verificationNotes: 'Saw NPA licence' }).label, 'Manual verification recorded')
  assert.equal(g.documentStatus({ verificationNotes: '' }).label, 'Not yet provided')
  for (const v of ['x', '']) assert.match(g.documentStatus({ verificationNotes: v }).detail, /No documents are uploaded/)
  const c = g.applicationChecklist({ legalName: 'X', verificationNotes: '' }, [], '2026-11-01').find((x) => x.id === 'documents')
  assert.equal(c.ok, false)
  assert.equal(c.label, 'Verification documents: not yet provided')
})

test('C14-05 settlement counts use the settlement page rules and compute no amounts', () => {
  const q = ops.settlementQueue([
    { party: 'supplier', status: 'prepared', netPesewas: 5000, payoutStatus: 'not_started' },
    { party: 'supplier', status: 'prepared', netPesewas: 5000, payoutStatus: 'payout_in_progress', payout: { outcome: 'sent' } },
    { party: 'supplier', status: 'prepared', netPesewas: 0, payoutStatus: 'not_started' },
    { party: 'driver', status: 'prepared', netPesewas: 900, payoutStatus: 'not_started' },
    { party: 'platform', status: 'prepared', netPesewas: 700, payoutStatus: 'not_started' },
  ], [{ status: 'outstanding' }, { status: 'resolution_proposed' }, { status: 'resolved' }])
  assert.deepEqual(q, { supplierPayoutsToSend: 1, payoutResultsToRecord: 1, driverStatementsToCredit: 1, openDebts: 2 })
  assert.equal(a.switchState({ enabled: true }), 'on')
  assert.equal(a.switchState({ enabled: 'true' }), 'off')
  assert.equal(a.switchState(null), 'off')
  assert.equal(a.switchState(null, true), 'unknown')
})

test('C14-06 history wording names correction requests and submissions', () => {
  assert.equal(g.historyLabel({ type: 'status_changed', fromStatus: 'pending_verification', toStatus: 'draft' }), 'Corrections requested')
  assert.equal(g.historyLabel({ type: 'status_changed', fromStatus: 'draft', toStatus: 'pending_verification' }), 'Submitted for verification')
  assert.equal(g.historyLabel({ type: 'status_changed', fromStatus: 'pending_verification', toStatus: 'approved' }), 'Pending verification → Approved')
  assert.equal(g.historyLabel({ type: 'created' }), 'Created as draft')
})

test('C14-07 a correction request needs a meaningful reason; other rules are unchanged', () => {
  const admin = { uid: 'a', role: 'admin' }, pending = { status: 'pending_verification', createdBy: 'x' }
  assert.match(g.transitionProblem(admin, pending, 'draft', 'fix it'), /at least 15 characters/)
  assert.equal(g.transitionProblem(admin, pending, 'draft', 'Add coordinates for Tema station'), null)
  // Rejection keeps its original minimum; approval keeps super admin + not creator.
  assert.equal(g.transitionProblem({ uid: 's', role: 'super_admin' }, pending, 'rejected', 'Bad'), null)
  assert.match(g.transitionProblem(admin, pending, 'approved'), /Only a super admin/)
  assert.match(g.transitionProblem({ uid: 'x', role: 'super_admin' }, pending, 'approved'), /cannot approve/)
  assert.equal(g.transitionProblem({ uid: 's', role: 'super_admin' }, pending, 'approved'), null)
})

test('C14-08 Gas navigation: overview, suppliers, supplier then direct orders, settlement, configuration', () => {
  const nav = read('src/components/layout/nav.ts')
  const gas = nav.slice(nav.indexOf("label: 'Gas'"), nav.indexOf("label: 'Finance'"))
  const hrefs = [...gas.matchAll(/href: '([^']+)'/g)].map((m) => m[1])
  assert.deepEqual(hrefs, ['/gas', '/gas-suppliers', '/gas-supplier-orders', '/gas-orders', '/gas-settlement', '/gas-configuration'])
  for (const r of ['gas', 'gas-configuration']) assert.ok(read(`src/app/${r}/page.tsx`).length > 0)
})

test('C14-09 the master switches are only read in the dashboard, never written', () => {
  for (const f of ['src/components/features/gas-suppliers/GasSwitches.tsx', 'src/app/gas/page.tsx', 'src/app/gas-configuration/page.tsx']) {
    const src = read(f)
    assert.doesNotMatch(src, /setDoc|updateDoc|deleteDoc|writeBatch|runTransaction|httpsCallable/, f)
  }
})

test('C14-10 the settlement page keeps every section, now under tabs', () => {
  const src = read('src/app/gas-settlement/page.tsx')
  for (const t of ['Daily statements', 'Driver payments', 'Ledger by order', 'Outstanding debts', 'Commission terms']) assert.ok(src.includes(`<Card title="${t}"`), t)
  for (const id of ['statements', 'ledger', 'debts', 'terms']) assert.ok(src.includes(`<TabPanel id="${id}"`), id)
})
