'use client'
import { useEffect, useState } from 'react'
import { collection, getDocs, query, where, orderBy, limit, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { StatsCard, StatusBadge, TableSkeleton } from '@/components/shared'
import { formatCurrency, timeAgo } from '@/lib/utils'
import {
  Users, UserCheck, Car, Clock, Wallet, TrendingUp} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts'

interface DashboardStats {
  totalDrivers: number
  totalPassengers: number
  pendingApprovals: number
  pendingWithdrawals: number
  todayRevenue: number
  activeTrips: number
}

interface RecentTrip {
  id: string
  pickupAddress: string
  dropoffAddress: string
  status: string
  estimatedFare: number
  driverName?: string
  createdAt: any
}

interface RecentWithdrawal {
  id: string
  userId: string
  amount: number
  method: string
  status: string
  createdAt: any
  role: string
}

const weeklyData = [
  { day: 'Mon', revenue: 1240, trips: 48 },
  { day: 'Tue', revenue: 1680, trips: 62 },
  { day: 'Wed', revenue: 1420, trips: 54 },
  { day: 'Thu', revenue: 1890, trips: 71 },
  { day: 'Fri', revenue: 2340, trips: 89 },
  { day: 'Sat', revenue: 2780, trips: 104 },
  { day: 'Sun', revenue: 1950, trips: 73 },
]

const serviceData = [
  { name: 'Okada', value: 58, color: '#16a34a' },
  { name: 'Taxi', value: 24, color: '#0284c7' },
  { name: 'Delivery', value: 13, color: '#7c3aed' },
  { name: 'Gas', value: 5, color: '#d97706' },
]

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentTrips, setRecentTrips] = useState<RecentTrip[]>([])
  const [recentWithdrawals, setRecentWithdrawals] = useState<RecentWithdrawal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [driversSnap, passengersSnap, pendingDriversSnap, withdrawalsSnap, tripsSnap, recentTripsSnap, recentWithdrawalsSnap] = await Promise.all([
          getDocs(collection(db, 'drivers')),
          getDocs(collection(db, 'users')),
          getDocs(query(collection(db, 'drivers'), where('isApproved', '==', false), where('documentsUploaded', '==', true))),
          getDocs(query(collection(db, 'withdrawals'), where('status', '==', 'pending'))),
          getDocs(query(collection(db, 'trips'), where('status', 'in', ['tripAccepted', 'driverArrived', 'tripStarted']))),
          getDocs(query(collection(db, 'trips'), orderBy('createdAt', 'desc'), limit(8))),
          getDocs(query(collection(db, 'withdrawals'), orderBy('createdAt', 'desc'), limit(6))),
        ])

        // Today revenue from completed trips today
        const todayStart = new Date(); todayStart.setHours(0,0,0,0)
        const todayTrips = await getDocs(query(
          collection(db, 'trips'),
          where('status', '==', 'completed'),
          where('completedAt', '>=', Timestamp.fromDate(todayStart))
        ))
        const todayRevenue = todayTrips.docs.reduce((sum, d) => {
          const fare = d.data().actualFare || d.data().estimatedFare || 0
          return sum + fare * 0.15 // 15% platform fee
        }, 0)

        setStats({
          totalDrivers:       driversSnap.size,
          totalPassengers:    passengersSnap.size,
          pendingApprovals:   pendingDriversSnap.size,
          pendingWithdrawals: withdrawalsSnap.size,
          todayRevenue,
          activeTrips:        tripsSnap.size,
        })

        setRecentTrips(recentTripsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as RecentTrip[])
        setRecentWithdrawals(recentWithdrawalsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as RecentWithdrawal[])
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: "'DM Sans', sans-serif" }}>

      {/* Welcome */}
      <div>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
          Platform Overview
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>
          {new Date().toLocaleDateString('en-GH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
        <StatsCard title="Total Drivers" value={stats?.totalDrivers ?? '—'}
          icon={<UserCheck size={16} />} iconColor="#4ade80" iconBg="rgba(22,163,74,0.12)"
          trend={{ value: 12, label: 'this month' }} loading={loading} />
        <StatsCard title="Total Passengers" value={stats?.totalPassengers ?? '—'}
          icon={<Users size={16} />} iconColor="#60a5fa" iconBg="rgba(2,132,199,0.12)"
          trend={{ value: 8, label: 'this month' }} loading={loading} />
        <StatsCard title="Active Trips" value={stats?.activeTrips ?? '—'}
          icon={<Car size={16} />} iconColor="#a78bfa" iconBg="rgba(124,58,237,0.12)"
          loading={loading} />
        <StatsCard title="Pending Approvals" value={stats?.pendingApprovals ?? '—'}
          icon={<Clock size={16} />} iconColor="#fbbf24" iconBg="rgba(217,119,6,0.12)"
          loading={loading} />
        <StatsCard title="Pending Payouts" value={stats?.pendingWithdrawals ?? '—'}
          icon={<Wallet size={16} />} iconColor="#f87171" iconBg="rgba(239,68,68,0.12)"
          loading={loading} />
        <StatsCard title="Today's Revenue" value={stats ? formatCurrency(stats.todayRevenue) : '—'}
          icon={<TrendingUp size={16} />} iconColor="#4ade80" iconBg="rgba(22,163,74,0.12)"
          trend={{ value: 23, label: 'vs yesterday' }} loading={loading} />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 320px', gap: '16px' }}>

        {/* Revenue chart */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px' }}>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>Weekly Revenue</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Platform fee collected (GHS)</p>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={weeklyData}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#16a34a" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={40} />
              <Tooltip
                contentStyle={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }}
                labelStyle={{ color: 'var(--text-secondary)' }}
              />
              <Area type="monotone" dataKey="revenue" stroke="#16a34a" strokeWidth={2} fill="url(#revGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Trips chart */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px' }}>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>Daily Trips</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Completed trips per day</p>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={weeklyData} barSize={24}>
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={30} />
              <Tooltip
                contentStyle={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }}
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              />
              <Bar dataKey="trips" fill="#0284c7" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Service distribution */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px' }}>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>Service Split</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>By service type</p>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie data={serviceData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3} dataKey="value">
                {serviceData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
            {serviceData.map(s => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color }} />
                <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{s.name}</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{s.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tables row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* Recent trips */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Recent Trips</h3>
            <a href="/trips" style={{ fontSize: '12px', color: '#4ade80', textDecoration: 'none' }}>View all →</a>
          </div>
          {loading ? <div style={{ padding: '16px' }}><TableSkeleton rows={5} cols={3} /></div> : (
            <div>
              {recentTrips.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>No recent trips</div>
              ) : recentTrips.map(trip => (
                <div key={trip.id} style={{ padding: '12px 20px', borderBottom: '1px solid #0f1923', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Car size={14} style={{ color: '#16a34a' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {trip.pickupAddress || '—'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{timeAgo(trip.createdAt)}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <StatusBadge status={trip.status} />
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#4ade80' }}>{formatCurrency(trip.estimatedFare)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent withdrawals */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Recent Withdrawals</h3>
            <a href="/withdrawals" style={{ fontSize: '12px', color: '#4ade80', textDecoration: 'none' }}>View all →</a>
          </div>
          {loading ? <div style={{ padding: '16px' }}><TableSkeleton rows={5} cols={3} /></div> : (
            <div>
              {recentWithdrawals.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>No recent withdrawals</div>
              ) : recentWithdrawals.map(w => (
                <div key={w.id} style={{ padding: '12px 20px', borderBottom: '1px solid #0f1923', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Wallet size={14} style={{ color: '#f87171' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {w.method} · {w.role}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{timeAgo(w.createdAt)}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <StatusBadge status={w.status} />
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#f87171' }}>{formatCurrency(w.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
