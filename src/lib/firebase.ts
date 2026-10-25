'use client'
import { initializeApp, getApps } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions'
import { emulatorFirebaseConfig, emulatorSettings } from '@/lib/emulator-config'

// Local emulator mode (opt-in, see README "Local emulator demo"). Each
// NEXT_PUBLIC_ variable is named in full so Next inlines it.
export const emulator = emulatorSettings({
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS,
  NEXT_PUBLIC_FIREBASE_EMULATOR_HOST: process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST,
  NEXT_PUBLIC_AUTH_EMULATOR_PORT: process.env.NEXT_PUBLIC_AUTH_EMULATOR_PORT,
  NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT: process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT,
  NEXT_PUBLIC_FUNCTIONS_EMULATOR_PORT: process.env.NEXT_PUBLIC_FUNCTIONS_EMULATOR_PORT,
}, typeof window === 'undefined' ? null : window.location.hostname)

const firebaseConfig = emulator ? emulatorFirebaseConfig(emulator) : {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'placeholder',
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'placeholder.firebaseapp.com',
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'ctstransportapp',
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'placeholder.appspot.com',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '123456',
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:123:web:abc',
}

const app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
export const auth      = getAuth(app)
export const db        = getFirestore(app)
export const functions = getFunctions(app, 'europe-west2')

// Connected before anything uses them; once per page (hot reload re-runs
// this module against the same instances, which cannot be reconnected).
const g = globalThis as { __ctsEmulatorsConnected?: boolean }
if (emulator && !g.__ctsEmulatorsConnected) {
  connectAuthEmulator(auth, `http://${emulator.host}:${emulator.authPort}`, { disableWarnings: true })
  connectFirestoreEmulator(db, emulator.host, emulator.firestorePort)
  connectFunctionsEmulator(functions, emulator.host, emulator.functionsPort)
  g.__ctsEmulatorsConnected = true
}

export default app
