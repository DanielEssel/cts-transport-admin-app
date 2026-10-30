// Gas service times (settings/gas_service_times), as the server reads them
// (functions/gas_supplier_orders.js gasTimingSettings): station, then
// defaults, then the built-in SERVICE_TIME_DEFAULTS; a present value must be
// a whole number of minutes from 0 to 480.

export const SERVICE_TIME_TYPES = ['exchangeEmpty', 'newCylinder', 'commercialBulk', 'pickupAndReturn'] as const
export type ServiceTimeType = (typeof SERVICE_TIME_TYPES)[number]
type Times = { preparationMinutes: number; refillMinutes: number }

/** Planning estimates (owner, 2026-10-30): a filled cylinder needs no refill. */
export const SERVICE_TIME_DEFAULTS: Record<ServiceTimeType, Times> = {
  exchangeEmpty: { preparationMinutes: 10, refillMinutes: 0 },
  newCylinder: { preparationMinutes: 10, refillMinutes: 0 },
  commercialBulk: { preparationMinutes: 10, refillMinutes: 0 },
  pickupAndReturn: { preparationMinutes: 10, refillMinutes: 15 },
}
export const SERVICE_MINUTES_MAX = 480

export type ServiceTimesForm = Record<ServiceTimeType, { preparationMinutes: string; refillMinutes: string }>

const okMinutes = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= SERVICE_MINUTES_MAX

/** The times a quote for this station and service uses, or null when a setting is malformed (the server then refuses to quote). */
export function effectiveServiceTimes(doc: Record<string, any> | null | undefined, stationId: string, type: ServiceTimeType): Times | null {
  const layers = [doc?.stations?.[stationId]?.[type], doc?.defaults?.[type]]
  if (layers.some((l) => l != null && (typeof l !== 'object' || Array.isArray(l)))) return null
  const pick = (k: keyof Times): number | null => {
    for (const l of layers) {
      const v = l?.[k]
      if (v === undefined || v === null) continue
      return okMinutes(v) ? v : null
    }
    return SERVICE_TIME_DEFAULTS[type][k]
  }
  const preparationMinutes = pick('preparationMinutes'), refillMinutes = pick('refillMinutes')
  return preparationMinutes === null || refillMinutes === null ? null : { preparationMinutes, refillMinutes }
}

/** Why the form cannot be saved, or null. Blank inherits. */
export function serviceTimesProblem(form: ServiceTimesForm): string | null {
  for (const t of SERVICE_TIME_TYPES) {
    for (const v of [form[t].preparationMinutes, form[t].refillMinutes]) {
      if (v.trim() === '') continue
      if (!/^\d+$/.test(v.trim()) || Number(v) > SERVICE_MINUTES_MAX) return `Whole minutes from 0 to ${SERVICE_MINUTES_MAX}, or blank to inherit.`
    }
  }
  return null
}

/** The stored map for one scope: only the values set (blank inherits). */
export function parseServiceTimes(form: ServiceTimesForm): Partial<Record<ServiceTimeType, Partial<Times>>> {
  const out: Partial<Record<ServiceTimeType, Partial<Times>>> = {}
  for (const t of SERVICE_TIME_TYPES) {
    const e: Partial<Times> = {}
    if (form[t].preparationMinutes.trim() !== '') e.preparationMinutes = Number(form[t].preparationMinutes.trim())
    if (form[t].refillMinutes.trim() !== '') e.refillMinutes = Number(form[t].refillMinutes.trim())
    if (Object.keys(e).length) out[t] = e
  }
  return out
}
