// C9: dashboard figures come only from the records read; no estimates.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const m = await import('../src/lib/dashboard-metrics.ts')
const NOW = new Date(2026, 9, 29, 15, 0).getTime()
const at = (d, h = 10) => new Date(2026, 9, d, h).getTime()

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
  assert.equal(m.rangeStart(1, NOW), new Date(2026, 9, 29).getTime())
})
