// C1 — Admin money freeze.
//
// These admin actions write money or approval state directly from the
// browser, without a ledger entry, transaction or audit record. They are
// disabled until the audited server workflow (plan batch A1) replaces them.
// Read-only views are unaffected.
//
// Withdrawal decisions are no longer frozen: the withdrawals page calls only
// the audited server function resolveUnconfirmedPayout and writes nothing
// itself.

export type FrozenAction =
  | 'walletAdjustment'    // passengers: wallet top-up / deduction
  | 'tripFareOverride'    // trips: change actualFare
  | 'driverSuspension'    // drivers: direct suspend / unsuspend writes

export const FROZEN_ACTION_MESSAGE =
  'Temporarily disabled while the audited workflow is being implemented.'

const FROZEN: Readonly<Record<FrozenAction, boolean>> = {
  walletAdjustment: true,
  tripFareOverride: true,
  driverSuspension: true,
}

export function isFrozen(action: FrozenAction): boolean {
  return FROZEN[action] === true
}

/** Style applied to a frozen action's button. */
export const frozenButtonStyle = { opacity: 0.45, cursor: 'not-allowed' } as const
