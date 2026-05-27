'use client'
import { useEffect, useState, useCallback } from 'react'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, query } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { EmptyState, ConfirmDialog } from '@/components/shared'
import { formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { Tag, Plus, X, Trash2, Eye, EyeOff, RefreshCw } from 'lucide-react'

interface Promo {
  id: string
  title: string
  subtitle: string
  imageUrl?: string
  backgroundColor: string
  targetAudience: 'all' | 'passengers' | 'drivers'
  active: boolean
  priority: number
  createdAt?: any
}

const defaultForm = {
  title: '', subtitle: '', imageUrl: '',
  backgroundColor: '#16a34a',
  targetAudience: 'all' as const,
  active: true, priority: 1,
}

export default function PromotionsPage() {
  const [promos, setPromos]     = useState<Promo[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(defaultForm)
  const [saving, setSaving]     = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'promotions'), orderBy('priority', 'desc')))
      setPromos(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Promo[])
    } catch { toast.error('Failed to load promotions') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    if (!form.title || !form.subtitle) { toast.error('Title and subtitle required'); return }
    setSaving(true)
    try {
      await addDoc(collection(db, 'promotions'), {
        ...form, createdAt: serverTimestamp()
      })
      toast.success('Promotion created')
      setShowForm(false)
      setForm(defaultForm)
      load()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const toggleActive = async (promo: Promo) => {
    try {
      await updateDoc(doc(db, 'promotions', promo.id), { active: !promo.active })
      toast.success(promo.active ? 'Promotion hidden' : 'Promotion activated')
      load()
    } catch (e: any) { toast.error(e.message) }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteDoc(doc(db, 'promotions', deleteId))
      toast.success('Promotion deleted')
      setDeleteId(null)
      load()
    } catch (e: any) { toast.error(e.message) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>Promotions</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Manage banners shown on the passenger home screen</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 14px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>
            <RefreshCw size={14} />
          </button>
          <button onClick={() => setShowForm(true)} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'linear-gradient(135deg, #16a34a, #15803d)',
            border: 'none', borderRadius: '8px', padding: '8px 16px',
            color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 700,
            boxShadow: '0 4px 12px rgba(22,163,74,0.3)'
          }}>
            <Plus size={14} /> New Promotion
          </button>
        </div>
      </div>

      {/* Promo cards grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {[1,2,3].map(i => (
            <div key={i} className="skeleton" style={{ height: '160px', borderRadius: '16px' }} />
          ))}
        </div>
      ) : promos.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px' }}>
          <EmptyState icon={<Tag size={24} />} title="No promotions yet" description="Create your first promotion banner" />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {promos.map(promo => (
            <div key={promo.id} style={{
              borderRadius: '16px', overflow: 'hidden',
              border: '1px solid var(--border)',
              opacity: promo.active ? 1 : 0.5,
              transition: 'opacity 0.2s'
            }}>
              {/* Banner preview */}
              <div style={{
                height: '100px', background: promo.backgroundColor || '#16a34a',
                display: 'flex', alignItems: 'center', padding: '20px',
                position: 'relative'
              }}>
                {promo.imageUrl && (
                  <img src={promo.imageUrl} alt="" style={{ position: 'absolute', right: 0, top: 0, height: '100%', objectFit: 'cover', opacity: 0.3 }} />
                )}
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#fff', fontFamily: "'Syne', sans-serif", marginBottom: '4px' }}>
                    {promo.title}
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>{promo.subtitle}</div>
                </div>
              </div>

              {/* Card footer */}
              <div style={{ background: 'var(--surface)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
                    <span style={{
                      fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                      background: 'var(--surface-alt)', color: 'var(--text-tertiary)', textTransform: 'capitalize'
                    }}>{promo.targetAudience}</span>
                    <span style={{
                      fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                      background: promo.active ? 'rgba(22,163,74,0.12)' : 'rgba(239,68,68,0.12)',
                      color: promo.active ? '#4ade80' : '#f87171'
                    }}>{promo.active ? 'Active' : 'Hidden'}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{formatDate(promo.createdAt)}</div>
                </div>
                <button onClick={() => toggleActive(promo)} style={{
                  background: 'var(--surface-alt)', border: '1px solid var(--border)',
                  borderRadius: '6px', padding: '6px', cursor: 'pointer',
                  color: 'var(--text-secondary)', display: 'flex'
                }}>
                  {promo.active ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                <button onClick={() => setDeleteId(promo.id)} style={{
                  background: 'rgba(239,68,68,0.12)', border: 'none',
                  borderRadius: '6px', padding: '6px', cursor: 'pointer',
                  color: '#f87171', display: 'flex'
                }}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create form modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '20px', padding: '28px', width: '90%', maxWidth: '520px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                New Promotion
              </h3>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                { label: 'Title', field: 'title', placeholder: 'e.g. 50% Off Your First Ride!' },
                { label: 'Subtitle', field: 'subtitle', placeholder: 'e.g. Use code CTSLAUNCH at checkout' },
                { label: 'Image URL (optional)', field: 'imageUrl', placeholder: 'https://...' },
              ].map(({ label, field, placeholder }) => (
                <div key={field}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>{label}</label>
                  <input
                    value={(form as any)[field]}
                    onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                    placeholder={placeholder}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}
                  />
                </div>
              ))}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>Background Color</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input type="color" value={form.backgroundColor}
                      onChange={e => setForm(p => ({ ...p, backgroundColor: e.target.value }))}
                      style={{ width: '36px', height: '36px', borderRadius: '6px', border: '1px solid var(--border)', cursor: 'pointer', padding: '2px' }}
                    />
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{form.backgroundColor}</span>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>Audience</label>
                  <select value={form.targetAudience} onChange={e => setForm(p => ({ ...p, targetAudience: e.target.value as any }))}
                    style={{ width: '100%', padding: '9px 10px', borderRadius: '8px', background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer' }}>
                    <option value="all">All Users</option>
                    <option value="passengers">Passengers Only</option>
                    <option value="drivers">Drivers Only</option>
                  </select>
                </div>
              </div>

              {/* Preview */}
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>Preview</label>
                <div style={{ height: '72px', borderRadius: '12px', background: form.backgroundColor, display: 'flex', alignItems: 'center', padding: '16px' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#fff', fontFamily: "'Syne', sans-serif" }}>{form.title || 'Banner Title'}</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.8)' }}>{form.subtitle || 'Banner subtitle'}</div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setShowForm(false)} style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{
                padding: '10px 20px', borderRadius: '8px', border: 'none',
                background: 'linear-gradient(135deg, #16a34a, #15803d)',
                color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 700,
                opacity: saving ? 0.7 : 1
              }}>
                {saving ? 'Saving...' : 'Create Promotion'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Promotion?"
        description="This will permanently remove the promotion from the passenger app."
        confirmLabel="Delete"
        confirmColor="#ef4444"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}
