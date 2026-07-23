'use client'
import { useEffect, useRef, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { formatDate } from '@/lib/utils'
import { Users, Car, Package, Flame, RefreshCw, Circle } from 'lucide-react'

interface LiveDriver {
  uid: string
  displayName: string
  phone: string
  serviceType: string
  isOnline: boolean
  isAvailable: boolean
  currentTripId?: string
  location?: { latitude: number; longitude: number }
  lastSeen?: any
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
  createdAt?: any
}

const SERVICE_COLORS: Record<string, string> = {
  okada:    '#16a34a',
  taxi:     '#0284c7',
  delivery: '#7c3aed',
  gas:      '#d97706',
}

export default function LiveMapPage() {
  const mapRef    = useRef<HTMLDivElement>(null)
  const mapObj    = useRef<google.maps.Map | null>(null)
  const markers   = useRef<Record<string, google.maps.Marker>>({})
  const [drivers, setDrivers]       = useState<LiveDriver[]>([])
  const [activeTrips, setActiveTrips] = useState<LiveTrip[]>([])
  const [selected, setSelected]     = useState<LiveDriver | null>(null)
  const [filter, setFilter]         = useState<'all' | 'available' | 'on_trip'>('all')
  const [mapLoaded, setMapLoaded]   = useState(false)
  const [stats, setStats] = useState({ online: 0, available: 0, onTrip: 0 })

  // Load Google Maps — guarded against double-injection (StrictMode re-mounts,
  // client-side navigation back to this page).
  useEffect(() => {
    // Already fully loaded → just init.
    if (window.google?.maps) { initMap(); return }

    // Script already in the DOM (loading) → wait for it, don't add another.
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
    script.dataset.googleMaps = 'true' // marker so re-mounts detect it
    script.onload = initMap
    document.head.appendChild(script)
  }, [])

  function initMap() {
    if (!mapRef.current) return
    mapObj.current = new google.maps.Map(mapRef.current, {
      center:    { lat: 5.6037, lng: -0.1870 },
      zoom:      13,
      styles:    mapStyle,
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
    })
    setMapLoaded(true)
  }

  // Listen to online drivers
  useEffect(() => {
    const q = query(collection(db, 'drivers'), where('isOnline', '==', true))
    return onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ uid: d.id, ...d.data() })) as LiveDriver[]
      setDrivers(data)
      setStats({
        online:    data.length,
        available: data.filter(d => d.isAvailable && !d.currentTripId).length,
        onTrip:    data.filter(d => d.currentTripId).length,
      })
    })
  }, [])

  // Listen to active trips
  useEffect(() => {
    const q = query(collection(db, 'trips'), where('status', 'in', [
      'tripAccepted', 'driverArrived', 'tripStarted'
    ]))
    return onSnapshot(q, snap => {
      setActiveTrips(snap.docs.map(d => ({ id: d.id, ...d.data() })) as LiveTrip[])
    })
  }, [])

  // Update map markers
  useEffect(() => {
    if (!mapLoaded || !mapObj.current) return

    const filtered = drivers.filter(d => {
      if (filter === 'available') return d.isAvailable && !d.currentTripId
      if (filter === 'on_trip')   return !!d.currentTripId
      return true
    })

    // Remove old markers not in new list
    const currentUids = new Set(filtered.map(d => d.uid))
    Object.keys(markers.current).forEach(uid => {
      if (!currentUids.has(uid)) {
        markers.current[uid].setMap(null)
        delete markers.current[uid]
      }
    })

    // Add/update markers
    filtered.forEach(driver => {
      if (!driver.location) return
      const pos = { lat: driver.location.latitude, lng: driver.location.longitude }
      const color = SERVICE_COLORS[driver.serviceType] || '#16a34a'
      const onTrip = !!driver.currentTripId

      if (markers.current[driver.uid]) {
        markers.current[driver.uid].setPosition(pos)
      } else {
        const marker = new google.maps.Marker({
          position: pos,
          map: mapObj.current!,
          title: driver.displayName,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: onTrip ? '#f59e0b' : color,
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2,
          },
          label: {
            text: driver.serviceType[0].toUpperCase(),
            color: '#fff',
            fontSize: '10px',
            fontWeight: 'bold',
          }
        })
        marker.addListener('click', () => setSelected(driver))
        markers.current[driver.uid] = marker
      }
    })
  }, [drivers, filter, mapLoaded])

  const filtered = drivers.filter(d => {
    if (filter === 'available') return d.isAvailable && !d.currentTripId
    if (filter === 'on_trip')   return !!d.currentTripId
    return true
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: 'calc(100vh - 108px)' }}>

      {/* Header + stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>
            Live Map
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Real-time driver locations and active trips</p>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginLeft: 'auto', flexWrap: 'wrap' }}>
          {[
            { key: 'all',       label: `All (${stats.online})`,           color: '#94a3b8' },
            { key: 'available', label: `Available (${stats.available})`,   color: '#4ade80' },
            { key: 'on_trip',   label: `On Trip (${stats.onTrip})`,        color: '#f59e0b' },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key as any)} style={{
              padding: '7px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
              fontSize: '12px', fontWeight: 600,
              background: filter === f.key ? f.color : 'var(--surface-alt)',
              color: filter === f.key ? (f.key === 'all' ? 'var(--text-primary)' : '#fff') : 'var(--text-secondary)',
            }}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 300px', gap: '16px', minHeight: 0 }}>

        {/* Map */}
        <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
          {!mapLoaded && (
            <div style={{
              position: 'absolute', inset: 0, background: 'var(--surface-alt)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: '12px'
            }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: '3px solid #16a34a', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
              <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
              <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Loading map...</p>
            </div>
          )}

          {/* Legend */}
          <div style={{
            position: 'absolute', bottom: '16px', left: '16px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '10px 14px',
            display: 'flex', flexDirection: 'column', gap: '6px'
          }}>
            {Object.entries(SERVICE_COLORS).map(([type, color]) => (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 600 }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color }} />
                <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{type}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 600, borderTop: '1px solid var(--border)', paddingTop: '6px', marginTop: '2px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b' }} />
              <span style={{ color: 'var(--text-secondary)' }}>On Trip</span>
            </div>
          </div>
        </div>

        {/* Side panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'auto' }}>

          {/* Active trips */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden', flexShrink: 0 }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Active Trips ({activeTrips.length})
              </span>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4ade80', animation: 'pulse 2s infinite' }} />
              <style>{'@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }'}</style>
            </div>
            <div style={{ maxHeight: '200px', overflow: 'auto' }}>
              {activeTrips.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--text-tertiary)' }}>No active trips</div>
              ) : activeTrips.map(trip => (
                <div key={trip.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {trip.driverName || 'Driver'}
                    </span>
                    <span style={{
                      fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                      background: trip.status === 'tripStarted' ? 'rgba(22,163,74,0.12)' : 'rgba(251,191,36,0.12)',
                      color: trip.status === 'tripStarted' ? '#4ade80' : '#fbbf24'
                    }}>
                      {trip.status === 'tripStarted' ? 'In Progress' : trip.status === 'tripAccepted' ? 'Accepted' : 'Arrived'}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    → {trip.dropoffAddress}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Online drivers list */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden', flex: 1 }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Online Drivers ({filtered.length})
              </span>
            </div>
            <div style={{ overflow: 'auto', maxHeight: '340px' }}>
              {filtered.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--text-tertiary)' }}>No drivers online</div>
              ) : filtered.map(driver => (
                <div
                  key={driver.uid}
                  onClick={() => {
                    setSelected(driver)
                    if (driver.location && mapObj.current) {
                      mapObj.current.panTo({ lat: driver.location.latitude, lng: driver.location.longitude })
                      mapObj.current.setZoom(15)
                    }
                  }}
                  style={{
                    padding: '10px 14px', borderBottom: '1px solid var(--border)',
                    cursor: 'pointer', transition: 'background 0.1s',
                    background: selected?.uid === driver.uid ? 'var(--surface-alt)' : 'transparent'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                      background: driver.currentTripId ? '#f59e0b' : '#4ade80'
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
                        {driver.displayName}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', display: 'flex', gap: '6px' }}>
                        <span style={{ textTransform: 'capitalize' }}>{driver.serviceType}</span>
                        <span>·</span>
                        <span>{driver.currentTripId ? 'On trip' : 'Available'}</span>
                      </div>
                    </div>
                    <div style={{
                      fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                      background: `${SERVICE_COLORS[driver.serviceType]}20`,
                      color: SERVICE_COLORS[driver.serviceType],
                      textTransform: 'capitalize'
                    }}>
                      {driver.serviceType}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Selected driver popup */}
      {selected && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '14px', padding: '14px 20px', zIndex: 50,
          display: 'flex', alignItems: 'center', gap: '16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)', minWidth: '320px'
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>{selected.displayName}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{selected.phone} · {selected.serviceType}</div>
          </div>
          <div style={{
            padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
            background: selected.currentTripId ? 'rgba(245,158,11,0.12)' : 'rgba(22,163,74,0.12)',
            color: selected.currentTripId ? '#f59e0b' : '#4ade80'
          }}>
            {selected.currentTripId ? 'On Trip' : 'Available'}
          </div>
          <button onClick={() => setSelected(null)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-tertiary)', fontSize: '16px', lineHeight: 1
          }}>✕</button>
        </div>
      )}
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
