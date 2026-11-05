// C17: every Supplier Payouts button maps to a deployed callable with exactly
// the payload it accepts, refusals and authorisation failures read clearly,
// a second click never sends a second request, approval never claims a
// payment, and nothing else in the dashboard can start a Mobile Money
// payment. "Post entitlements" reports the driver wallet credit truthfully.
// Where the release backend is checked out beside this repo, payloads are
// checked against its readIds allowlists. Node's built-in test runner only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const w = await import('../src/lib/gas-supplier-wallet-admin.ts')
const o = await import('../src/lib/gas-supplier-ops.ts')
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
/** The deployed source (release worktree deployed on 2026-11-05; the wallet module is unchanged since 2026-11-01). */
const BACKEND = new URL('../../release-gas-settlement-20261105/functions/gas_supplier_wallet.js', import.meta.url)
const ids = { supplierId: 'sup1', withdrawalId: 'w_1' }

test('C17-01 each button calls its deployed callable with exactly its payload, trimmed', () => {
  const f = { reason: '  Wrong number given  ', paymentReference: '  BRG-123456  ' }
  assert.deepEqual(w.withdrawalCall('approve', ids, f), { name: 'adminApproveGasSupplierWithdrawal', data: { supplierId: 'sup1', withdrawalId: 'w_1' } })
  assert.deepEqual(w.withdrawalCall('reject', ids, f), { name: 'adminRejectGasSupplierWithdrawal', data: { supplierId: 'sup1', withdrawalId: 'w_1', reason: 'Wrong number given' } })
  assert.deepEqual(w.withdrawalCall('confirm_paid', ids, f), { name: 'adminConfirmGasSupplierWithdrawal', data: { supplierId: 'sup1', withdrawalId: 'w_1', outcome: 'paid', paymentReference: 'BRG-123456' } })
  assert.deepEqual(w.withdrawalCall('confirm_failed', ids, f), { name: 'adminConfirmGasSupplierWithdrawal', data: { supplierId: 'sup1', withdrawalId: 'w_1', outcome: 'failed', reason: 'Wrong number given' } })
  // Approval carries nothing an admin typed: no amount, number or reference can be injected.
  assert.deepEqual(Object.keys(w.withdrawalCall('approve', ids, { reason: 'x', paymentReference: 'y' }).data).sort(), ['supplierId', 'withdrawalId'])
})

test('C17-02 every payload fits the deployed readIds allowlist', { skip: !existsSync(BACKEND) && 'release backend not checked out' }, () => {
  const src = readFileSync(BACKEND, 'utf8')
  const allow = (fn) => {
    const body = src.slice(src.indexOf(`async function ${fn}(`))
    return JSON.parse(body.match(/readIds\(data, (\[[^\]]*\])\)/)[1])
  }
  const map = { adminApproveGasSupplierWithdrawal: 'approveWithdrawal', adminRejectGasSupplierWithdrawal: 'rejectWithdrawal', adminConfirmGasSupplierWithdrawal: 'confirmWithdrawal' }
  for (const a of ['approve', 'reject', 'confirm_paid', 'confirm_failed']) {
    const c = w.withdrawalCall(a, ids, { reason: 'Reason text', paymentReference: 'BRG-1' })
    assert.ok(src.includes(`exports.${c.name} = onCall(`), `${c.name} is exported`)
    for (const k of Object.keys(c.data)) assert.ok(allow(map[c.name]).includes(k), `${a}: ${k}`)
  }
})

test('C17-03 actions follow the stored status: pending/approved → approve or reject; processing → confirm; finished → none', () => {
  for (const status of ['pending', 'approved']) assert.deepEqual(w.withdrawalActions({ status }), ['approve', 'reject'])
  assert.deepEqual(w.withdrawalActions({ status: 'processing' }), ['confirm_paid', 'confirm_failed'])
  for (const status of ['paid', 'rejected', 'failed']) assert.deepEqual(w.withdrawalActions({ status }), [], status)
  // An unknown status reads as pending (the server's rule), never as finished.
  assert.deepEqual(w.withdrawalActions({ status: 'weird' }), ['approve', 'reject'])
})

test('C17-04 authorisation failures and refusals are shown clearly; nothing is implied to have happened', () => {
  assert.match(w.withdrawalCallError({ code: 'functions/permission-denied', message: 'Super admins only.' }), /Only an active super admin.*Nothing was changed/)
  assert.match(w.withdrawalCallError({ code: 'permission-denied' }), /Only an active super admin/)
  assert.match(w.withdrawalCallError({ code: 'functions/unauthenticated' }), /Sign in again/)
  assert.equal(w.withdrawalCallError({ code: 'functions/failed-precondition', details: { reason: 'recipient_changed' } }), w.WALLET_REFUSALS.recipient_changed)
  for (const r of ['withdrawal_paid', 'withdrawal_rejected', 'withdrawal_failed', 'withdrawal_processing', 'withdrawal_not_sent', 'gas_supplier_payouts_disabled']) {
    assert.equal(w.withdrawalCallError({ details: { reason: r } }), w.WALLET_REFUSALS[r], r)
  }
  // A reason with its own permission code still shows the specific reason.
  assert.equal(w.withdrawalCallError({ code: 'functions/permission-denied', details: { reason: 'recipient_changed' } }), w.WALLET_REFUSALS.recipient_changed)
  assert.equal(w.withdrawalCallError({ code: 'internal', message: 'Boom' }), 'Boom')
  assert.match(w.withdrawalCallError(null), /refresh before trying again/)
})

test('C17-05 a second click while a request runs sends nothing; the guard frees after success or failure', async () => {
  const g = w.createRequestGuard()
  let sent = 0
  const click = async (fail = false) => {
    if (!g.tryStart()) return 'ignored'
    try { sent++; await new Promise((r) => setTimeout(r, 5)); if (fail) throw new Error('refused'); return 'sent' } finally { g.end() }
  }
  assert.deepEqual(await Promise.all([click(), click(), click()]), ['sent', 'ignored', 'ignored'])
  assert.equal(sent, 1)
  await assert.rejects(click(true))
  assert.equal(g.running, false, 'freed after a failure')
  assert.equal(await click(), 'sent')
  assert.equal(sent, 3)
})

test('C17-06 the page guards the call, shows Working…, and reports the server result', () => {
  const page = read('src/app/(admin)/gas-supplier-payouts/page.tsx')
  const run = page.slice(page.indexOf('async function run()'), page.indexOf('// ── Reconciliation'))
  assert.ok(run.indexOf('guard.current.tryStart()') < run.indexOf('httpsCallable('), 'guard before the call')
  assert.match(run, /finally \{ guard\.current\.end\(\); setBusy\(false\); await load\(\) \}/)
  assert.match(run, /toast\.success\(withdrawalSuccessMessage\(action, r\)\)/)
  assert.match(run, /toast\.error\(withdrawalCallError\(e\)\)/)
  assert.match(page, /disabled=\{busy \|\| !!problem\} aria-busy=\{busy\} onClick=\{run\}>\{busy \? 'Working…' : ACTION_LABELS\[action\]\}/)
  // Approving and recording a payment both ask first.
  assert.match(run, /action === 'approve' && !window\.confirm/)
  assert.match(run, /action === 'confirm_paid' && !window\.confirm/)
})

test('C17-07 success messages: approval only hands the payment to Bridge; only a recorded confirmation says paid', () => {
  for (const bridgeOutcome of ['accepted', 'unknown', null, undefined]) {
    const m = w.withdrawalSuccessMessage('approve', { bridgeOutcome })
    assert.match(m, /Not paid yet/, String(bridgeOutcome))
    assert.doesNotMatch(m.replace('Not paid yet', ''), /\bpaid\b|completed successfully|received/i, String(bridgeOutcome))
  }
  assert.match(w.withdrawalSuccessMessage('approve', { bridgeOutcome: 'unknown' }), /never send it again/)
  assert.match(w.withdrawalSuccessMessage('reject', null), /Nothing was sent/)
  assert.match(w.withdrawalSuccessMessage('confirm_paid', null), /paid with Bridge's reference/)
  assert.doesNotMatch(w.withdrawalSuccessMessage('confirm_failed', null), /\bpaid\b/i)
})

test('C17-08 only Approve can start a Mobile Money payment, and no other dashboard screen can', () => {
  for (const a of ['reject', 'confirm_paid', 'confirm_failed']) assert.notEqual(w.withdrawalCall(a, ids, {}).name, 'adminApproveGasSupplierWithdrawal', a)
  const others = ['src/app/(admin)/gas-settlement/page.tsx', 'src/app/(admin)/gas-supplier-orders/page.tsx', 'src/app/(admin)/gas/page.tsx',
    'src/app/(admin)/gas-suppliers/[id]/page.tsx', 'src/lib/gas-supplier-ops.ts']
  for (const f of others) {
    assert.doesNotMatch(read(f), /GasSupplierWithdrawal|GasSupplierPayout|initiateBridgePayout|make_payment/, f)
  }
})

test('C17-09 "Post entitlements" says what happened: credited to the CTSGo wallet, already posted, or why not credited', () => {
  assert.equal(o.postEntitlementsMessage({ alreadyPosted: true }), 'Already posted. Nothing was posted or credited again.')
  const credited = o.postEntitlementsMessage({ posted: true, driverCredit: { credited: true, statementId: 'gas_driver_credit_o1', amountPesewas: 444 } })
  assert.match(credited, /GH₵4\.44\) was credited to their CTSGo wallet\. No Mobile Money was sent\./)
  assert.match(o.postEntitlementsMessage({ posted: true }), /No driver wallet credit/)
  assert.match(o.postEntitlementsMessage({ posted: true, driverCredit: { credited: false, reason: 'driver_not_found' } }), /not credited; an alert was raised/)
  assert.match(o.postEntitlementsMessage({ posted: true, driverCredit: { credited: false, amountPesewas: 0 } }), /zero, so nothing was credited/)
  assert.match(o.postEntitlementsMessage(null), /Not posted/)
  assert.match(read('src/app/(admin)/gas-supplier-orders/page.tsx'), /toast\.success\(postEntitlementsMessage\(r\)\)/)
})
