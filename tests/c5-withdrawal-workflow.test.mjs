// C5 — Withdrawal results are recorded only through the deployed server
// function resolveUnconfirmedPayout. Uses only Node's built-in test runner.
// Run: npm run test:c1

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const page = readFileSync(fileURLToPath(new URL('../src/app/withdrawals/page.tsx', import.meta.url)), 'utf8')
const SRC = fileURLToPath(new URL('../src', import.meta.url))
const sources = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n)
  return statSync(p).isDirectory() ? sources(p) : /\.(ts|tsx)$/.test(n) ? [p] : []
})
const { canResolvePayout, payoutStateLabel, MIN_EVIDENCE_LENGTH, STALE_SENDING_MS } =
  await import('../src/lib/withdrawal-actions.ts')

const w = (o) => ({ id: 'w1', userId: 'u', role: 'driver', amount: 50, currency: 'GHS', method: 'mobile_money', status: 'pending', ...o })

test('the page calls only resolveUnconfirmedPayout, with the deployed contract', () => {
  const called = [...page.matchAll(/httpsCallable\(functions, '([A-Za-z]+)'\)/g)].map((m) => m[1])
  assert.deepEqual(called, ['resolveUnconfirmedPayout'])
  // { withdrawalId, outcome: "paid" | "failed", evidence } (deployed bridge.js)
  assert.match(page, /withdrawalId, outcome: resolveOutcome, evidence: evidence\.trim\(\)/)
  assert.match(page, /useState<'paid' \| 'failed'>/)
})

test('no admin code calls the undeployed approve / reject functions', () => {
  for (const file of sources(SRC)) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /\b(approveWithdrawal|rejectWithdrawal)\b/, file)
  }
})

test('a pending request offers no action (nothing here sends money)', () => {
  assert.doesNotMatch(page, /setActionType\('(approve|reject)'\)/)
  assert.doesNotMatch(page, /Approve|Reject withdrawal/)
  assert.match(page, /w\.status === 'pending' && \(/)
  assert.match(page, /No action/)
})

test('the page writes nothing directly (no Firestore write API at all)', () => {
  assert.doesNotMatch(page, /\b(updateDoc|addDoc|setDoc|deleteDoc|writeBatch|runTransaction)\b/)
})

test('there is no "mark paid" shortcut and no freeze flag', () => {
  assert.doesNotMatch(page, /Mark (as )?Paid/i)
  assert.doesNotMatch(page, /isFrozen|withdrawalDecision|FrozenActionNotice/)
})

test('resolving requires evidence of the minimum length the server requires', () => {
  assert.equal(MIN_EVIDENCE_LENGTH, 6)
  assert.match(page, /evidence\.trim\(\)\.length < MIN_EVIDENCE_LENGTH/)
  assert.match(page, /outcome: resolveOutcome, evidence: evidence\.trim\(\)/)
})

test('resolution is offered only where the server accepts it', () => {
  const now = 1_000_000_000_000
  assert.equal(canResolvePayout(w({ status: 'pending' }), now), false)
  assert.equal(canResolvePayout(w({ status: 'processing', payoutOutcome: 'sent' }), now), true)
  assert.equal(canResolvePayout(w({ status: 'processing', payoutOutcome: 'unknown' }), now), true)
  assert.equal(canResolvePayout(w({ status: 'processing', payoutOutcome: 'sending',
    sendingStartedAt: { toMillis: () => now - 60_000 } }), now), false, 'a send in progress')
  assert.equal(canResolvePayout(w({ status: 'processing', payoutOutcome: 'sending',
    sendingStartedAt: { seconds: (now - STALE_SENDING_MS - 1000) / 1000 } }), now), true, 'an abandoned send')
  assert.equal(canResolvePayout(w({ status: 'processing', payoutOutcome: 'sending' }), now), false, 'no start time')
  for (const status of ['completed', 'failed', 'rejected', 'pending']) {
    assert.equal(canResolvePayout(w({ status, payoutOutcome: 'sent' }), now), false, status)
  }
  assert.equal(canResolvePayout(w({ status: 'processing' }), now), false, 'no outcome recorded')
  assert.equal(canResolvePayout(w({ status: 'processing', payoutOutcome: 'other' }), now), false, 'unknown outcome value')
})

test('processing payouts are labelled by their outcome', () => {
  assert.equal(payoutStateLabel(w({ status: 'pending' })), null)
  assert.match(payoutStateLabel(w({ status: 'processing', payoutOutcome: 'unknown' })), /unknown/i)
  assert.match(payoutStateLabel(w({ status: 'processing', payoutOutcome: 'sent' })), /confirm/i)
})
