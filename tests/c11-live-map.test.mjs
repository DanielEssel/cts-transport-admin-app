// C11: Live Map location data. Positions come only from the driver record;
// invalid ones are never drawn, and old ones are never shown as live.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const m = await import('../src/lib/live-map.ts')
const g = await import('../src/lib/google-maps.ts')

test('C11-01 positions: GeoPoint, {lat,lng}; invalid or missing ones are null', () => {
  assert.deepEqual(m.toLatLng({ latitude: 5.6, longitude: -0.18 }), { lat: 5.6, lng: -0.18 })
  // A Firestore GeoPoint exposes latitude/longitude getters.
  const geo = Object.create({ get latitude() { return 5.7 }, get longitude() { return -0.2 } })
  assert.deepEqual(m.toLatLng(geo), { lat: 5.7, lng: -0.2 })
  assert.deepEqual(m.toLatLng({ lat: 6, lng: -1 }), { lat: 6, lng: -1 })
  for (const bad of [null, undefined, 'x', {}, { latitude: '5', longitude: 1 }, { latitude: NaN, longitude: 1 },
    { latitude: 91, longitude: 0 }, { latitude: 0, longitude: 181 }, { latitude: 0, longitude: 0 }]) {
    assert.equal(m.toLatLng(bad), null, JSON.stringify(bad))
  }
})

test('C11-02 live only within 2 minutes; older or untimed positions are last known', () => {
  const now = Date.UTC(2026, 9, 31, 12)
  const at = (msAgo) => ({ toMillis: () => now - msAgo })
  assert.equal(m.locationFreshness({ lastLocationUpdate: at(30e3) }, now).state, 'live')
  assert.equal(m.locationFreshness({ lastLocationUpdate: at(5 * 60e3) }, now).state, 'stale')
  // lastLocationUpdate wins over lastSeen.
  assert.equal(m.locationFreshness({ lastLocationUpdate: at(10 * 60e3), lastSeen: at(1e3) }, now).state, 'stale')
  assert.equal(m.locationFreshness({ lastSeen: { seconds: (now - 60e3) / 1000 } }, now).state, 'live')
  assert.deepEqual(m.locationFreshness({}, now), { state: 'unknown' })
  assert.equal(m.freshnessLabel({ state: 'stale', ageMs: 5 * 60e3 }), 'Last known 5 min ago')
  assert.equal(m.freshnessLabel({ state: 'stale', ageMs: 3 * 3600e3 }), 'Last known 3 h ago')
  assert.match(m.freshnessLabel({ state: 'unknown' }), /time unknown/)
  assert.equal(m.freshnessLabel({ state: 'live', ageMs: 0 }), 'Live')
})

test('C11-03 every Maps failure has a message, and none contains a key', () => {
  for (const r of ['missing_key', 'load_failed', 'timeout', 'auth_failed']) {
    assert.ok(g.MAPS_FAILURE_MESSAGE[r]?.length > 20, r)
    assert.doesNotMatch(g.MAPS_FAILURE_MESSAGE[r], /AIza/)
  }
})

test('C11-04 the key fingerprint is a short hash, never the key', async () => {
  const key = 'AIzaTEST-not-a-real-key-0000000000000000'
  const fp = await g.keyFingerprint(key)
  assert.match(fp, /^[0-9a-f]{8}$/)
  assert.ok(!key.includes(fp))
  const { createHash } = await import('node:crypto')
  assert.equal(fp, createHash('sha256').update(key).digest('hex').slice(0, 8), 'matches sha256sum | cut -c1-8')
  assert.equal(g.MAPS_KEY_SOURCE, 'NEXT_PUBLIC_MAPS_API_KEY')
})

test('C11-05 vehicle marker images follow the Passenger App; unknown types get none', async () => {
  const { existsSync } = await import('node:fs')
  const want = { okada: 'motorbike', Gas: 'motorbike', delivery: 'motorbike', taxi: 'taxi', aboboya: 'tricycle', pragya: 'tricycle', mini_truck: 'minitruck' }
  for (const [type, marker] of Object.entries(want)) {
    assert.equal(m.vehicleMarker(type), marker, type)
    assert.ok(existsSync(new URL(`../public/markers/${marker}.png`, import.meta.url)), marker)
  }
  for (const bad of [undefined, null, '', 'boat', 3]) assert.equal(m.vehicleMarker(bad), null, String(bad))
})

test('C11-06 the name tag is the driver name, trimmed to 18 characters', () => {
  assert.equal(m.markerName('  Kwame   Mensah '), 'Kwame Mensah')
  const long = m.markerName('Nana Akosua Boatemaa Owusu')
  assert.ok(long.length <= 18 && long.endsWith('…'), long)
})
