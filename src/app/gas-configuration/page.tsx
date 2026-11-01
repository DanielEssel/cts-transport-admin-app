'use client'
// Gas configuration in one place: the service times every supplier-order
// quote uses, the direct-order prices and delivery fees (edited in Settings),
// and the master switches (read-only). Nothing here is a new setting.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { listStations, listSuppliers } from '@/lib/gas-supplier-data'
import { ServiceTimes } from '@/components/features/gas-suppliers/ServiceTimes'
import { GasSwitches } from '@/components/features/gas-suppliers/GasSwitches'
import { Card, KeyValue, Notice } from '@/components/features/gas-suppliers/ui'

const SIZES = [['3kg', '3 kg'], ['6kg', '6 kg'], ['12kg', '12.5 kg'], ['14kg', '14.5 kg'], ['19kg', '19 kg'], ['45kg', '45 kg']] as const
const ghs = (v: unknown) => (typeof v === 'number' ? `GH₵ ${v.toFixed(2)}` : null)

export default function GasConfigurationPage() {
  const [stations, setStations] = useState<Array<{ id: string; name: string }> | null>(null)
  const [stationsError, setStationsError] = useState<string | null>(null)
  const [gas, setGas] = useState<Record<string, unknown> | null | undefined>(undefined)

  useEffect(() => {
    listSuppliers()
      .then((sup) => Promise.all(sup.map(async (s) => (await listStations(s.id)).map((st) => ({ id: st.id, name: `${s.tradingName || s.legalName} · ${st.name}` })))))
      .then((rows) => setStations(rows.flat().sort((a, b) => a.name.localeCompare(b.name))))
      .catch((e) => { setStations([]); setStationsError(e?.code || e?.message || 'Stations could not be loaded.') })
    getDoc(doc(db, 'settings', 'platform'))
      .then((s) => setGas((s.exists() ? (s.data().gas as Record<string, unknown>) : null) ?? null))
      .catch(() => setGas(null))
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>Gas Configuration</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Platform-wide Gas settings. Supplier-specific setup (stations, products, prices) is in each supplier&apos;s workspace.</p>
      </div>

      <Card title="Master switches">
        <GasSwitches />
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
          Supplier fulfilment and supplier payouts are changed only by a super admin, outside this dashboard. They are shown here so their state is never a surprise.
        </div>
      </Card>

      {stationsError && <Notice tone="danger">Stations could not be loaded ({stationsError}); only the platform defaults can be edited.</Notice>}
      {stations === null ? <div className="skeleton" style={{ height: '220px' }} /> : <ServiceTimes stations={stations} />}

      <Card title="Direct Gas order pricing" actions={<Link href="/settings#gas" className="btn btn-secondary">Edit in Settings</Link>}>
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
          Prices for the older direct Gas flow (settings/platform), read by the server when it prices an order. Supplier orders use each supplier&apos;s verified prices instead.
        </div>
        {gas === undefined ? <div className="skeleton" style={{ height: '120px' }} /> : !gas ? <Notice tone="warning">No Gas pricing is saved in Settings.</Notice> : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Cylinder</th><th>Refill (exchange, pickup &amp; return)</th><th>Full cylinder (new)</th></tr></thead>
                <tbody>
                  {SIZES.map(([k, l]) => (
                    <tr key={k}><td>{l}</td><td>{ghs(gas[`refill${k}`]) ?? '—'}</td><td>{ghs(gas[`full${k}`]) ?? '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sw-kv">
              <KeyValue k="Delivery base fare" v={ghs(gas.baseFare)} />
              <KeyValue k="Per km" v={ghs(gas.perKm)} />
              <KeyValue k="Minimum delivery fee" v={ghs(gas.minDeliveryFee)} />
              <KeyValue k="Round-trip fee (pickup & return)" v={ghs(gas.roundTripFee)} />
              <KeyValue k="Commercial multiplier" v={typeof gas.commercialRate === 'number' ? `× ${gas.commercialRate}` : null} />
              <KeyValue k="Minimum order" v={typeof gas.minimumOrder === 'number' ? `${gas.minimumOrder} cylinders` : null} />
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
