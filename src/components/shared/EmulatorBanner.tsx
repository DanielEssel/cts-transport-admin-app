'use client'
import { emulator } from '@/lib/firebase'

/**
 * Shown on every page while the app is using the local emulators: a thin
 * strip above the app. It sets --banner-h, which the shell subtracts from
 * its full-height layout, so it never covers the page title or controls.
 */
export function EmulatorBanner() {
  if (!emulator) return null
  return (
    <>
      <style>{':root { --banner-h: 28px; }'}</style>
      <div role="status" style={{
        height: 'var(--banner-h)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--tone-warning-bg)', color: 'var(--tone-warning-fg)', borderBottom: '1px solid var(--border)',
        fontSize: '12px', fontWeight: 700, padding: '0 12px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Local emulator · project {emulator.projectId} · Auth :{emulator.authPort} · Firestore :{emulator.firestorePort} · not production data
        </span>
      </div>
    </>
  )
}
