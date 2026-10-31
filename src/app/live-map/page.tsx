'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { MAPS_FAILURE_MESSAGE, MapsLoadError, loadGoogleMaps, onMapsAuthFailure, type MapsFailure } from '@/lib/google-maps'
import { freshnessLabel, locationFreshness, toLatLng } from '@/lib/live-map'

interface LiveDriver {
  uid: string
  displayName: string
  phone: string
  serviceType: string
  isOnline: boolean
  isAvailable: boolean
  currentTripId?: string
  fullName?: string
  location?: unknown
  lastSeen?: unknown
  lastLocationUpdate?: unknown
}

const driverName = (d: LiveDriver) => d.displayName || d.fullName || 'Driver'

interface LiveTrip {
  id: string
  passengerId: string
  driverId?: string
  passengerName?: string
  driverName?: string
  status: string
  serviceType: string
  pickupAddress: string
  dropoffAddress: string
  estimatedFare: number
  createdAt?: unknown
}

type DriverFilter = 'all' | 'available' | 'on_trip'

const SERVICE_COLORS: Record<string, string> = {
  okada: '#15803d', // literal: used as a map-marker fill and with an alpha suffix
  taxi: '#0284c7',
  delivery: '#7c3aed',
  gas: '#d97706',
}

const FALLBACK_COLOR = '#94a3b8'

/** Service colour that never returns undefined — unknown/missing types get a neutral grey. */
const serviceColor = (type?: string) =>
  (type && SERVICE_COLORS[type]) || FALLBACK_COLOR

/** First letter for the marker label, safe against missing/empty serviceType. */
const serviceInitial = (type?: string) => (type?.[0] ?? '?').toUpperCase()

const ACTIVE_TRIP_STATUSES = ['tripAccepted', 'driverArrived', 'tripStarted']

const TRIP_STATUS_LABEL: Record<string, string> = {
  tripStarted: 'In Progress',
  tripAccepted: 'Accepted',
  driverArrived: 'Arrived',
}

export default function LiveMapPage() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapObj = useRef<google.maps.Map | null>(null)
  const markers = useRef<Record<string, google.maps.Marker>>({})

  const [drivers, setDrivers] = useState<LiveDriver[]>([])
  const [activeTrips, setActiveTrips] = useState<LiveTrip[]>([])
  const [selectedUid, setSelectedUid] = useState<string | null>(null)
  const [filter, setFilter] = useState<DriverFilter>('all')
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapError, setMapError] = useState<MapsFailure | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [dataError, setDataError] = useState<string | null>(null)
  const [driversLoaded, setDriversLoaded] = useState(false)
  // Re-evaluated every 30 s so "live" turns into "last known" without new data.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(t)
  }, [])

  // Load Google Maps through the shared loader, then create the map once the
  // container exists. Every failure becomes an error state (never a spinner).
  useEffect(() => {
    let cancelled = false
    setMapError(null)
    const offAuth = onMapsAuthFailure(() => { if (!cancelled) setMapError('auth_failed') })
    loadGoogleMaps()
      .then(maps => {
        if (cancelled || !mapRef.current || mapObj.current) return
        mapObj.current = new maps.Map(mapRef.current, {
          center: { lat: 5.6037, lng: -0.187 },
          zoom: 13,
          styles: document.documentElement.classList.contains('dark') ? mapStyleDark : mapStyle,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        })
        setMapLoaded(true)
      })
      .catch(e => { if (!cancelled) setMapError(e instanceof MapsLoadError ? e.reason : 'load_failed') })
    return () => { cancelled = true; offAuth() }
  }, [loadAttempt])

  // Follow the admin's light/dark theme.
  useEffect(() => {
    if (!mapLoaded) return
    const html = document.documentElement
    const apply = () => mapObj.current?.setOptions({ styles: html.classList.contains('dark') ? mapStyleDark : mapStyle })
    const obs = new MutationObserver(apply)
    obs.observe(html, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [mapLoaded])

  // Drop every marker when the page unmounts, so navigating away doesn't leak
  // map objects still bound to a destroyed map instance.
  useEffect(() => {
    const active = markers.current
    return () => {
      Object.values(active).forEach(m => m.setMap(null))
      markers.current = {}
      mapObj.current = null
    }
  }, [])

  // Online drivers
  useEffect(() => {
    const q = query(collection(db, 'drivers'), where('isOnline', '==', true))
    return onSnapshot(q, snap => {
      setDrivers(
        snap.docs.map(d => ({ uid: d.id, ...d.data() })) as LiveDriver[]
      )
      setDriversLoaded(true)
      setDataError(null)
    }, e => {
      setDriversLoaded(true)
      setDataError(`Could not load driver locations (${e.code || e.message}).`)
    })
  }, [])

  // Active trips
  useEffect(() => {
    const q = query(
      collection(db, 'trips'),
      where('status', 'in', ACTIVE_TRIP_STATUSES)
    )
    return onSnapshot(q, snap => {
      setActiveTrips(
        snap.docs.map(d => ({ id: d.id, ...d.data() })) as LiveTrip[]
      )
    }, e => setDataError(`Could not load active trips (${e.code || e.message}).`))
  }, [])

  // Derived from the live driver list — the map, the list and the counts can
  // never disagree because they all read these.
  const stats = useMemo(
    () => ({
      online: drivers.length,
      available: drivers.filter(d => d.isAvailable && !d.currentTripId).length,
      onTrip: drivers.filter(d => d.currentTripId).length,
    }),
    [drivers]
  )

  const visibleDrivers = useMemo(
    () =>
      drivers.filter(d => {
        if (filter === 'available') return d.isAvailable && !d.currentTripId
        if (filter === 'on_trip') return !!d.currentTripId
        return true
      }),
    [drivers, filter]
  )

  const selected = useMemo(() => drivers.find(d => d.uid === selectedUid) ?? null, [drivers, selectedUid])
  const unplaced = useMemo(() => visibleDrivers.filter(d => !toLatLng(d.location)).length, [visibleDrivers])

  // Sync markers with the visible drivers: one marker per driver, placed only
  // at a valid position, its colour and freshness updated in place.
  useEffect(() => {
    if (!mapLoaded || !mapObj.current) return
    const map = mapObj.current
    const placed = new Map(visibleDrivers.flatMap(d => {
      const pos = toLatLng(d.location)
      return pos ? [[d.uid, { d, pos }] as const] : []
    }))
    Object.keys(markers.current).forEach(uid => {
      if (!placed.has(uid)) {
        markers.current[uid].setMap(null)
        delete markers.current[uid]
      }
    })
    placed.forEach(({ d, pos }, uid) => {
      const fresh = locationFreshness(d, now)
      const live = fresh.state === 'live'
      const icon: google.maps.Symbol = {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: d.currentTripId ? '#f59e0b' : serviceColor(d.serviceType),
        // A last-known position is drawn faded, so it is never read as live.
        fillOpacity: live ? 1 : 0.35,
        strokeColor: live ? '#fff' : '#374151',
        strokeWeight: 2,
      }
      const title = `${driverName(d)} · ${freshnessLabel(fresh)}`
      const existing = markers.current[uid]
      if (existing) {
        existing.setPosition(pos)
        existing.setIcon(icon)
        existing.setTitle(title)
        return
      }
      const marker = new google.maps.Marker({
        position: pos, map, title, icon,
        label: { text: serviceInitial(d.serviceType), color: '#fff', fontSize: '10px', fontWeight: 'bold' },
      })
      marker.addListener('click', () => setSelectedUid(uid))
      markers.current[uid] = marker
    })
  }, [visibleDrivers, mapLoaded, now])

  const focusDriver = (driver: LiveDriver) => {
    setSelectedUid(driver.uid)
    const pos = toLatLng(driver.location)
    if (pos && mapObj.current) {
      mapObj.current.panTo(pos)
      mapObj.current.setZoom(15)
    }
  }

  const filterButtons: { key: DriverFilter; label: string; color: string }[] = [
    { key: 'all', label: `All (${stats.online})`, color: FALLBACK_COLOR },
    { key: 'available', label: `Available (${stats.available})`, color: 'var(--accent-text)' },
    { key: 'on_trip', label: `On Trip (${stats.onTrip})`, color: '#f59e0b' },
  ]

  return (
    <div
      className="livemap-page"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        // The shell's top bar (64px) and page padding (48px), and the emulator strip when shown.
        height: 'calc(100vh - 112px - var(--banner-h, 0px))',
        minHeight: '520px',
      }}
    >
      {/* Header + filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: '22px',
              fontWeight: 800,
              color: 'var(--text-primary)',
            }}
          >
            Live Map
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
            Online drivers at their last reported position (live if reported in the last 2 minutes) and active trips
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginLeft: 'auto', flexWrap: 'wrap' }}>
          {filterButtons.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '7px 14px',
                borderRadius: '20px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
                background: filter === f.key ? f.color : 'var(--surface-alt)',
                color:
                  filter === f.key
                    ? f.key === 'all'
                      ? 'var(--text-primary)'
                      : '#fff'
                    : 'var(--text-secondary)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {dataError && (
        <div role="alert" style={{ background: 'var(--tone-danger-bg)', color: 'var(--tone-danger-fg)', borderRadius: '10px', padding: '10px 14px', fontSize: '13px' }}>
          {dataError}
        </div>
      )}

      {/* Main content: map beside the lists from 1024px, stacked below */}
      <div className="livemap-grid">
        {/* Map */}
        <div
          className="livemap-map"
          style={{
            position: 'relative',
            borderRadius: '16px',
            overflow: 'hidden',
            border: '1px solid var(--border)',
            background: 'var(--surface-alt)',
          }}
        >
          <div ref={mapRef} data-testid="live-map-canvas" style={{ position: 'absolute', inset: 0 }} />

          {mapError && (
            <div
              role="alert"
              data-testid="live-map-error"
              style={{
                position: 'absolute', inset: 0, zIndex: 2, background: 'var(--surface)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
              }}
            >
              <div style={{ maxWidth: '420px', textAlign: 'center' }}>
                <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>The map could not be shown</p>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '14px' }}>{MAPS_FAILURE_MESSAGE[mapError]}</p>
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '14px' }}>Driver and trip lists on this page still update.</p>
                {mapError !== 'missing_key' && mapError !== 'auth_failed' && (
                  <button className="btn btn-secondary" onClick={() => setLoadAttempt(a => a + 1)}>Retry</button>
                )}
              </div>
            </div>
          )}

          {!mapLoaded && !mapError && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'var(--surface-alt)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  border: '3px solid var(--primary-dark)',
                  borderTopColor: 'transparent',
                  animation: 'livemap-spin 0.8s linear infinite',
                }}
              />
              <p role="status" style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Loading map…</p>
            </div>
          )}

          {/* Legend */}
          <div
            style={{
              zIndex: 1,
              position: 'absolute',
              bottom: '16px',
              left: '16px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '10px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            {Object.entries(SERVICE_COLORS).map(([type, color]) => (
              <div
                key={type}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '11px',
                  fontWeight: 600,
                }}
              >
                <div
                  style={{ width: '10px', height: '10px', borderRadius: '50%', background: color }}
                />
                <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                  {type}
                </span>
              </div>
            ))}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '11px',
                fontWeight: 600,
                borderTop: '1px solid var(--border)',
                paddingTop: '6px',
                marginTop: '2px',
              }}
            >
              <div
                style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b' }}
              />
              <span style={{ color: 'var(--text-secondary)' }}>On Trip</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 600 }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'rgba(148,163,184,0.35)', border: '2px solid #374151' }} />
              <span style={{ color: 'var(--text-secondary)' }}>Last known (not live)</span>
            </div>
            {unplaced > 0 && (
              <div data-testid="live-map-unplaced" style={{ fontSize: '11px', color: 'var(--text-tertiary)', borderTop: '1px solid var(--border)', paddingTop: '6px' }}>
                {unplaced} online {unplaced === 1 ? 'driver has' : 'drivers have'} no valid position
              </div>
            )}
          </div>
        </div>

        {/* Side panel */}
        <div className="livemap-side" style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'auto' }}>
          {/* Active trips */}
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '14px',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                padding: '12px 14px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Active Trips ({activeTrips.length})
              </span>
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: 'var(--accent-text)',
                  animation: 'livemap-pulse 2s infinite',
                }}
              />
            </div>

            <div style={{ maxHeight: '200px', overflow: 'auto' }}>
              {activeTrips.length === 0 ? (
                <div
                  style={{
                    padding: '20px',
                    textAlign: 'center',
                    fontSize: '12px',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  No active trips
                </div>
              ) : (
                activeTrips.map(trip => (
                  <div
                    key={trip.id}
                    style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '4px',
                      }}
                    >
                      <span
                        style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}
                      >
                        {trip.driverName || 'Driver'}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background:
                            trip.status === 'tripStarted'
                              ? 'rgba(22,163,74,0.12)'
                              : 'rgba(251,191,36,0.12)',
                          color: trip.status === 'tripStarted' ? 'var(--accent-text)' : 'var(--tone-warning-fg)',
                        }}
                      >
                        {TRIP_STATUS_LABEL[trip.status] ?? trip.status}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-tertiary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      → {trip.dropoffAddress}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Online drivers */}
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '14px',
              overflow: 'hidden',
              flex: 1,
            }}
          >
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Online Drivers ({visibleDrivers.length})
              </span>
            </div>

            <div style={{ overflow: 'auto', maxHeight: '340px' }}>
              {visibleDrivers.length === 0 ? (
                <div
                  style={{
                    padding: '20px',
                    textAlign: 'center',
                    fontSize: '12px',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  {!driversLoaded ? 'Loading drivers…' : drivers.length === 0 ? 'No drivers online' : 'No drivers match this filter'}
                </div>
              ) : (
                visibleDrivers.map(driver => (
                  <div
                    key={driver.uid}
                    onClick={() => focusDriver(driver)}
                    style={{
                      padding: '10px 14px',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                      background:
                        selected?.uid === driver.uid ? 'var(--surface-alt)' : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          flexShrink: 0,
                          background: driver.currentTripId ? '#f59e0b' : 'var(--accent-text)',
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            marginBottom: '2px',
                          }}
                        >
                          {driverName(driver)}
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'var(--text-tertiary)',
                            display: 'flex',
                            gap: '6px',
                          }}
                        >
                          <span style={{ textTransform: 'capitalize' }}>
                            {driver.serviceType || 'unknown'}
                          </span>
                          <span>·</span>
                          <span>{driver.currentTripId ? 'On trip' : 'Available'}</span>
                          <span>·</span>
                          <span style={{ color: !toLatLng(driver.location) ? 'var(--tone-danger-fg)' : locationFreshness(driver, now).state === 'live' ? 'var(--accent-text)' : 'var(--tone-warning-fg)' }}>
                            {!toLatLng(driver.location) ? 'No position' : freshnessLabel(locationFreshness(driver, now))}
                          </span>
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: `${serviceColor(driver.serviceType)}20`,
                          color: serviceColor(driver.serviceType),
                          textTransform: 'capitalize',
                        }}
                      >
                        {driver.serviceType || 'unknown'}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Selected driver popup */}
      {selected && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '14px',
            padding: '14px 20px',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            width: 'min(420px, calc(100vw - 32px))',
          }}
        >
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: '14px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: '2px',
              }}
            >
              {driverName(selected)}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
              {[selected.phone, selected.serviceType || 'unknown'].filter(Boolean).join(' · ')}
              <br />
              {toLatLng(selected.location) ? freshnessLabel(locationFreshness(selected, now)) : 'No valid position reported'}
            </div>
          </div>
          <div
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              background: selected.currentTripId
                ? 'rgba(245,158,11,0.12)'
                : 'rgba(22,163,74,0.12)',
              color: selected.currentTripId ? '#f59e0b' : 'var(--accent-text)',
            }}
          >
            {selected.currentTripId ? 'On Trip' : 'Available'}
          </div>
          <button
            onClick={() => setSelectedUid(null)}
            aria-label="Close driver details"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-tertiary)',
              fontSize: '16px',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Keyframes kept out of the flex containers so they never count as layout children */}
      <style>{`
        .livemap-grid { flex: 1; min-height: 0; display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr) 300px; }
        .livemap-map { min-height: 320px; }
        @media (max-width: 1023px) {
          .livemap-grid { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(360px, 60vh) auto; }
          .livemap-side { overflow: visible !important; }
          .livemap-page { height: auto !important; }
        }
        @keyframes livemap-spin { to { transform: rotate(360deg); } }
        @keyframes livemap-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
      `}</style>
    </div>
  )
}

const mapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#d8f0e4' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e8f5e9' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#b3d9f2' }] },
]
// Dark theme: the same structure on the admin's dark surfaces.
const mapStyleDark = [
  { elementType: 'geometry', stylers: [{ color: '#19241f' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#b6c3bb' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0b1210' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1c2822' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1f3a2b' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#26332c' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2f4237' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e2a3a' }] },
]
