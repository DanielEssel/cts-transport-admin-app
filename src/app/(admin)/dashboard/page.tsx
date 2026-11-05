'use client'
// Platform overview. Every figure is read from Firestore through the same
// rules as the rest of the dashboard; nothing is estimated or hard-coded.
// Revenue is not shown here: a fee figure needs the recorded ledger entries
// (Ledger page), not an assumed percentage of fares.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  collection, getCountFromServer, getDocs, limit, orderBy, query, Timestamp, where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { EmptyState, ErrorState, PageHeader, Panel, StatsCard, StatusBadge, TableSkeleton } from '@/components/shared'
import { formatCurrency, timeAgo } from '@/lib/utils'
import { listSuppliers } from '@/lib/gas-supplier-data'
import { gasLoadError } from '@/lib/gas-supplier-ops'
import { isPendingDriverApproval } from '@/lib/driver-status'
import {
  READ_CAP, RANGES, countBy, dailyActivity, outcomes, rangeStart, toMillis,
  type ActivityRecord, type RangeDays, type Service,
} from '@/lib/dashboard-metrics'
import { Car, Clock, Factory, Flame, RefreshCw, Users, UserCheck, Wallet, Radio } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

/** Each total loads on its own; null where that one query failed. */
interface Counts {
  drivers: number | null; driversOnline: number | null; passengers: number | null
  activeTrips: number | null; pendingApprovals: number | null; pendingWithdrawals: number | null
}
interface RecentTrip { id: string; pickupAddress?: string; status: string; estimatedFare?: number; createdAt: unknown }
interface RecentWithdrawal { id: string; amount: number; method?: string; status: string; role?: string; createdAt: unknown }

const SERVICES: Array<{ key: Service; collection: string; label: string; color: string; href: string }> = [
  { key: 'rides', collection: 'trips', label: 'Rides', color: 'var(--chart-1)', href: '/trips' },
  { key: 'deliveries', collection: 'deliveries', label: 'Deliveries', color: 'var(--chart-2)', href: '/deliveries' },
  { key: 'gas', collection: 'gas_orders', label: 'Gas orders', color: 'var(--chart-3)', href: '/gas-orders' },
]

const count = async (q: Parameters<typeof getCountFromServer>[0]) => (await getCountFromServer(q)).data().count
const fmt = (n: number) => n.toLocaleString('en-GH')
const show = (n: number | null | undefined) => (n == null ? '—' : fmt(n))

export default function DashboardPage() {
  const [range, setRange] = useState<RangeDays>(7)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [countsError, setCountsError] = useState<string | null>(null)
  const [activity, setActivity] = useState<ActivityRecord[] | null>(null)
  const [capped, setCapped] = useState<Service[]>([])
  /** Services whose orders could not be read in this range. */
  const [failedServices, setFailedServices] = useState<Service[]>([])
  const [activityError, setActivityError] = useState<string | null>(null)
  const [suppliers, setSuppliers] = useState<Array<{ key: string; count: number }> | null>(null)
  const [suppliersError, setSuppliersError] = useState<string | null>(null)
  const [recentTrips, setRecentTrips] = useState<RecentTrip[] | null>(null)
  const [recentWithdrawals, setRecentWithdrawals] = useState<RecentWithdrawal[] | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const loadCounts = useCallback(async () => {
    setCountsError(null)
    const results = await Promise.allSettled([
      count(collection(db, 'drivers')),
      count(query(collection(db, 'drivers'), where('isOnline', '==', true))),
      count(collection(db, 'users')),
      count(query(collection(db, 'trips'), where('status', 'in', ['tripAccepted', 'driverArrived', 'tripStarted']))),
      // The Drivers page's "Pending" tab definition (lib/driver-status.ts).
      getDocs(query(collection(db, 'drivers'), where('isApproved', '==', false)))
        .then((snap) => snap.docs.filter((d) => isPendingDriverApproval(d.data())).length),
      count(query(collection(db, 'withdrawals'), where('status', '==', 'pending'))),
    ])
    const [drivers, driversOnline, passengers, activeTrips, pendingApprovals, pendingWithdrawals] =
      results.map((r) => (r.status === 'fulfilled' ? r.value : null))
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (failed.length) {
      const codes = [...new Set(failed.map((f) => f.reason?.code || f.reason?.message || String(f.reason)))]
      console.error('dashboard counts', codes)
      setCountsError(`${failed.length} of ${results.length} totals could not be loaded (${codes.join(', ')}). They show "—".`)
    }
    setCounts({ drivers, driversOnline, passengers, activeTrips, pendingApprovals, pendingWithdrawals })
  }, [])

  const loadActivity = useCallback(async (days: number) => {
    setActivity(null); setActivityError(null)
    const t = Date.now(); setNow(t)
    const since = Timestamp.fromMillis(rangeStart(days, t))
    const results = await Promise.allSettled(SERVICES.map((s) =>
      getDocs(query(collection(db, s.collection), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(READ_CAP)))))
    const records: ActivityRecord[] = []
    const hitCap: Service[] = []
    const missing: string[] = []
    const failedKeys: Service[] = []
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        missing.push(`${SERVICES[i].label} (${r.reason?.code || r.reason?.message || r.reason})`)
        failedKeys.push(SERVICES[i].key)
        return
      }
      if (r.value.size >= READ_CAP) hitCap.push(SERVICES[i].key)
      for (const d of r.value.docs) {
        const v = d.data()
        records.push({ service: SERVICES[i].key, status: String(v.status ?? ''), createdAtMs: toMillis(v.createdAt) })
      }
    })
    if (missing.length) {
      console.error('dashboard activity', missing)
      // Partial data is shown, but never as if it were complete.
      setActivityError(`Could not load ${missing.join(', ')}. Those services are missing from the chart and outcomes below.`)
    }
    setActivity(missing.length === SERVICES.length ? [] : records); setCapped(hitCap); setFailedServices(failedKeys)
  }, [])

  const loadRest = useCallback(async () => {
    setSuppliers(null); setSuppliersError(null)
    listSuppliers()
      .then((list) => setSuppliers(countBy(list, (s) => s.status)))
      .catch((e) => { setSuppliers([]); setSuppliersError(gasLoadError(e, 'gas_suppliers', 'Gas suppliers')) })
    try {
      const [t, w] = await Promise.all([
        getDocs(query(collection(db, 'trips'), orderBy('createdAt', 'desc'), limit(6))),
        getDocs(query(collection(db, 'withdrawals'), orderBy('createdAt', 'desc'), limit(6))),
      ])
      setRecentTrips(t.docs.map((d) => ({ id: d.id, ...d.data() }) as RecentTrip))
      setRecentWithdrawals(w.docs.map((d) => ({ id: d.id, ...d.data() }) as RecentWithdrawal))
    } catch (e: any) {
      console.error('dashboard recent', e?.code ?? e)
      setRecentTrips([]); setRecentWithdrawals([])
    }
  }, [])

  useEffect(() => { loadCounts(); loadRest() }, [loadCounts, loadRest])
  useEffect(() => { loadActivity(range) }, [range, loadActivity])

  const daily = useMemo(() => (activity ? dailyActivity(activity, range, now) : []), [activity, range, now])
  const result = useMemo(() => outcomes(activity ?? []), [activity])
  const refresh = () => { setCounts(null); loadCounts(); loadActivity(range); loadRest() }
  const rangeLabel = RANGES.find((r) => r.days === range)!.label

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <PageHeader
        title="Platform overview"
        description={new Date(now).toLocaleDateString('en-GH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        actions={<button className="btn btn-secondary" onClick={refresh}><RefreshCw size={14} aria-hidden /> Refresh</button>}
      />

      {countsError && <ErrorState message={countsError} onRetry={loadCounts} />}
      <div className="grid-kpi">
        <StatsCard title="Drivers" value={show(counts?.drivers)} hint={counts?.driversOnline != null ? `${fmt(counts.driversOnline)} online now` : undefined}
          icon={<UserCheck size={20} />} loading={!counts} />
        <StatsCard title="Passengers" value={show(counts?.passengers)} hint="Passenger accounts (users)"
          icon={<Users size={20} />} iconColor="var(--tone-info-fg)" iconBg="var(--tone-info-bg)" loading={!counts} />
        <StatsCard title="Active rides" value={show(counts?.activeTrips)} hint="Accepted, arrived or started"
          icon={<Radio size={20} />} iconColor="var(--tone-info-fg)" iconBg="var(--tone-info-bg)" loading={!counts} />
        <StatsCard title="Driver approvals" value={show(counts?.pendingApprovals)} hint="As on the Drivers page's Pending tab"
          icon={<Clock size={20} />} iconColor="var(--tone-warning-fg)" iconBg="var(--tone-warning-bg)" loading={!counts} />
        <StatsCard title="Pending withdrawals" value={show(counts?.pendingWithdrawals)} hint="Requests not yet processed or paid"
          icon={<Wallet size={20} />} iconColor="var(--tone-danger-fg)" iconBg="var(--tone-danger-bg)" loading={!counts} />
      </div>

      <div className="grid-main-side">
        <Panel
          title="Activity"
          subtitle={`Orders created per day, last ${rangeLabel} (Accra time)`}
          actions={
            <div className="segmented" role="group" aria-label="Date range">
              {RANGES.map((r) => (
                <button key={r.days} aria-pressed={range === r.days} onClick={() => setRange(r.days)}>{r.label}</button>
              ))}
            </div>
          }
        >
          {activityError && <div style={{ marginBottom: '12px' }}><ErrorState message={activityError} onRetry={() => loadActivity(range)} /></div>}
          {activity === null ? (
            <div className="skeleton" style={{ height: '260px' }} aria-busy="true" />
          ) : activity.length === 0 ? (
            <EmptyState icon={<Car size={22} />} title="No orders in this period" description="Rides, deliveries and Gas orders appear here as they are created." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={daily} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false}
                    interval={range > 30 ? 13 : range > 7 ? 4 : 0} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'var(--surface-alt)' }}
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '12px' }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px', color: 'var(--text-secondary)' }} />
                  {SERVICES.map((s, i) => (
                    <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.color}
                      radius={i === SERVICES.length - 1 ? [4, 4, 0, 0] : undefined} maxBarSize={36} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
              {capped.length > 0 && (
                <p style={{ fontSize: '12px', color: 'var(--tone-warning-fg)', marginTop: '8px' }}>
                  Showing the latest {fmt(READ_CAP)} {capped.map((c) => SERVICES.find((s) => s.key === c)!.label.toLowerCase()).join(' and ')} in this range; earlier days and the outcome totals may be undercounted. Use a shorter range.
                </p>
              )}
            </>
          )}
        </Panel>

        <Panel title="Outcomes" subtitle={`Orders created in the last ${rangeLabel}`}>
          {activity === null ? <div className="skeleton" style={{ height: '200px' }} /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {SERVICES.map((s) => {
                const o = result[s.key]
                if (failedServices.includes(s.key)) {
                  return <div key={s.key} style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}><strong style={{ color: 'var(--text-primary)' }}>{s.label}</strong>: not loaded</div>
                }
                const pct = (n: number) => (o.total ? Math.round((n / o.total) * 100) : 0)
                return (
                  <div key={s.key}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <Link href={s.href} style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }}>{s.label}</Link>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(o.total)}</span>
                    </div>
                    <div aria-hidden style={{ display: 'flex', height: '8px', borderRadius: '999px', overflow: 'hidden', background: 'var(--surface-alt)' }}>
                      <div style={{ width: `${pct(o.completed)}%`, background: 'var(--primary)' }} />
                      <div style={{ width: `${pct(o.open)}%`, background: 'var(--chart-2)' }} />
                      <div style={{ width: `${pct(o.cancelled)}%`, background: 'var(--danger)' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '11.5px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
                      <span>{fmt(o.completed)} completed</span><span>{fmt(o.open)} in progress</span><span>{fmt(o.cancelled)} cancelled or failed</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid-2">
        <Panel title="Gas suppliers" subtitle="Onboarding status" actions={<Link href="/gas-suppliers" className="btn btn-secondary">Manage</Link>}>
          {suppliersError ? <ErrorState message={suppliersError} /> : suppliers === null ? <div className="skeleton" style={{ height: '96px' }} /> :
            suppliers.length === 0 ? <EmptyState icon={<Factory size={22} />} title="No suppliers yet" description="Suppliers you onboard appear here." /> : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {suppliers.map((s) => (
                  <div key={s.key} style={{ flex: '1 1 140px', border: '1px solid var(--border)', borderRadius: 'var(--radius-control)', padding: '12px 14px' }}>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{s.count}</div>
                    <div style={{ marginTop: '6px' }}><StatusBadge status={s.key} /></div>
                  </div>
                ))}
              </div>
            )}
        </Panel>

        <Panel title="Gas orders" subtitle={`Direct Gas orders (not supplier orders), last ${rangeLabel}, by status`} actions={<Link href="/gas-orders" className="btn btn-secondary">View all</Link>}>
          {failedServices.includes('gas') ? <ErrorState message="Gas orders could not be loaded for this range." onRetry={() => loadActivity(range)} /> : activity === null ? <div className="skeleton" style={{ height: '96px' }} /> : (() => {
            const byStatus = countBy(activity.filter((a) => a.service === 'gas'), (a) => a.status)
            return byStatus.length === 0 ? <EmptyState icon={<Flame size={22} />} title="No Gas orders in this period" /> : (
              <table className="data-table">
                <thead><tr><th>Status</th><th style={{ textAlign: 'right' }}>Orders</th></tr></thead>
                <tbody>
                  {byStatus.map((s) => (
                    <tr key={s.key}><td><StatusBadge status={s.key} /></td><td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(s.count)}</td></tr>
                  ))}
                </tbody>
              </table>
            )
          })()}
        </Panel>
      </div>

      <div className="grid-2">
        <Panel title="Recent rides" padded={false} actions={<Link href="/trips" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-text)' }}>View all</Link>}>
          {recentTrips === null ? <div style={{ padding: '16px' }}><TableSkeleton rows={4} cols={3} /></div> : recentTrips.length === 0 ? (
            <EmptyState icon={<Car size={22} />} title="No rides yet" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Pickup</th><th>Status</th><th style={{ textAlign: 'right' }}>Fare</th><th>Created</th></tr></thead>
                <tbody>
                  {recentTrips.map((t) => (
                    <tr key={t.id}>
                      <td style={{ maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)', fontWeight: 600 }}>{t.pickupAddress || '—'}</td>
                      <td><StatusBadge status={t.status} /></td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{typeof t.estimatedFare === 'number' ? formatCurrency(t.estimatedFare) : '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{timeAgo(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Recent withdrawal requests" padded={false} actions={<Link href="/withdrawals" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-text)' }}>Review</Link>}>
          {recentWithdrawals === null ? <div style={{ padding: '16px' }}><TableSkeleton rows={4} cols={3} /></div> : recentWithdrawals.length === 0 ? (
            <EmptyState icon={<Wallet size={22} />} title="No withdrawal requests" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Method</th><th>Status</th><th style={{ textAlign: 'right' }}>Requested</th><th>Created</th></tr></thead>
                <tbody>
                  {recentWithdrawals.map((w) => (
                    <tr key={w.id}>
                      <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{w.method || '—'}{w.role ? <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}> · {w.role}</span> : null}</td>
                      <td><StatusBadge status={w.status} /></td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{typeof w.amount === 'number' ? formatCurrency(w.amount) : '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{timeAgo(w.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
        Revenue is not estimated on this page: no commission rate is assumed. Fees actually recorded are on the <Link href="/ledger" style={{ color: 'var(--accent-text)', fontWeight: 600 }}>Ledger</Link>; a withdrawal counts as paid only once its status says so.
      </p>
    </div>
  )
}
