// Location data for the Live Map, from drivers/{uid} as the Driver App writes
// it (location / currentLocation: GeoPoint; lastLocationUpdate / lastSeen:
// server timestamps, written at most every 30 s while online). Pure, for
// tests. Nothing here invents a position: a missing or invalid one is null.

export interface LatLng { lat: number; lng: number }

/** A Firestore GeoPoint, {latitude, longitude} or {lat, lng} as a valid position; null otherwise. */
export function toLatLng(v: unknown): LatLng | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const lat = typeof o.latitude === 'number' ? o.latitude : o.lat
  const lng = typeof o.longitude === 'number' ? o.longitude : o.lng
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  // 0,0 is what an unset device location reports; no CTSGo driver is there.
  if (lat === 0 && lng === 0) return null
  return { lat, lng }
}

/** A position older than this is shown as last known, not live. */
export const LIVE_WINDOW_MS = 2 * 60 * 1000

export type Freshness = { state: 'live' | 'stale'; ageMs: number } | { state: 'unknown' }

const millis = (v: unknown): number | null => {
  if (v == null) return null
  const t = v as { toMillis?: () => number; seconds?: number }
  if (typeof t.toMillis === 'function') return t.toMillis()
  if (typeof t.seconds === 'number') return t.seconds * 1000
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'number') return v
  return null
}

/** How recent a driver's position is, from lastLocationUpdate (else lastSeen). */
export function locationFreshness(d: { lastLocationUpdate?: unknown; lastSeen?: unknown }, now: number): Freshness {
  const at = millis(d.lastLocationUpdate) ?? millis(d.lastSeen)
  if (at == null) return { state: 'unknown' }
  const ageMs = Math.max(0, now - at)
  return { state: ageMs <= LIVE_WINDOW_MS ? 'live' : 'stale', ageMs }
}

export function freshnessLabel(f: Freshness): string {
  if (f.state === 'unknown') return 'Last known position (time unknown)'
  if (f.state === 'live') return 'Live'
  const m = Math.round(f.ageMs / 60000)
  return m < 60 ? `Last known ${m} min ago` : `Last known ${Math.round(m / 60)} h ago`
}

// Vehicle marker images, the same ones the Passenger App draws (copied from
// its assets/markers/2.0x into public/markers), keyed as its MarkerService
// keys them. An unknown service type gets no image rather than a wrong vehicle.
export type VehicleMarker = 'motorbike' | 'taxi' | 'tricycle' | 'minitruck'

export function vehicleMarker(serviceType: unknown): VehicleMarker | null {
  switch (typeof serviceType === 'string' ? serviceType.toLowerCase().trim() : '') {
    case 'okada': case 'motorbike': case 'motorcycle': case 'delivery': case 'gas':
      return 'motorbike'
    case 'taxi':
      return 'taxi'
    case 'aboboya': case 'aboboyaa': case 'tricycle': case 'pragya': case 'pragyia': case 'pragia':
      return 'tricycle'
    case 'minitruck': case 'mini_truck': case 'mini truck':
      return 'minitruck'
    default:
      return null
  }
}

/** The driver's name as a short map tag: whitespace collapsed, at most 18 characters. */
export function markerName(name: string): string {
  const s = name.replace(/\s+/g, ' ').trim()
  return s.length > 18 ? `${s.slice(0, 17).trimEnd()}…` : s
}
