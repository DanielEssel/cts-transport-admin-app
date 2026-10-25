// Seeds demo admin accounts in the local emulators: two super admins (so
// the "creator cannot approve" rule can be shown) and one ordinary admin.
// No supplier, station, price, stock or payout data is created.
import { AUTH, FIRESTORE, PROJECT } from './guard.mjs'

export const DEMO_PASSWORD = 'demo-password-123'
export const DEMO_ADMINS = [
  { email: 'super.a@demo.local', fullName: 'Demo Super Admin A', role: 'super_admin' },
  { email: 'super.b@demo.local', fullName: 'Demo Super Admin B', role: 'super_admin' },
  { email: 'admin@demo.local', fullName: 'Demo Admin', role: 'admin' },
]

async function call(url, init) {
  const res = await fetch(url, init)
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, body }
}

async function uidFor(email) {
  const signUp = await call(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: DEMO_PASSWORD, returnSecureToken: true }),
  })
  if (signUp.ok) return signUp.body.localId
  // Already there from an earlier seed: sign in instead.
  const signIn = await call(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: DEMO_PASSWORD, returnSecureToken: true }),
  })
  if (!signIn.ok) throw new Error(`Could not create or sign in ${email}: ${JSON.stringify(signIn.body)}`)
  return signIn.body.localId
}

for (const a of DEMO_ADMINS) {
  const uid = await uidFor(a.email)
  // "Bearer owner" is the emulator's admin bypass; it exists only in emulators.
  const res = await fetch(`${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/admins/${uid}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: {
      active: { booleanValue: true },
      role: { stringValue: a.role },
      email: { stringValue: a.email },
      fullName: { stringValue: a.fullName },
    } }),
  })
  if (!res.ok) throw new Error(`Seeding admins/${uid} failed: ${await res.text()}`)
  console.log(`${a.role.padEnd(11)} ${a.email}  (uid ${uid})`)
}
console.log(`Password for all demo accounts: ${DEMO_PASSWORD}`)
