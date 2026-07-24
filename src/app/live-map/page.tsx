'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'

interface LiveDriver {
  uid: string
  displayName: string
  phone: string
  serviceType: string
  isOnline: boolean
  isAvailable: boolean
  currentTripId?: string
  location?: { latitude: number; longitude: number }
  lastSeen?: unknown
}

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
  okada: '#16a34a',
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
  const [selected, setSelected] = useState<LiveDriver | null>(null)
  const [filter, setFilter] = useState<DriverFilter>('all')
  const [mapLoaded, setMapLoaded] = useState(false)

  const initMap = useCallback(() => {
    if (!mapRef.current || mapObj.current) return
    mapObj.current = new google.maps.Map(mapRef.current, {
      center: { lat: 5.6037, lng: -0.187 },
      zoom: 13,
      styles: mapStyle,
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
    })
    setMapLoaded(true)
  }, [])

  // Load Google Maps — guarded against double-injection (StrictMode re-mounts,
  // client-side navigation back to this page).
  useEffect(() => {
    if (window.google?.maps) {
      initMap()
      return
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-google-maps="true"]'
    )
    if (existing) {
      existing.addEventListener('load', initMap, { once: true })
      return
    }

    const key = process.env.NEXT_PUBLIC_MAPS_API_KEY ?? ''
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`
    script.async = true
    script.defer = true
    script.dataset.googleMaps = 'true'
    script.addEventListener('load', initMap, { once: true })
    document.head.appendChild(script)
  }, [initMap])

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
    })
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

  // Sync markers with the visible driver list
  useEffect(() => {
    if (!mapLoaded || !mapObj.current) return

    const currentUids = new Set(visibleDrivers.map(d => d.uid))
    Object.keys(markers.current).forEach(uid => {
      if (!currentUids.has(uid)) {
        markers.current[uid].setMap(null)
        delete markers.current[uid]
      }
    })

    visibleDrivers.forEach(driver => {
      if (!driver.location) return
      const pos = {
        lat: driver.location.latitude,
        lng: driver.location.longitude,
      }

      const existing = markers.current[driver.uid]
      if (existing) {
        existing.setPosition(pos)
        return
      }

      const onTrip = !!driver.currentTripId
      const marker = new google.maps.Marker({
        position: pos,
        map: mapObj.current!,
        title: driver.displayName,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: onTrip ? '#f59e0b' : serviceColor(driver.serviceType),
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2,
        },
        label: {
          text: serviceInitial(driver.serviceType),
          color: '#fff',
          fontSize: '10px',
          fontWeight: 'bold',
        },
      })
      marker.addListener('click', () => setSelected(driver))
      markers.current[driver.uid] = marker
    })
  }, [visibleDrivers, mapLoaded])

  const focusDriver = (driver: LiveDriver) => {
    setSelected(driver)
    if (driver.location && mapObj.current) {
      mapObj.current.panTo({
        lat: driver.location.latitude,
        lng: driver.location.longitude,
      })
      mapObj.current.setZoom(15)
    }
  }

  const filterButtons: { key: DriverFilter; label: string; color: string }[] = [
    { key: 'all', label: `All (${stats.online})`, color: FALLBACK_COLOR },
    { key: 'available', label: `Available (${stats.available})`, color: '#4ade80' },
    { key: 'on_trip', label: `On Trip (${stats.onTrip})`, color: '#f59e0b' },
  ]

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        height: 'calc(100vh - 108px)',
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
            Real-time driver locations and active trips
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

      {/* Main content */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 300px',
          gap: '16px',
          minHeight: 0,
        }}
      >
        {/* Map */}
        <div
          style={{
            position: 'relative',
            borderRadius: '16px',
            overflow: 'hidden',
            border: '1px solid var(--border)',
          }}
        >
          <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

          {!mapLoaded && (
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
                  border: '3px solid #16a34a',
                  borderTopColor: 'transparent',
                  animation: 'livemap-spin 0.8s linear infinite',
                }}
              />
              <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Loading map...</p>
            </div>
          )}

          {/* Legend */}
          <div
            style={{
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
          </div>
        </div>

        {/* Side panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'auto' }}>
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
                  background: '#4ade80',
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
                          color: trip.status === 'tripStarted' ? '#4ade80' : '#fbbf24',
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
                  No drivers online
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
                          background: driver.currentTripId ? '#f59e0b' : '#4ade80',
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
                          {driver.displayName}
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
            minWidth: '320px',
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
              {selected.displayName}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
              {selected.phone} · {selected.serviceType || 'unknown'}
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
              color: selected.currentTripId ? '#f59e0b' : '#4ade80',
            }}
          >
            {selected.currentTripId ? 'On Trip' : 'Available'}
          </div>
          <button
            onClick={() => setSelected(null)}
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