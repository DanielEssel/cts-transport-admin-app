// C7 — Local emulator mode is opt-in, local-only, and never uses the
// production project. Uses only Node's built-in test runner.
// Run: npm run test:c1

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const { emulatorSettings, emulatorFirebaseConfig, EMULATOR_PROJECT_ID } = await import('../src/lib/emulator-config.ts')
const firebaseTs = readFileSync(fileURLToPath(new URL('../src/lib/firebase.ts', import.meta.url)), 'utf8')

const on = (o = {}) => ({ NEXT_PUBLIC_USE_FIREBASE_EMULATORS: 'true', ...o })

test('off unless explicitly set to "true": production configuration is used', () => {
  for (const v of [undefined, '', 'false']) assert.equal(emulatorSettings({ NEXT_PUBLIC_USE_FIREBASE_EMULATORS: v }, 'localhost'), null)
})

test('any other value is an error, not a guess', () => {
  for (const v of ['TRUE', '1', 'yes', 'true ']) assert.throws(() => emulatorSettings(on({ NEXT_PUBLIC_USE_FIREBASE_EMULATORS: v }), 'localhost'), /must be "true" or unset/)
})

test('emulator mode uses a demo- project and local defaults', () => {
  const s = emulatorSettings(on(), 'localhost')
  assert.deepEqual(s, { projectId: EMULATOR_PROJECT_ID, host: '127.0.0.1', authPort: 9099, firestorePort: 8085, functionsPort: 5001 })
  assert.match(s.projectId, /^demo-/)
})

test('emulators must be on this machine, and the page must be served locally', () => {
  assert.throws(() => emulatorSettings(on({ NEXT_PUBLIC_FIREBASE_EMULATOR_HOST: '10.0.0.5' }), 'localhost'), /must be this machine/)
  assert.throws(() => emulatorSettings(on(), 'admin.ctsgo.example'), /only runs on localhost/)
  assert.ok(emulatorSettings(on(), null), 'server-side rendering has no page host')
  assert.ok(emulatorSettings(on({ NEXT_PUBLIC_FIREBASE_EMULATOR_HOST: 'localhost' }), '127.0.0.1'))
})

test('ports are validated', () => {
  assert.equal(emulatorSettings(on({ NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT: '8186' }), null).firestorePort, 8186)
  for (const p of ['0', '70000', 'abc', '80.5']) {
    assert.throws(() => emulatorSettings(on({ NEXT_PUBLIC_AUTH_EMULATOR_PORT: p }), null), /port number/)
  }
})

test('the emulator client config contains no production values', () => {
  const c = emulatorFirebaseConfig(emulatorSettings(on(), null))
  assert.equal(c.projectId, EMULATOR_PROJECT_ID)
  assert.doesNotMatch(JSON.stringify(c), /ctstransportapp/)
})

test('firebase.ts connects Auth, Firestore and Functions only in emulator mode, before export use', () => {
  assert.match(firebaseTs, /const firebaseConfig = emulator \? emulatorFirebaseConfig\(emulator\) : \{/)
  const guard = firebaseTs.indexOf('if (emulator && !g.__ctsEmulatorsConnected)')
  assert.ok(guard > 0, 'connection must be guarded by emulator mode')
  for (const c of ['connectAuthEmulator(', 'connectFirestoreEmulator(', 'connectFunctionsEmulator(']) {
    assert.ok(firebaseTs.indexOf(c, guard) > guard, `${c} must be inside the guard`)
    assert.equal(firebaseTs.split(c).length - 1, 1, `${c} called exactly once`)
  }
  // The production branch is unchanged.
  assert.match(firebaseTs, /projectId:\s+process\.env\.NEXT_PUBLIC_FIREBASE_PROJECT_ID \|\| 'ctstransportapp'/)
})
