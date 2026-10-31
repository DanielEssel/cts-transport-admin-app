'use client'
// Loads the Google Maps JavaScript API once per page, whatever mounts the map
// and however often (StrictMode, navigating away and back). Uses the
// documented async loader (callback + loading=async); no extra libraries.
//
// Failures are reported, never left spinning:
//   - no key configured (NEXT_PUBLIC_MAPS_API_KEY);
//   - the script fails to load or times out (offline, blocked);
//   - Google rejects the key (window.gm_authFailure: a referrer, API or
//     billing restriction). The exact reason is in the browser console as
//     e.g. RefererNotAllowedMapError; the key itself is never logged here.

export type MapsFailure = 'missing_key' | 'load_failed' | 'timeout' | 'auth_failed'

export class MapsLoadError extends Error {
  readonly reason: MapsFailure
  constructor(reason: MapsFailure) {
    super(reason)
    this.name = 'MapsLoadError'
    this.reason = reason
  }
}

export const MAPS_FAILURE_MESSAGE: Record<MapsFailure, string> = {
  missing_key: 'The map is not configured: NEXT_PUBLIC_MAPS_API_KEY is not set for this build.',
  load_failed: 'The Google Maps script could not be loaded. Check the connection or any content blocker, then retry.',
  timeout: 'Google Maps took too long to load. Check the connection, then retry.',
  auth_failed: "Google rejected this site's Maps API key. The key must allow the Maps JavaScript API from this website address (see the browser console for Google's exact error).",
}

const CALLBACK = '__ctsgoMapsReady'
const TIMEOUT_MS = 15000

let loading: Promise<typeof google.maps> | null = null
let authFailed = false
const authListeners = new Set<() => void>()

declare global {
  interface Window {
    gm_authFailure?: () => void
    [CALLBACK]?: () => void
  }
}

/** Called (now and later) when Google rejects the key; returns an unsubscribe. */
export function onMapsAuthFailure(fn: () => void): () => void {
  if (authFailed) fn()
  authListeners.add(fn)
  return () => { authListeners.delete(fn) }
}

export function loadGoogleMaps(apiKey: string | undefined = process.env.NEXT_PUBLIC_MAPS_API_KEY): Promise<typeof google.maps> {
  if (typeof window === 'undefined') return Promise.reject(new MapsLoadError('load_failed'))
  if (authFailed) return Promise.reject(new MapsLoadError('auth_failed'))
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps)
  if (loading) return loading
  if (!apiKey || !apiKey.trim()) return Promise.reject(new MapsLoadError('missing_key'))

  window.gm_authFailure = () => {
    authFailed = true
    authListeners.forEach((fn) => fn())
  }

  loading = new Promise<typeof google.maps>((resolve, reject) => {
    const fail = (reason: MapsFailure) => {
      cleanup()
      loading = null // a later retry may succeed (e.g. back online)
      document.querySelector('script[data-google-maps="true"]')?.remove()
      reject(new MapsLoadError(reason))
    }
    const timer = window.setTimeout(() => fail('timeout'), TIMEOUT_MS)
    const cleanup = () => { window.clearTimeout(timer); delete window[CALLBACK] }
    window[CALLBACK] = () => { cleanup(); resolve(window.google.maps) }

    const params = new URLSearchParams({ key: apiKey.trim(), callback: CALLBACK, loading: 'async', v: 'weekly' })
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`
    script.async = true
    script.dataset.googleMaps = 'true'
    script.addEventListener('error', () => fail('load_failed'), { once: true })
    document.head.appendChild(script)
  })
  return loading
}

/** For tests: forget the loader state. */
export function resetGoogleMapsLoaderForTests() {
  loading = null
  authFailed = false
  authListeners.clear()
}
