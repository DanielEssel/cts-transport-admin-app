'use client'
import { emulator } from '@/lib/firebase'

/** Shown on every page while the app is using the local emulators. */
export function EmulatorBanner() {
  if (!emulator) return null
  return (
    // Floats over the page so the full-height layout is not pushed down.
    <div role="status" style={{
      position: 'fixed', top: '8px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
      maxWidth: 'calc(100vw - 32px)', background: '#b45309', color: '#fff', borderRadius: '999px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.3)', pointerEvents: 'none',
      fontSize: '12px', fontWeight: 700, textAlign: 'center', padding: '6px 14px', letterSpacing: '0.02em',
    }}>
      LOCAL EMULATOR MODE — project {emulator.projectId}, Auth :{emulator.authPort}, Firestore :{emulator.firestorePort}.
      Nothing here touches production data.
    </div>
  )
}
