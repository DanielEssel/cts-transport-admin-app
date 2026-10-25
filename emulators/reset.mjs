// Clears all Firestore data in the local emulator (demo project only) and
// reseeds the demo admin accounts. Use between demo rehearsals.
import { FIRESTORE, PROJECT } from './guard.mjs'

const res = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' })
if (!res.ok) throw new Error(`Clearing the emulator failed (${res.status}): ${await res.text()}`)
console.log(`Cleared Firestore emulator data for ${PROJECT}`)
await import('./seed-admins.mjs')
