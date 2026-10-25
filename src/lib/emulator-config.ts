// Local emulator mode for the admin app. Pure, so the tests run it directly.
//
// Off unless NEXT_PUBLIC_USE_FIREBASE_EMULATORS is exactly "true". When on,
// the app ignores every production NEXT_PUBLIC_FIREBASE_* value and uses a
// "demo-" project, which the Firebase SDKs and emulators treat as having no
// real backend: nothing in this mode can reach ctstransportapp. It never
// falls back either way: a bad emulator setting stops the app with an
// error instead of quietly using production.

export const EMULATOR_PROJECT_ID = 'demo-ctsgo-admin'

export interface EmulatorSettings {
  projectId: string
  host: string
  authPort: number
  firestorePort: number
  functionsPort: number
}

export interface EmulatorEnv {
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS?: string
  NEXT_PUBLIC_FIREBASE_EMULATOR_HOST?: string
  NEXT_PUBLIC_AUTH_EMULATOR_PORT?: string
  NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT?: string
  NEXT_PUBLIC_FUNCTIONS_EMULATOR_PORT?: string
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function port(value: string | undefined, fallback: number, name: string): number {
  if (value == null || value === '') return fallback
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`${name} must be a port number, got "${value}".`)
  return n
}

/**
 * The emulator settings, or null for the normal (production) configuration.
 * `pageHost` is window.location.hostname in the browser, null on the server.
 * Throws when emulator mode is requested but is not safely local.
 */
export function emulatorSettings(env: EmulatorEnv, pageHost: string | null): EmulatorSettings | null {
  const flag = env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS
  if (flag === undefined || flag === '' || flag === 'false') return null
  if (flag !== 'true') throw new Error(`NEXT_PUBLIC_USE_FIREBASE_EMULATORS must be "true" or unset, got "${flag}".`)

  const host = env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST || '127.0.0.1'
  if (!LOOPBACK.has(host)) throw new Error(`Emulator host must be this machine (localhost / 127.0.0.1), got "${host}".`)
  if (pageHost != null && !LOOPBACK.has(pageHost)) {
    throw new Error(`Emulator mode only runs on localhost; this page is served from "${pageHost}".`)
  }
  return {
    projectId: EMULATOR_PROJECT_ID,
    host,
    authPort: port(env.NEXT_PUBLIC_AUTH_EMULATOR_PORT, 9099, 'NEXT_PUBLIC_AUTH_EMULATOR_PORT'),
    firestorePort: port(env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT, 8085, 'NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT'),
    functionsPort: port(env.NEXT_PUBLIC_FUNCTIONS_EMULATOR_PORT, 5001, 'NEXT_PUBLIC_FUNCTIONS_EMULATOR_PORT'),
  }
}

/** Client config for emulator mode: no production value is used. */
export function emulatorFirebaseConfig(s: EmulatorSettings) {
  return {
    apiKey: 'demo-api-key',
    authDomain: `${s.projectId}.firebaseapp.com`,
    projectId: s.projectId,
    storageBucket: `${s.projectId}.appspot.com`,
    messagingSenderId: '0',
    appId: '1:0:web:0',
  }
}
