// C12 — The supplier page's dispatch status (src/lib/gas-dispatch-status.ts):
// derived from the backend answering, the fulfilment switch, the portal
// address, the supplier's orders switch, its readiness and commission terms.
// Never "not built" when dispatch is deployed; never "live" while anything is
// off. Uses only Node's built-in test runner. Run: npm run test:c1

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const { dispatchStatus } = await import('../src/lib/gas-dispatch-status.ts')

const ready = {
  backend: 'available', flagEnabled: true, portalUrl: 'https://portal.example', ordersEnabled: true,
  readinessOk: true, readinessMissing: [], commission: 'usable',
}
const state = (s, id) => s.lines.find((l) => l.id === id).state

test('everything on and complete: live, every line ok', () => {
  const s = dispatchStatus(ready)
  assert.equal(s.live, true)
  assert.equal(s.tone, 'ok')
  assert.match(s.headline, /^Live:/)
  assert.ok(s.lines.every((l) => l.state === 'ok'), JSON.stringify(s.lines))
})

test('deployed with the switch off: built and deployed, not routing, and says why; never "not built"', () => {
  const s = dispatchStatus({ ...ready, flagEnabled: false, ordersEnabled: false })
  assert.equal(s.live, false)
  assert.match(s.headline, /built and deployed, but is not routing orders to this supplier: supplier fulfilment is switched off, this supplier's orders are off\./)
  assert.match(s.headline, /standard Gas flow/)
  assert.doesNotMatch(s.headline, /not (yet )?built/i)
  assert.deepEqual([state(s, 'backend'), state(s, 'flag'), state(s, 'orders')], ['ok', 'off', 'off'])
})

test('each blocker alone keeps it from being live, and is named', () => {
  for (const [patch, reason] of [
    [{ flagEnabled: false }, 'supplier fulfilment is switched off'],
    [{ ordersEnabled: false }, "this supplier's orders are off"],
    [{ readinessOk: false, readinessMissing: ['supplier approved'] }, 'its configuration is incomplete'],
    [{ commission: 'missing' }, 'its configuration is incomplete'],
    [{ commission: 'own_rate_unusable' }, 'its configuration is incomplete'],
  ]) {
    const s = dispatchStatus({ ...ready, ...patch })
    assert.equal(s.live, false, JSON.stringify(patch))
    assert.ok(s.headline.includes(reason), `${JSON.stringify(patch)}: ${s.headline}`)
  }
})

test('configuration detail lists the failing checks and the commission problem', () => {
  const s = dispatchStatus({ ...ready, readinessOk: false, readinessMissing: ['new cylinder: verified, available product at a verified station'], commission: 'missing' })
  const line = s.lines.find((l) => l.id === 'configuration')
  assert.equal(line.state, 'missing')
  assert.equal(line.detail, 'Incomplete: new cylinder: verified, available product at a verified station; no approved platform commission terms')
})

test('backend not answering or still checking: never live, says the state is unknown', () => {
  const down = dispatchStatus({ ...ready, backend: 'unavailable' })
  assert.equal(down.live, false)
  assert.equal(down.tone, 'warning')
  assert.match(down.headline, /not answering/)
  assert.equal(state(down, 'integrations'), 'missing')
  const checking = dispatchStatus({ ...ready, backend: 'checking', flagEnabled: null })
  assert.equal(checking.live, false)
  assert.deepEqual([state(checking, 'backend'), state(checking, 'flag'), state(checking, 'integrations')], ['unknown', 'unknown', 'unknown'])
})

test('no portal address: the portal and integrations lines say so', () => {
  const s = dispatchStatus({ ...ready, portalUrl: null, flagEnabled: false })
  assert.deepEqual([state(s, 'portal'), state(s, 'integrations')], ['missing', 'missing'])
  assert.match(s.lines.find((l) => l.id === 'portal').detail, /NEXT_PUBLIC_SUPPLIER_PORTAL_URL/)
})

test('the supplier page shows the derived status, not the old hard-coded notice', () => {
  const page = readFileSync(fileURLToPath(new URL('../src/app/gas-suppliers/[id]/page.tsx', import.meta.url)), 'utf8')
  assert.doesNotMatch(page, /does not use suppliers yet|supplier dispatch is built and released/)
  assert.match(page, /<DispatchStatus supplierId=\{supplier\.id\} ordersEnabled=\{supplier\.ordersEnabled === true\} readiness=\{readiness\} \/>/)
})
