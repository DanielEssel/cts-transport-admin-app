// Loads a firestore.rules file into the local Firestore emulator.
// Usage: node emulators/load-rules.mjs path/to/firestore.rules
import { readFileSync } from 'node:fs'
import { FIRESTORE, PROJECT } from './guard.mjs'

const file = process.argv[2]
if (!file) throw new Error('Usage: load-rules.mjs <firestore.rules>')
const res = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJECT}:securityRules`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: readFileSync(file, 'utf8') }] } }),
})
if (!res.ok) throw new Error(`Loading rules failed (${res.status}): ${await res.text()}`)
console.log(`Loaded rules from ${file}`)
