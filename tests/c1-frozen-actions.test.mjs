// C1 — Admin money freeze tests. Uses only Node's built-in test runner.
// Run: npm run test:c1

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')
const MESSAGE = 'Temporarily disabled while the audited workflow is being implemented.'

const read = (p) => readFileSync(join(ROOT, p), 'utf8')

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return sourceFiles(p)
    return /\.(ts|tsx)$/.test(name) ? [p] : []
  })
}

// Handlers allowed to contain unsafe writes, each guarded by isFrozen().
// The withdrawals page is no longer listed: it calls the audited server
// functions and may contain no direct write at all (c5 tests the workflow).
const GUARDED = {
  'src/app/passengers/page.tsx': { handleWalletAction: 'walletAdjustment' },
  'src/app/trips/page.tsx': { handleFareOverride: 'tripFareOverride' },
  'src/app/drivers/page.tsx': { handleSuspend: 'driverSuspension', handleUnsuspend: 'driverSuspension' },
}

test('the freeze module freezes the three remaining actions with the exact message', async () => {
  const m = await import('../src/lib/frozen-actions.ts')
  assert.equal(m.FROZEN_ACTION_MESSAGE, MESSAGE)
  for (const a of ['walletAdjustment', 'tripFareOverride', 'driverSuspension']) {
    assert.equal(m.isFrozen(a), true, `${a} is not frozen`)
  }
  // Withdrawal decisions moved to the server workflow; no freeze flag remains.
  assert.equal(m.isFrozen('withdrawalDecision'), false)
  assert.doesNotMatch(read('src/lib/frozen-actions.ts'), /withdrawalDecision:/)
})

test('every frozen handler returns before any write', () => {
  for (const [file, handlers] of Object.entries(GUARDED)) {
    const src = read(file)
    for (const [name, action] of Object.entries(handlers)) {
      const re = new RegExp(
        `const ${name} = async \\([^)]*\\) => \\{\\s*\\n\\s*if \\(isFrozen\\('${action}'\\)\\) \\{ toast\\.error\\(FROZEN_ACTION_MESSAGE\\); return \\}`,
      )
      assert.match(src, re, `${file}: ${name} is not guarded first`)
    }
  }
})

test('no unsafe money or approval write exists outside a guarded handler (no alternate path)', () => {
  const unsafeWrite = /\b(updateDoc|addDoc|setDoc|deleteDoc|writeBatch|runTransaction)\(/
  const unsafeTarget = /wallet|'withdrawals'|'transactions'|'trips'|'drivers'|actualFare|isApproved|signupStep/
  const offenders = []
  for (const abs of sourceFiles(SRC)) {
    const file = relative(ROOT, abs)
    const lines = readFileSync(abs, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (!unsafeWrite.test(line)) return
      // A write is unsafe if it, or the statement continuing on the next lines, targets money/approval data.
      const statement = lines.slice(i, i + 3).join(' ')
      if (!unsafeTarget.test(statement)) return
      let handler = null
      for (let j = i; j >= 0; j--) {
        const m = lines[j].match(/const (\w+) = async/)
        if (m) { handler = m[1]; break }
      }
      if (!GUARDED[file] || !GUARDED[file][handler]) offenders.push(`${file}:${i + 1} (${handler ?? 'top level'})`)
    })
  }
  assert.deepEqual(offenders, [], `unguarded writes: ${offenders.join(', ')}`)
})

test('every entry button for a frozen action is disabled with the message', () => {
  const expected = [
    ['src/app/passengers/page.tsx', 'walletAdjustment', 1],
    ['src/app/trips/page.tsx', 'tripFareOverride', 1],
    ['src/app/drivers/page.tsx', 'driverSuspension', 2],
    ['src/components/features/DriverDetailModal.tsx', 'driverSuspension', 2], // Suspend, and Unsuspend for a suspended driver
  ]
  for (const [file, action, n] of expected) {
    const src = read(file)
    const disabled = src.split(`disabled={isFrozen('${action}')}`).length - 1
    const titled = src.split(`title={isFrozen('${action}') ? FROZEN_ACTION_MESSAGE : undefined}`).length - 1
    assert.equal(disabled, n, `${file}: expected ${n} disabled buttons, found ${disabled}`)
    assert.equal(titled, n, `${file}: expected ${n} buttons titled with the message, found ${titled}`)
  }
})

test('each affected page shows the visible notice', () => {
  for (const [file, action] of [
    ['src/app/passengers/page.tsx', 'walletAdjustment'],
    ['src/app/trips/page.tsx', 'tripFareOverride'],
    ['src/app/drivers/page.tsx', 'driverSuspension'],
  ]) {
    assert.match(read(file), new RegExp(`isFrozen\\('${action}'\\) && <FrozenActionNotice`), file)
  }
  assert.match(read('src/components/features/DriverDetailModal.tsx'), /\{FROZEN_ACTION_MESSAGE\}/)
  assert.match(read('src/components/shared/FrozenActionNotice.tsx'), /FROZEN_ACTION_MESSAGE/)
})

test('out of scope: driver approve/reject still use the server callable', () => {
  const src = read('src/app/drivers/page.tsx')
  assert.equal(src.split("httpsCallable(functions, 'approveDriver')").length - 1, 2)
  assert.doesNotMatch(src, /const handleApprove = async \(\) => \{\s*\n\s*if \(isFrozen/)
})
