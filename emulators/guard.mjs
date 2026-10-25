// Shared by the emulator scripts: they only ever talk to this machine's
// emulators, for a demo- project.
export const PROJECT = 'demo-ctsgo-admin'
export const FIRESTORE = 'http://127.0.0.1:8085'
export const AUTH = 'http://127.0.0.1:9099'

for (const url of [FIRESTORE, AUTH]) {
  if (new URL(url).hostname !== '127.0.0.1') throw new Error(`Refusing non-local emulator URL ${url}`)
}
if (!PROJECT.startsWith('demo-')) throw new Error('Emulator scripts only run against a demo- project.')
