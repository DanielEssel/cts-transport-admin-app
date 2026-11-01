// C15: Supplier payouts, single-admin withdrawals. The six statuses and the
// actions each allows, the form checks the server makes, read-only
// reconciliation, and that the dashboard calls only the three withdrawal
// callables, never sends money itself and never writes the payout switch.
// Where the release backend or the passenger rules are checked out beside
// this repo, the copies here are checked against them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const w = await import('../src/lib/gas-supplier-wallet-admin.ts')
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
const BACKEND = new URL('../../release-ctsgo-20261030/functions/gas_supplier_wallet.js', import.meta.url)
const RULES = new URL('../../passenger/cts-transport-passenger-app-clean/firestore.rules', import.meta.url)
const backend = (() => {
  if (!existsSync(BACKEND)) return null
  try { return createRequire(import.meta.url)(BACKEND.pathname) } catch { return null }
})()

const wd = (o) => ({ id: 'w_1', supplierId: 's1', amountPesewas: 5000, status: 'pending', transactionId: 'CTS-GSW-1', ...o })

test('C15-01 six statuses, read as stored; anything else reads as pending', () => {
  assert.deepEqual([...w.WITHDRAWAL_STATUSES], ['pending', 'approved', 'processing', 'paid', 'rejected', 'failed'])
  for (const s of w.WITHDRAWAL_STATUSES) assert.equal(w.withdrawalStatus({ status: s }), s)
  for (const s of ['successful', 'unknown', undefined, 7]) assert.equal(w.withdrawalStatus({ status: s }), 'pending')
  assert.deepEqual(Object.keys(w.WITHDRAWAL_STATUS_LABELS), [...w.WITHDRAWAL_STATUSES])
})

test('C15-02 one admin does every step: approve or reject while unsent; confirm paid or failed once sent; nothing after', () => {
  assert.deepEqual(w.withdrawalActions(wd()), ['approve', 'reject'])
  assert.deepEqual(w.withdrawalActions(wd({ status: 'approved' })), ['approve', 'reject'], 'an approved request that never left CTSGo can be sent again or rejected')
  assert.deepEqual(w.withdrawalActions(wd({ status: 'processing' })), ['confirm_paid', 'confirm_failed'], 'once sent: never rejected or sent again')
  assert.deepEqual(w.withdrawalActions(wd({ status: 'processing', bridgeOutcome: 'unknown' })), ['confirm_paid', 'confirm_failed'])
  for (const status of ['paid', 'rejected', 'failed']) assert.deepEqual(w.withdrawalActions(wd({ status })), [])
})

test('C15-03 a rejection or failure needs a reason; a payment needs its reference; approval needs nothing more', () => {
  assert.equal(w.actionProblem('approve', {}), null)
  assert.match(w.actionProblem('reject', { reason: ' no ' }), /reason/)
  assert.equal(w.actionProblem('reject', { reason: 'Amount entered twice' }), null)
  assert.match(w.actionProblem('confirm_failed', {}), /reason/)
  assert.equal(w.actionProblem('confirm_failed', { reason: 'Bridge shows failed' }), null)
  assert.match(w.actionProblem('confirm_paid', { paymentReference: 'abc' }), /payment reference/)
  assert.equal(w.actionProblem('confirm_paid', { paymentReference: 'BRIDGE-12345' }), null)
})

test('C15-04 the open list shows what needs action; filters by status, supplier, business day and reference', () => {
  const rows = [wd({ id: 'a', businessDay: '2026-10-30' }), wd({ id: 'b', supplierId: 's2', businessDay: '2026-10-31', status: 'paid', transactionId: 'CTS-GSW-XY' }),
    wd({ id: 'c', businessDay: '2026-11-01', status: 'processing' }), wd({ id: 'd', businessDay: '2026-11-01', status: 'rejected' })]
  const ids = (f) => w.filterWithdrawals(rows, f).map((r) => r.id)
  assert.deepEqual(ids({ status: 'open' }), ['a', 'c'])
  assert.deepEqual(ids({ status: 'paid' }), ['b'])
  assert.deepEqual(ids({ supplierId: 's1' }), ['a', 'c', 'd'])
  assert.deepEqual(ids({ fromDay: '2026-10-31' }), ['b', 'c', 'd'])
  assert.deepEqual(ids({ toDay: '2026-10-31' }), ['a', 'b'])
  assert.deepEqual(ids({ text: 'gsw-xy' }), ['b'])
  assert.deepEqual(ids({}), ['a', 'b', 'c', 'd'])
})

test('C15-05 reconciliation flags each mismatch and repairs nothing', () => {
  const wallet = { availablePesewas: 2000, reservedPesewas: 5000, withdrawnPesewas: 3000, creditedPesewas: 10000, activeWithdrawalId: 'w_open' }
  const withdrawals = [wd({ id: 'w_open', status: 'processing' }), wd({ id: 'w_paid', status: 'paid', amountPesewas: 3000 }),
    wd({ id: 'w_rej', status: 'rejected', amountPesewas: 900 }), wd({ id: 'w_other', supplierId: 's2', status: 'paid' })]
  const statements = [{ id: 'st1', party: 'supplier', partyId: 's1', payoutStatus: 'paid', payoutMethod: 'supplier_wallet', payout: { amountPesewas: 10000 } },
    { id: 'st2', party: 'driver', partyId: 's1', payoutStatus: 'paid', payoutMethod: 'driver_wallet', payout: { amountPesewas: 999 } }]
  const ledger = [{ id: 'gas_supplier_wallet_credit_st1', amount: 100 }, { id: 'gas_supplier_withdrawal_w_paid', amount: 30 }]
  const input = { wallet, withdrawals, complete: true, statements, ledger }
  const frozen = JSON.stringify(input)
  assert.deepEqual(w.reconcileSupplier('s1', input).filter((c) => c.ok !== true).map((c) => c.id), [])
  assert.equal(JSON.stringify(input), frozen, 'inputs untouched')
  const bad = (over) => w.reconcileSupplier('s1', { ...input, ...over }).filter((c) => c.ok === false).map((c) => c.id)
  assert.deepEqual(bad({ wallet: { ...wallet, availablePesewas: 2500 } }), ['invariant'])
  assert.deepEqual(bad({ wallet: { ...wallet, availablePesewas: 2500, creditedPesewas: 10500 } }), ['credited'])
  assert.deepEqual(bad({ wallet: { ...wallet, activeWithdrawalId: null } }), ['invariant', 'one_open'])
  assert.deepEqual(bad({ withdrawals: [...withdrawals, wd({ id: 'w_two', status: 'pending', amountPesewas: 1 })] }), ['one_open', 'reserved'])
  assert.deepEqual(bad({ ledger: [ledger[0]] }), ['withdrawal_ledger'])
  assert.deepEqual(bad({ ledger: [...ledger, { id: 'gas_supplier_withdrawal_w_ghost', amount: 1 }] }), ['withdrawal_ledger'])
  assert.deepEqual(bad({ ledger: [{ id: 'gas_supplier_wallet_credit_st1', amount: 99 }, ledger[1]] }), ['credit_ledger'])
  const partial = w.reconcileSupplier('s1', { ...input, complete: false })
  assert.deepEqual(partial.filter((c) => c.ok === null).map((c) => c.id), ['reserved', 'withdrawn', 'withdrawal_ledger'], 'a partial history is not judged')
})

test('C15-06 limits read as the server reads them; anything missing shows Not set', () => {
  assert.deepEqual(w.payoutSettingsView(null), { enabled: false, limits: null })
  // Fictional test values, not approved production limits.
  const s = { enabled: false, minWithdrawalPesewas: 1000, maxWithdrawalPesewas: 200000, dailyWithdrawalLimitPesewas: 200000 }
  assert.deepEqual(w.payoutSettingsView(s), { enabled: false, limits: { minPesewas: 1000, maxPesewas: 200000, dailyPesewas: 200000 } })
  for (const bad of [{ dailyWithdrawalLimitPesewas: 100 }, { minWithdrawalPesewas: 0 }, { maxWithdrawalPesewas: 500 }, { dailyWithdrawalLimitPesewas: undefined }, { minWithdrawalPesewas: 10.5 }]) {
    assert.equal(w.payoutSettingsView({ ...s, ...bad }).limits, null, JSON.stringify(bad))
  }
  assert.equal(w.payoutSettingsView({ enabled: 'true' }).enabled, false)
  assert.equal(w.maskNumber('0240000001'), '024****001')
  assert.equal(w.maskNumber('12'), '—')
})

test('C15-07 the dashboard calls only the three withdrawal callables, sends no money itself, and writes no switch or wallet', () => {
  for (const f of ['src/app/gas-settlement/page.tsx', 'src/app/gas-supplier-payouts/page.tsx', 'src/app/gas/page.tsx', 'src/lib/gas-supplier-ops.ts']) {
    const src = read(f)
    assert.doesNotMatch(src, /adminApproveGasSupplierPayout|adminResolveGasSupplierPayout|send_mobile_money/, f)
    assert.doesNotMatch(src, /initiateBridgePayout|make_payment|supplierRequestGasWithdrawal/, f)
  }
  const payouts = read('src/app/gas-supplier-payouts/page.tsx')
  assert.doesNotMatch(payouts, /setDoc|updateDoc|deleteDoc|addDoc|writeBatch|runTransaction/)
  const calls = [...payouts.matchAll(/httpsCallable\(functions, '([^']+)'\)/g)].map((m) => m[1]).sort()
  assert.deepEqual(calls, ['adminApproveGasSupplierWithdrawal', 'adminConfirmGasSupplierWithdrawal', 'adminRejectGasSupplierWithdrawal'])
  // No second approver, independent verifier or recipient verification remains.
  assert.doesNotMatch(payouts, /GasSupplierRecipient|verifier|Resolve/)
  // Actions are offered to super admins only (the server checks again).
  assert.match(payouts, /const isSuper = admin\?\.role === 'super_admin'/)
  assert.match(payouts, /\{isSuper && withdrawalActions\(detail\)\.length > 0 && \(/)
  // Never reads the driver withdrawals collection or the passenger wallets.
  assert.doesNotMatch(payouts, /collection\(db, 'withdrawals'\)|collection\(db, 'wallets'\)|collectionGroup/)
})

test('C15-08 audit queries filter on exactly the actions the rules let admins read', { skip: !existsSync(RULES) && 'passenger rules not checked out' }, () => {
  const rules = readFileSync(RULES, 'utf8')
  const body = rules.slice(rules.indexOf('function gasWalletAuditActions()'), rules.indexOf(']', rules.indexOf('function gasWalletAuditActions()')))
  const inRules = [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
  assert.deepEqual([...w.WALLET_AUDIT_ACTIONS].sort(), inRules.sort())
  const page = read('src/app/gas-supplier-payouts/page.tsx')
  const reads = [...page.matchAll(/collection\(db, 'audit_log'\)[\s\S]{0,200}?\)\)\)/g)]
  assert.equal(reads.length, 1)
  for (const m of reads) assert.match(m[0], /where\('action', 'in'/, 'every audit read filters on the action')
})

test('C15-09 the copies agree with the release wallet module', { skip: !backend?.walletProblem && 'release backend not checked out' }, () => {
  assert.deepEqual([...w.WITHDRAWAL_STATUSES], backend.STATUSES)
  for (const status of [...backend.STATUSES, 'successful', undefined, null, 7]) assert.equal(w.withdrawalStatus({ status }), backend.withdrawalStatus({ status }), String(status))
  const ok = { availablePesewas: 10, reservedPesewas: 5, withdrawnPesewas: 5, creditedPesewas: 20, activeWithdrawalId: 'w' }
  for (const x of [null, {}, ok, { ...ok, activeWithdrawalId: null }, { ...ok, reservedPesewas: 0, availablePesewas: 15 }, { ...ok, creditedPesewas: 21 }, { ...ok, availablePesewas: -1 }, { ...ok, withdrawnPesewas: '5' }]) {
    assert.equal(w.walletProblem(x), backend.walletProblem(x), JSON.stringify(x))
  }
  const src = readFileSync(BACKEND, 'utf8')
  for (const type of Object.keys(w.WALLET_ALERT_LABELS)) assert.ok(src.includes(`"${type}"`), type)
  // Every payout-number change is alerted, and shown on the Alerts tab.
  assert.ok(w.WALLET_ALERT_LABELS.gas_supplier_payout_number_changed)
  // A refusal is a literal reason, or "withdrawal_<status>" built from the status.
  for (const reason of Object.keys(w.WALLET_REFUSALS)) {
    const fromStatus = reason.startsWith('withdrawal_') && backend.STATUSES.includes(reason.slice('withdrawal_'.length))
    assert.ok(src.includes(`"${reason}"`) || fromStatus, reason)
  }
  // Audit actions written literally, or as gas_supplier_withdrawal_<paid|failed> and _<not_sent|bridge_accepted|bridge_unknown>.
  const built = ['paid', 'failed', 'not_sent', 'bridge_accepted', 'bridge_unknown'].map((s) => `gas_supplier_withdrawal_${s}`)
  for (const action of w.WALLET_AUDIT_ACTIONS) assert.ok(src.includes(`"${action}"`) || built.includes(action), action)
  assert.equal(w.MIN_TEXT, 6)
})
