// Which admin action a withdrawal offers, decided from the fields the server
// writes (the deployed bridge.js: initiateBridgePayout sends each payout at
// once and leaves it "processing"). Pure, for tests.
//
// pending                         → nothing (only the retired endpoints made
//                                   these; no deployed function pays one)
// processing + payoutOutcome
//   "sent" / "unknown"            → confirm the result with Bridge evidence
//                                   (resolveUnconfirmedPayout)
//   "sending" for over 10 minutes → the send never finished; confirm likewise
//   "sending" (recent)            → nothing: a send is in progress
// completed / failed / rejected   → final
//
// The server re-checks every one of these; this only decides what to show.

import type { Withdrawal } from '@/types'

/** The server requires at least this many characters of Bridge evidence. */
export const MIN_EVIDENCE_LENGTH = 6

/** resolveUnconfirmedPayout treats a send older than this as abandoned. */
export const STALE_SENDING_MS = 10 * 60 * 1000

function millis(t: unknown): number | null {
  if (t == null) return null
  if (typeof t === 'number') return t
  if (t instanceof Date) return t.getTime()
  const v = t as { toMillis?: () => number; seconds?: number }
  if (typeof v.toMillis === 'function') return v.toMillis()
  if (typeof v.seconds === 'number') return v.seconds * 1000
  return null
}

export function canResolvePayout(w: Withdrawal, now: number = Date.now()): boolean {
  if (w.status !== 'processing') return false
  if (w.payoutOutcome === 'sent' || w.payoutOutcome === 'unknown') return true
  if (w.payoutOutcome === 'sending') {
    const started = millis(w.sendingStartedAt)
    return started != null && now - started > STALE_SENDING_MS
  }
  return false
}

export function payoutStateLabel(w: Withdrawal): string | null {
  if (w.status !== 'processing') return null
  switch (w.payoutOutcome) {
    case 'sending': return 'Sending to Bridge…'
    case 'sent': return 'Accepted by Bridge — confirm result'
    case 'unknown': return 'Outcome unknown — check Bridge'
    default: return null
  }
}
