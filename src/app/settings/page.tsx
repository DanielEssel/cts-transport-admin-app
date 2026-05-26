'use client'
import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { PlatformSettings } from '@/types'
import { toast } from 'sonner'
import { Settings, Save } from 'lucide-react'

const defaults: PlatformSettings = {
  platformFeePercent: 15,
  minFareRide: 5,
  minFareDelivery: 10,
  minFareGas: 20,
  rideEnabled: true,
  deliveryEnabled: true,
  gasEnabled: true,
  maintenanceMode: false,
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings>(defaults)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

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

  const Input = ({ label, field, unit }: { label: string; field: keyof PlatformSettings; unit?: string }) => (
    <div>
      <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {unit && <span style={{ fontSize: '13px', color: 'var(--text-tertiary)', fontWeight: 600 }}>{unit}</span>}
        <input
          type="number"
          value={settings[field] as number}
          onChange={e => setSettings(p => ({ ...p, [field]: parseFloat(e.target.value) || 0 }))}
          style={{
            padding: '10px 14px', borderRadius: '10px', background: 'var(--surface-alt)',
            border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '14px',
            fontWeight: 600, outline: 'none', width: '120px'
          }}
        />
      </div>
    </div>
  )

  const Toggle = ({ label, desc, field }: { label: string; desc: string; field: keyof PlatformSettings }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>{label}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{desc}</div>
      </div>
      <button
        type="button"
        onClick={() => setSettings(p => ({ ...p, [field]: !p[field] }))}
        style={{
          width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
          background: settings[field] ? '#16a34a' : 'var(--surface-alt)',
          position: 'relative', transition: 'background 0.2s'
        }}
      >
        <div style={{
          width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
          position: 'absolute', top: '3px',
          left: settings[field] ? '23px' : '3px',
          transition: 'left 0.2s'
        }} />
      </button>
    </div>
  )

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px' }}>
      <div style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>Loading settings...</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '640px' }}>
      <div>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>Platform Settings</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Configure CTSRide platform parameters</p>
      </div>

      {/* Fees */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px' }}>
        <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '20px' }}>
          💰 Fees & Fares
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <Input label="Platform Fee %" field="platformFeePercent" unit="%" />
          <Input label="Min Fare — Ride" field="minFareRide" unit="GH₵" />
          <Input label="Min Fare — Delivery" field="minFareDelivery" unit="GH₵" />
          <Input label="Min Fare — Gas" field="minFareGas" unit="GH₵" />
        </div>
      </div>

      {/* Service toggles */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px' }}>
        <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
          🚦 Services
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '16px' }}>
          Enable or disable services platform-wide
        </p>
        <Toggle label="Ride Hailing" desc="Okada and Taxi bookings" field="rideEnabled" />
        <Toggle label="Deliveries" desc="Parcel and package delivery" field="deliveryEnabled" />
        <Toggle label="Gas Delivery" desc="Gas cylinder refill & delivery" field="gasEnabled" />
        <Toggle label="Maintenance Mode" desc="Show maintenance screen to all users" field="maintenanceMode" />
      </div>

      <button onClick={handleSave} disabled={saving} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        padding: '14px', borderRadius: '12px', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
        background: 'linear-gradient(135deg, #16a34a, #15803d)',
        color: '#fff', fontWeight: 700, fontSize: '14px',
        boxShadow: '0 4px 16px rgba(22,163,74,0.3)', opacity: saving ? 0.8 : 1
      }}>
        <Save size={16} />
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  )
}
