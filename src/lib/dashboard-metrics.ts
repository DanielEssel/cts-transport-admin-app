// Dashboard figures, computed only from records read from Firestore. Pure
// (no Firebase), so the tests run it directly. Nothing here estimates or
// fills in: a day with no records shows 0, and a range larger than the
// read cap is reported as capped rather than extrapolated.

export const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
] as const
export type RangeDays = (typeof RANGES)[number]['days']

/** Most records read per service and range; above it the chart says so. */
export const READ_CAP = 5000

export type Service = 'rides' | 'deliveries' | 'gas'
export interface ActivityRecord { service: Service; status: string; createdAtMs: number | null }

const DAY = 24 * 60 * 60 * 1000

/** Midnight (local) of the first day in a range ending today. */
export function rangeStart(days: number, now: number): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime() - (days - 1) * DAY
}

const dayKey = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** One row per day in the range, oldest first, with each service's count. */
export function dailyActivity(records: ActivityRecord[], days: number, now: number) {
  const start = rangeStart(days, now)
  const rows = Array.from({ length: days }, (_, i) => {
    const ms = start + i * DAY
    return { key: dayKey(ms), label: new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), rides: 0, deliveries: 0, gas: 0 }
  })
  const index = new Map(rows.map((r, i) => [r.key, i]))
  for (const r of records) {
    if (r.createdAtMs == null || r.createdAtMs < start) continue
    const i = index.get(dayKey(r.createdAtMs))
    if (i !== undefined) rows[i][r.service]++
  }
  return rows
}

const COMPLETED = new Set(['completed', 'delivered'])
const CANCELLED = /^cancel/i

/** Completed, cancelled and in-progress counts per service. */
export function outcomes(records: ActivityRecord[]) {
  const out: Record<Service, { total: number; completed: number; cancelled: number; open: number }> = {
    rides: { total: 0, completed: 0, cancelled: 0, open: 0 },
    deliveries: { total: 0, completed: 0, cancelled: 0, open: 0 },
    gas: { total: 0, completed: 0, cancelled: 0, open: 0 },
  }
  for (const r of records) {
    const o = out[r.service]
    o.total++
    if (COMPLETED.has(r.status)) o.completed++
    else if (CANCELLED.test(r.status) || r.status === 'failed') o.cancelled++
    else o.open++
  }
  return out
}

/** Count of records by a string field, most frequent first. */
export function countBy<T>(items: T[], key: (t: T) => string | undefined | null): Array<{ key: string; count: number }> {
  const m = new Map<string, number>()
  for (const t of items) {
    const k = key(t) || 'unknown'
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

/** A Firestore Timestamp, Date, millis or ISO string as millis; null if unusable. */
export function toMillis(v: unknown): number | null {
  if (v == null) return null
  const t = v as { toMillis?: () => number; seconds?: number }
  if (typeof t.toMillis === 'function') return t.toMillis()
  if (typeof t.seconds === 'number') return t.seconds * 1000
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'number') return v
  if (typeof v === 'string') { const n = Date.parse(v); return Number.isNaN(n) ? null : n }
  return null
}
