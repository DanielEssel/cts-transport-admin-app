// C9: dashboard figures come only from the records read; no estimates.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const m = await import('../src/lib/dashboard-metrics.ts')
// Accra time is UTC; the results must not depend on the machine's zone.
const NOW = Date.UTC(2026, 9, 29, 15, 0)
const at = (d, h = 10) => Date.UTC(2026, 9, d, h)

test('C9-01 one row per day, oldest first, zeros where nothing happened', () => {
  const rows = m.dailyActivity([
    { service: 'rides', status: 'completed', createdAtMs: at(29) },
    { service: 'rides', status: 'cancelled', createdAtMs: at(29, 0) },
    { service: 'gas', status: 'delivered', createdAtMs: at(23) },
    { service: 'deliveries', status: 'pending', createdAtMs: at(22, 23) }, // before a 7-day range
    { service: 'rides', status: 'completed', createdAtMs: null },
  ], 7, NOW)
  assert.equal(rows.length, 7)
  assert.equal(rows[0].key, '2026-10-23')
  assert.deepEqual([rows[0].gas, rows[6].rides, rows[6].deliveries], [1, 2, 0])
  assert.equal(rows.reduce((s, r) => s + r.rides + r.deliveries + r.gas, 0), 3)
})

test('C9-02 outcomes split completed, cancelled (any cancel status, failed) and open', () => {
  const o = m.outcomes([
    { service: 'rides', status: 'completed' }, { service: 'rides', status: 'cancelledByDriver' },
    { service: 'rides', status: 'tripStarted' }, { service: 'gas', status: 'delivered' }, { service: 'gas', status: 'failed' },
  ])
  assert.deepEqual(o.rides, { total: 3, completed: 1, cancelled: 1, open: 1 })
  assert.deepEqual(o.gas, { total: 2, completed: 1, cancelled: 1, open: 0 })
  assert.deepEqual(o.deliveries, { total: 0, completed: 0, cancelled: 0, open: 0 })
})

test('C9-03 counting and timestamps', () => {
  assert.deepEqual(m.countBy([{ s: 'approved' }, { s: 'draft' }, { s: 'approved' }, {}], (x) => x.s),
    [{ key: 'approved', count: 2 }, { key: 'draft', count: 1 }, { key: 'unknown', count: 1 }])
  assert.equal(m.toMillis({ toMillis: () => 5 }), 5)
  assert.equal(m.toMillis({ seconds: 2 }), 2000)
  assert.equal(m.toMillis('nope'), null)
  assert.equal(m.rangeStart(1, NOW), Date.UTC(2026, 9, 29))
})

test('C9-04 days are Accra days, and records from the future are not counted', () => {
  // 23:30 UTC on the 28th is still the 28th in Accra, whatever the viewer's zone.
  const rows = m.dailyActivity([
    { service: 'rides', status: 'completed', createdAtMs: Date.UTC(2026, 9, 28, 23, 30) },
    { service: 'rides', status: 'completed', createdAtMs: Date.UTC(2026, 9, 29, 0, 0) },
    { service: 'gas', status: 'pending', createdAtMs: NOW + 60 * 60 * 1000 },
  ], 2, NOW)
  assert.deepEqual(rows.map((r) => [r.key, r.rides, r.gas]), [['2026-10-28', 1, 0], ['2026-10-29', 1, 0]])
})
