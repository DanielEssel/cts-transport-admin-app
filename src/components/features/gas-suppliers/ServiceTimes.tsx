'use client'
// Gas service times (settings/gas_service_times), the estimates the
// supplier-order quote's ETA uses (gas_supplier_orders.js gasTimingSettings):
// per service type, preparation (acceptance until the cylinder leaves the
// station) and refill (only where the service refills a cylinder). Each
// station may override the platform defaults; a blank value inherits. The
// built-in defaults apply where nothing is set. A paid order keeps the ETA it
// was quoted with: a change here affects new quotes only. These are operating
// estimates, not service levels agreed with a supplier.
import { useCallback, useEffect, useState } from 'react'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { toast } from 'sonner'
import { db } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import { Card, Field, Notice, TextInput, buttonStyle, inputStyle } from './ui'
import {
  SERVICE_TIME_DEFAULTS, SERVICE_TIME_TYPES, effectiveServiceTimes, parseServiceTimes, serviceTimesProblem, type ServiceTimesForm,
} from '@/lib/gas-service-times'

const TYPE_LABELS: Record<string, string> = {
  exchangeEmpty: 'Exchange empty cylinder', newCylinder: 'New cylinder', commercialBulk: 'Commercial bulk', pickupAndReturn: 'Pickup & Return',
}
const REF = () => doc(db, 'settings', 'gas_service_times')

const toForm = (layer: Record<string, any> | undefined): ServiceTimesForm =>
  Object.fromEntries(SERVICE_TIME_TYPES.map((t) => [t, {
    preparationMinutes: layer?.[t]?.preparationMinutes != null ? String(layer[t].preparationMinutes) : '',
    refillMinutes: layer?.[t]?.refillMinutes != null ? String(layer[t].refillMinutes) : '',
  }])) as ServiceTimesForm

export function ServiceTimes({ stations }: { stations: Array<{ id: string; name: string }> }) {
  const { admin } = useAuth()
  const [times, setTimes] = useState<Record<string, any> | null | undefined>(undefined)
  const [scope, setScope] = useState<string>('')
  const [form, setForm] = useState<ServiceTimesForm>(() => toForm(undefined))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const s = await getDoc(REF())
      setTimes(s.exists() ? s.data() : null); setError(null)
    } catch (e) { setTimes(null); setError((e as Error).message) }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { setForm(toForm(scope ? times?.stations?.[scope] : times?.defaults)) }, [scope, times])

  const problem = serviceTimesProblem(form)
  async function save() {
    setBusy(true)
    try {
      const field = scope ? `stations.${scope}` : 'defaults'
      const value = parseServiceTimes(form)
      const data: Record<string, any> = { updatedAt: serverTimestamp(), updatedBy: admin?.uid ?? null }
      if (scope) data.stations = { [scope]: value }; else data.defaults = value
      // Replaces this scope's times only; the other scopes are untouched.
      await setDoc(REF(), data, { mergeFields: [field, 'updatedAt', 'updatedBy'] })
      toast.success('Service times saved. They apply to new quotes only.')
      await load()
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <Card title="Service times (ETA estimates)">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
        <div style={{ color: 'var(--text-tertiary)' }}>
          The customer&apos;s estimate is the supplier&apos;s answer time, preparation, refilling where the service needs it, and the measured
          driving time. These are planning estimates, not promises: customers see the ETA as an estimate, and a paid order keeps the one it was quoted.
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Station</th>{SERVICE_TIME_TYPES.map((t) => <th key={t}>{TYPE_LABELS[t]}</th>)}</tr></thead>
            <tbody>
              {stations.map((st) => (
                <tr key={st.id}>
                  <td>{st.name}</td>
                  {SERVICE_TIME_TYPES.map((t) => {
                    const e = effectiveServiceTimes(times, st.id, t)
                    return <td key={t}>{e ? `${e.preparationMinutes} min prep${e.refillMinutes ? ` + ${e.refillMinutes} min refill` : ''}` : 'Invalid setting'}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Field label="Edit times for">
            <select value={scope} onChange={(e) => setScope(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">Platform defaults (all stations)</option>
              {stations.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Service</th><th>Preparation (min)</th><th>Refill (min)</th></tr></thead>
            <tbody>
              {SERVICE_TIME_TYPES.map((t) => (
                <tr key={t}>
                  <td>{TYPE_LABELS[t]}</td>
                  {(['preparationMinutes', 'refillMinutes'] as const).map((k) => (
                    <td key={k}>
                      <TextInput value={form[t][k]} onChange={(v) => setForm({ ...form, [t]: { ...form[t], [k]: v } })}
                        placeholder={`inherit (${scope ? 'platform' : 'built-in'}: ${scope ? effectiveServiceTimes({ defaults: times?.defaults }, '', t)?.[k] ?? '—' : SERVICE_TIME_DEFAULTS[t][k]})`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <button style={buttonStyle('primary', busy || !!problem)} disabled={busy || !!problem} title={problem ?? undefined} onClick={save}>Save service times</button>
          {problem && <span style={{ marginLeft: '8px', color: 'var(--text-tertiary)' }}>{problem}</span>}
        </div>
      </div>
    </Card>
  )
}
