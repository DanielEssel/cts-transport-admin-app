'use client'
import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { toast } from 'sonner'
import { Save, Settings, Percent, Car, Package, Flame, ChevronDown, ChevronUp, Info, Database } from 'lucide-react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'

interface RidePricing {
  baseFare: number
  perKmRate: number
  perMinRate: number
  minimumFare: number
  cancellationFee: number
  surgeMutiplier: number
  surgeEnabled: boolean
}

interface DeliveryPricing {
  baseFare: number
  perKmRate: number
  minimumFare: number
  weightSurchargeSmall: number   // < 5kg
  weightSurchargeMedium: number  // 5-15kg
  weightSurchargeLarge: number   // 15kg+
  fragileItemSurcharge: number
  cancellationFee: number
}

interface GasPricing {
  cylinder3kg: number
  cylinder6kg: number
  cylinder12kg: number
  cylinder14kg: number
  deliveryFee: number
  minimumOrder: number
}

interface PlatformSettings {
  platformFeePercent: number
  driverCommissionPercent: number

  // Ride pricing per service type
  okada: RidePricing
  taxi: RidePricing

  // Delivery
  delivery: DeliveryPricing

  // Gas
  gas: GasPricing

  // Service toggles
  rideEnabled: boolean
  deliveryEnabled: boolean
  gasEnabled: boolean
  maintenanceMode: boolean

  // Payout settings
  minWithdrawalAmount: number
  maxWithdrawalAmount: number
  withdrawalProcessingDays: number
}

const defaults: PlatformSettings = {
  platformFeePercent:       15,
  driverCommissionPercent:  85,

  okada: {
    baseFare:         3,
    perKmRate:        1.5,
    perMinRate:       0.2,
    minimumFare:      5,
    cancellationFee:  2,
    surgeMutiplier:   1.5,
    surgeEnabled:     false,
  },
  taxi: {
    baseFare:         5,
    perKmRate:        2.5,
    perMinRate:       0.3,
    minimumFare:      10,
    cancellationFee:  3,
    surgeMutiplier:   1.5,
    surgeEnabled:     false,
  },
  delivery: {
    baseFare:               8,
    perKmRate:              2,
    minimumFare:            10,
    weightSurchargeSmall:   0,
    weightSurchargeMedium:  5,
    weightSurchargeLarge:   15,
    fragileItemSurcharge:   5,
    cancellationFee:        3,
  },
  gas: {
    cylinder3kg:   30,
    cylinder6kg:   55,
    cylinder12kg:  110,
    cylinder14kg:  130,
    deliveryFee:   10,
    minimumOrder:  1,
  },

  rideEnabled:     true,
  deliveryEnabled: true,
  gasEnabled:      true,
  maintenanceMode: false,

  minWithdrawalAmount:      10,
  maxWithdrawalAmount:      5000,
  withdrawalProcessingDays: 1,
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings>(defaults)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [openSection, setOpenSection] = useState<string>('platform')

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'platform'))
        if (snap.exists()) setSettings({ ...defaults, ...snap.data() as PlatformSettings })
      } catch { } finally { setLoading(false) }
    }
    load()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, 'settings', 'platform'), settings, { merge: true })
      toast.success('Settings saved successfully')
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const set = (path: string, value: any) => {
    setSettings(prev => {
      const next = { ...prev }
      const keys = path.split('.')
      let obj: any = next
      for (let i = 0; i < keys.length - 1; i++) {
        obj[keys[i]] = { ...obj[keys[i]] }
        obj = obj[keys[i]]
      }
      obj[keys[keys.length - 1]] = value
      return next
    })
  }

  // Reusable components
  const Section = ({ id, icon, title, children }: { id: string; icon: React.ReactNode; title: string; children: React.ReactNode }) => (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
      <button onClick={() => setOpenSection(openSection === id ? '' : id)} style={{
        width: '100%', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '12px',
        background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        borderBottom: openSection === id ? '1px solid var(--border)' : 'none'
      }}>
        <div style={{ color: '#16a34a' }}>{icon}</div>
        <span style={{ fontFamily: "'Syne', sans-serif", fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>{title}</span>
        {openSection === id ? <ChevronUp size={16} style={{ color: 'var(--text-tertiary)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-tertiary)' }} />}
      </button>
      {openSection === id && <div style={{ padding: '20px' }}>{children}</div>}
    </div>
  )

  const Field = ({ label, value, onChange, unit, hint, min = 0, step = 0.5 }: {
    label: string; value: number; onChange: (v: number) => void
    unit?: string; hint?: string; min?: number; step?: number
  }) => (
    <div>
      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
        {label}
        {hint && <span style={{ fontSize: '10px', fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: '6px', textTransform: 'none' }}>({hint})</span>}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {unit && <span style={{ fontSize: '13px', color: 'var(--text-tertiary)', fontWeight: 600, minWidth: '30px' }}>{unit}</span>}
        <input type="number" value={value} min={min} step={step}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          style={{ padding: '9px 12px', borderRadius: '8px', background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600, outline: 'none', width: '120px' }}
        />
      </div>
    </div>
  )

  const Toggle = ({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>{label}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{desc}</div>
      </div>
      <button type="button" onClick={() => onChange(!value)} style={{
        width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
        background: value ? '#16a34a' : 'var(--border)', position: 'relative', transition: 'background 0.2s', flexShrink: 0
      }}>
        <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '3px', left: value ? '23px' : '3px', transition: 'left 0.2s' }} />
      </button>
    </div>
  )

  const Grid = ({ children }: { children: React.ReactNode }) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '16px' }}>
      {children}
    </div>
  )

  const Divider = ({ label }: { label: string }) => (
    <div style={{ gridColumn: '1/-1', borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '4px' }}>
      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
    </div>
  )

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px', color: 'var(--text-tertiary)' }}>Loading settings...</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '800px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>Platform Settings</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Configure pricing, fees and platform behaviour</p>
        </div>
        <button onClick={handleSave} disabled={saving} style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
          borderRadius: '10px', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
          background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff',
          fontWeight: 700, fontSize: '14px', boxShadow: '0 4px 12px rgba(22,163,74,0.3)',
          opacity: saving ? 0.8 : 1
        }}>
          <Save size={15} />{saving ? 'Saving...' : 'Save All Settings'}
        </button>
      </div>

      {/* Info banner */}
      <div style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: '10px', padding: '12px 16px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        <Info size={14} style={{ color: '#60a5fa', flexShrink: 0, marginTop: '1px' }} />
        <p style={{ fontSize: '12px', color: '#60a5fa', lineHeight: 1.6 }}>
          Changes take effect immediately for new bookings. Existing trips are not affected. The driver app reads these settings on each booking request.
        </p>
      </div>

      {/* Platform fees */}
      <Section id="platform" icon={<Percent size={18} />} title="Platform Fees & Payouts">
        <Grid>
          <Field label="Platform Fee" value={settings.platformFeePercent} unit="%" hint="of each trip" onChange={v => { set('platformFeePercent', v); set('driverCommissionPercent', 100 - v) }} />
          <Field label="Driver Commission" value={settings.driverCommissionPercent} unit="%" hint="auto-calculated" onChange={() => {}} min={0} />
          <Divider label="Withdrawal Limits" />
          <Field label="Min Withdrawal" value={settings.minWithdrawalAmount} unit="GH₵" onChange={v => set('minWithdrawalAmount', v)} />
          <Field label="Max Withdrawal" value={settings.maxWithdrawalAmount} unit="GH₵" onChange={v => set('maxWithdrawalAmount', v)} />
          <Field label="Processing Days" value={settings.withdrawalProcessingDays} unit="days" step={1} onChange={v => set('withdrawalProcessingDays', v)} />
        </Grid>
      </Section>

      {/* Okada pricing */}
      <Section id="okada" icon={<Car size={18} />} title="Okada (Motorcycle) Pricing">
        <Grid>
          <Field label="Base Fare" value={settings.okada.baseFare} unit="GH₵" hint="starting fare" onChange={v => set('okada.baseFare', v)} />
          <Field label="Per KM Rate" value={settings.okada.perKmRate} unit="GH₵" hint="per kilometre" onChange={v => set('okada.perKmRate', v)} step={0.1} />
          <Field label="Per Minute Rate" value={settings.okada.perMinRate} unit="GH₵" hint="waiting/slow traffic" onChange={v => set('okada.perMinRate', v)} step={0.05} />
          <Field label="Minimum Fare" value={settings.okada.minimumFare} unit="GH₵" hint="floor price" onChange={v => set('okada.minimumFare', v)} />
          <Field label="Cancellation Fee" value={settings.okada.cancellationFee} unit="GH₵" hint="after driver assigns" onChange={v => set('okada.cancellationFee', v)} />
          <Divider label="Surge Pricing" />
          <Field label="Surge Multiplier" value={settings.okada.surgeMutiplier} unit="×" hint="e.g. 1.5 = 50% more" onChange={v => set('okada.surgeMutiplier', v)} step={0.1} />
          <div style={{ gridColumn: '1/-1' }}>
            <Toggle label="Enable Surge Pricing" desc="Automatically increase fares during peak hours" value={settings.okada.surgeEnabled} onChange={v => set('okada.surgeEnabled', v)} />
          </div>
        </Grid>
      </Section>

      {/* Taxi pricing */}
      <Section id="taxi" icon={<Car size={18} />} title="Taxi Pricing">
        <Grid>
          <Field label="Base Fare" value={settings.taxi.baseFare} unit="GH₵" onChange={v => set('taxi.baseFare', v)} />
          <Field label="Per KM Rate" value={settings.taxi.perKmRate} unit="GH₵" onChange={v => set('taxi.perKmRate', v)} step={0.1} />
          <Field label="Per Minute Rate" value={settings.taxi.perMinRate} unit="GH₵" onChange={v => set('taxi.perMinRate', v)} step={0.05} />
          <Field label="Minimum Fare" value={settings.taxi.minimumFare} unit="GH₵" onChange={v => set('taxi.minimumFare', v)} />
          <Field label="Cancellation Fee" value={settings.taxi.cancellationFee} unit="GH₵" onChange={v => set('taxi.cancellationFee', v)} />
          <Divider label="Surge Pricing" />
          <Field label="Surge Multiplier" value={settings.taxi.surgeMutiplier} unit="×" onChange={v => set('taxi.surgeMutiplier', v)} step={0.1} />
          <div style={{ gridColumn: '1/-1' }}>
            <Toggle label="Enable Surge Pricing" desc="Automatically increase fares during peak hours" value={settings.taxi.surgeEnabled} onChange={v => set('taxi.surgeEnabled', v)} />
          </div>
        </Grid>
      </Section>

      {/* Delivery pricing */}
      <Section id="delivery" icon={<Package size={18} />} title="Delivery Pricing">
        <Grid>
          <Field label="Base Fare" value={settings.delivery.baseFare} unit="GH₵" hint="starting fare" onChange={v => set('delivery.baseFare', v)} />
          <Field label="Per KM Rate" value={settings.delivery.perKmRate} unit="GH₵" onChange={v => set('delivery.perKmRate', v)} step={0.1} />
          <Field label="Minimum Fare" value={settings.delivery.minimumFare} unit="GH₵" onChange={v => set('delivery.minimumFare', v)} />
          <Field label="Cancellation Fee" value={settings.delivery.cancellationFee} unit="GH₵" onChange={v => set('delivery.cancellationFee', v)} />
          <Divider label="Weight Surcharges" />
          <Field label="Small Package" value={settings.delivery.weightSurchargeSmall} unit="GH₵" hint="under 5kg" onChange={v => set('delivery.weightSurchargeSmall', v)} />
          <Field label="Medium Package" value={settings.delivery.weightSurchargeMedium} unit="GH₵" hint="5–15kg" onChange={v => set('delivery.weightSurchargeMedium', v)} />
          <Field label="Large Package" value={settings.delivery.weightSurchargeLarge} unit="GH₵" hint="over 15kg" onChange={v => set('delivery.weightSurchargeLarge', v)} />
          <Field label="Fragile Item" value={settings.delivery.fragileItemSurcharge} unit="GH₵" hint="extra care" onChange={v => set('delivery.fragileItemSurcharge', v)} />
        </Grid>
      </Section>

      {/* Gas pricing */}
      <Section id="gas" icon={<Flame size={18} />} title="Gas Cylinder Pricing">
        <Grid>
          <Field label="3kg Cylinder" value={settings.gas.cylinder3kg} unit="GH₵" onChange={v => set('gas.cylinder3kg', v)} />
          <Field label="6kg Cylinder" value={settings.gas.cylinder6kg} unit="GH₵" onChange={v => set('gas.cylinder6kg', v)} />
          <Field label="12kg Cylinder" value={settings.gas.cylinder12kg} unit="GH₵" onChange={v => set('gas.cylinder12kg', v)} />
          <Field label="14kg Cylinder" value={settings.gas.cylinder14kg} unit="GH₵" onChange={v => set('gas.cylinder14kg', v)} />
          <Divider label="Delivery" />
          <Field label="Delivery Fee" value={settings.gas.deliveryFee} unit="GH₵" hint="per order" onChange={v => set('gas.deliveryFee', v)} />
          <Field label="Minimum Order" value={settings.gas.minimumOrder} unit="qty" step={1} hint="cylinders" onChange={v => set('gas.minimumOrder', v)} />
        </Grid>
      </Section>

      {/* Service toggles */}
      <Section id="services" icon={<Settings size={18} />} title="Services & Platform Controls">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Toggle label="Ride Hailing" desc="Okada and Taxi bookings via the passenger app" value={settings.rideEnabled} onChange={v => set('rideEnabled', v)} />
          <Toggle label="Parcel Delivery" desc="Parcel and package delivery service" value={settings.deliveryEnabled} onChange={v => set('deliveryEnabled', v)} />
          <Toggle label="Gas Delivery" desc="Gas cylinder refill and delivery service" value={settings.gasEnabled} onChange={v => set('gasEnabled', v)} />
          <Toggle label="Maintenance Mode" desc="Show maintenance screen to all app users — use with caution" value={settings.maintenanceMode} onChange={v => set('maintenanceMode', v)} />
        </div>
      </Section>

      {/* One-time Migration */}
      <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: '16px', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Database size={18} style={{ color: '#fbbf24' }} />
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Wallet Migration</div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Add heldBalance to existing wallets and create driver wallets. Safe to run multiple times.</div>
          </div>
        </div>
        <button onClick={async () => {
          if (!confirm('Run wallet migration? This adds heldBalance field to all wallets.')) return
          try {
            const { collection, getDocs, writeBatch, doc } = await import('firebase/firestore')
            const { db } = await import('@/lib/firebase')
            const snap = await getDocs(collection(db, 'wallets'))
            let count = 0
            // Process in batches of 500
            const BATCH = 500
            let batch = writeBatch(db)
            let i = 0
            for (const d of snap.docs) {
              if (d.data().heldBalance === undefined) {
                batch.update(doc(db, 'wallets', d.id), { heldBalance: 0 })
                count++
                i++
                if (i >= BATCH) {
                  await batch.commit()
                  batch = writeBatch(db)
                  i = 0
                }
              }
            }
            if (i > 0) await batch.commit()
            alert(`✅ Migration complete: ${count} wallets updated`)
          } catch (e: any) { alert('Failed: ' + e.message) }
        }} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#fbbf24', color: '#000', cursor: 'pointer', fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap' }}>
          Run Migration
        </button>
      </div>

      {/* Save button at bottom too */}
      <button onClick={handleSave} disabled={saving} style={{
        padding: '14px', borderRadius: '12px', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
        background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff',
        fontWeight: 700, fontSize: '14px', boxShadow: '0 4px 16px rgba(22,163,74,0.3)',
        opacity: saving ? 0.8 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
      }}>
        <Save size={15} />{saving ? 'Saving...' : 'Save All Settings'}
      </button>
    </div>
  )
}
