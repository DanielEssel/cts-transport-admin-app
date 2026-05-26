'use client'
import { useState } from 'react'
import { Driver } from '@/types'
import { StatusBadge, Avatar } from '@/components/shared'
import { formatDateShort, formatCurrency } from '@/lib/utils'
import { X, ExternalLink, CheckCircle, XCircle, FileText, User, Car, Star } from 'lucide-react'

interface DriverDetailModalProps {
  driver: Driver
  onClose: () => void
  onApprove: () => void
  onReject: () => void
  onSuspend: () => void
}

const DOC_LABELS: Record<string, string> = {
  profile_photo:          'Profile Photo',
  national_id:            'National ID',
  drivers_license:        "Driver's License",
  vehicle_registration:   'Vehicle Registration',
  roadworthy_certificate: 'Roadworthy Certificate',
  insurance:              'Vehicle Insurance',
  police_clearance:       'Police Clearance',
  vehicle_photo_front:    'Vehicle Front Photo',
  vehicle_photo_side:     'Vehicle Side Photo',
}

export function DriverDetailModal({ driver, onClose, onApprove, onReject, onSuspend }: DriverDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'documents' | 'stats'>('documents')
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const docs = driver.documents || {}
  const docEntries = Object.entries(docs)

  const statusColor = (status: string) => {
    if (status === 'approved' || status === 'uploaded') return '#4ade80'
    if (status === 'rejected') return '#f87171'
    return '#fbbf24'
  }
  const statusBg = (status: string) => {
    if (status === 'approved' || status === 'uploaded') return 'rgba(22,163,74,0.12)'
    if (status === 'rejected') return 'rgba(239,68,68,0.12)'
    return 'rgba(217,119,6,0.12)'
  }

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 101,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px', pointerEvents: 'none'
      }}>
        <div style={{
          width: '100%', maxWidth: '760px', maxHeight: '90vh',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '24px', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          pointerEvents: 'all'
        }}>

          {/* Header */}
          <div style={{
            padding: '20px 24px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0
          }}>
            <Avatar name={driver.displayName || 'Driver'} photoUrl={driver.photoUrl} size={44} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <h2 style={{
                  fontFamily: "'Syne', sans-serif",
                  fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)'
                }}>
                  {driver.displayName}
                </h2>
                <StatusBadge status={
                  driver.signupStep === 'suspended' ? 'suspended'
                  : driver.isApproved ? 'approved' : 'pending'
                } />
              </div>
              <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                <span>{driver.phone}</span>
                <span style={{ textTransform: 'capitalize' }}>{driver.serviceType}</span>
                <span>Joined {formatDateShort(driver.createdAt)}</span>
              </div>
            </div>
            <button onClick={onClose} style={{
              background: 'var(--surface-alt)', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '8px', cursor: 'pointer',
              color: 'var(--text-secondary)', display: 'flex'
            }}>
              <X size={16} />
            </button>
          </div>

          {/* Tabs */}
          <div style={{
            display: 'flex', gap: '4px', padding: '12px 24px 0',
            borderBottom: '1px solid var(--border)', flexShrink: 0
          }}>
            {(['documents', 'info', 'stats'] as const).map(tab => (
              <button
                key={tab} onClick={() => setActiveTab(tab)}
                style={{
                  padding: '8px 16px', borderRadius: '8px 8px 0 0', border: 'none',
                  cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                  background: activeTab === tab ? 'var(--primary)' : 'transparent',
                  color: activeTab === tab ? '#fff' : 'var(--text-tertiary)',
                  textTransform: 'capitalize', transition: 'all 0.15s'
                }}
              >
                {tab === 'documents' ? `Documents (${docEntries.length})` : tab === 'info' ? 'Personal Info' : 'Stats'}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>

            {/* ── DOCUMENTS TAB ── */}
            {activeTab === 'documents' && (
              <div>
                {docEntries.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                    <FileText size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                    <p style={{ fontSize: '14px' }}>No documents uploaded yet</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px' }}>
                    {docEntries.map(([key, value]) => {
                      const label = DOC_LABELS[key] || key.replace(/_/g, ' ')
                      const status = value?.status || 'pending'
                      const url = value?.url

                      return (
                        <div key={key} style={{
                          background: 'var(--surface-alt)',
                          border: '1px solid var(--border)',
                          borderRadius: '12px', overflow: 'hidden',
                          transition: 'border-color 0.15s'
                        }}>
                          {/* Document preview */}
                          <div style={{
                            height: '130px', background: 'var(--border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            position: 'relative', cursor: url ? 'pointer' : 'default',
                            overflow: 'hidden'
                          }}
                            onClick={() => url && setLightboxUrl(url)}
                          >
                            {url ? (
                              <>
                                <img
                                  src={url} alt={label}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  onError={e => {
                                    (e.target as HTMLImageElement).style.display = 'none'
                                  }}
                                />
                                <div style={{
                                  position: 'absolute', inset: 0,
                                  background: 'rgba(0,0,0,0)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  transition: 'background 0.2s'
                                }}
                                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.3)')}
                                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0)')}
                                >
                                  <ExternalLink size={20} style={{ color: '#fff', opacity: 0 }} />
                                </div>
                              </>
                            ) : (
                              <div style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                <FileText size={28} style={{ opacity: 0.4 }} />
                                <p style={{ fontSize: '11px', marginTop: '6px' }}>No file</p>
                              </div>
                            )}
                          </div>

                          {/* Doc info */}
                          <div style={{ padding: '10px 12px' }}>
                            <div style={{
                              fontSize: '12px', fontWeight: 600,
                              color: 'var(--text-primary)', marginBottom: '6px',
                              textTransform: 'capitalize'
                            }}>
                              {label}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{
                                fontSize: '11px', fontWeight: 700,
                                padding: '2px 8px', borderRadius: '20px',
                                background: statusBg(status), color: statusColor(status),
                                textTransform: 'capitalize'
                              }}>
                                {status === 'uploaded' ? 'Uploaded' : status}
                              </span>
                              {url && (
                                <a href={url} target="_blank" rel="noreferrer" style={{
                                  fontSize: '11px', color: '#60a5fa',
                                  textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px'
                                }}>
                                  Open <ExternalLink size={10} />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── INFO TAB ── */}
            {activeTab === 'info' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Personal */}
                <div style={{ background: 'var(--surface-alt)', borderRadius: '12px', padding: '16px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <User size={14} /> Personal Information
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {[
                      ['Full Name',    driver.displayName],
                      ['Phone',        driver.phone],
                      ['Email',        driver.email || '—'],
                      ['Service Type', driver.serviceType],
                      ['Signup Step',  driver.signupStep],
                      ['Joined',       formatDateShort(driver.createdAt)],
                    ].map(([label, val]) => (
                      <div key={label}>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Vehicle */}
                <div style={{ background: 'var(--surface-alt)', borderRadius: '12px', padding: '16px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Car size={14} /> Vehicle Information
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {[
                      ['Vehicle Type',  driver.vehicleType  || '—'],
                      ['Vehicle Model', driver.vehicleModel || '—'],
                      ['Plate Number',  driver.vehiclePlate || '—'],
                    ].map(([label, val]) => (
                      <div key={label}>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── STATS TAB ── */}
            {activeTab === 'stats' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                {[
                  { label: 'Total Trips',    value: driver.completedTrips || driver.totalTrips || 0, color: '#60a5fa' },
                  { label: 'Rating',          value: driver.rating ? `⭐ ${driver.rating.toFixed(1)}` : 'No ratings', color: '#fbbf24' },
                  { label: 'Total Earnings',  value: driver.totalEarnings ? formatCurrency(driver.totalEarnings) : 'GH₵ 0.00', color: '#4ade80' },
                  { label: 'Today Earnings',  value: driver.todayEarnings ? formatCurrency(driver.todayEarnings) : 'GH₵ 0.00', color: '#a78bfa' },
                ].map(stat => (
                  <div key={stat.label} style={{
                    background: 'var(--surface-alt)', border: '1px solid var(--border)',
                    borderRadius: '12px', padding: '18px'
                  }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>{stat.label}</div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: stat.color, fontFamily: "'Syne', sans-serif" }}>
                      {String(stat.value)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action footer */}
          {!driver.isApproved && driver.signupStep !== 'suspended' && (
            <div style={{
              padding: '16px 24px', borderTop: '1px solid var(--border)',
              display: 'flex', gap: '10px', justifyContent: 'flex-end',
              background: 'var(--surface)', flexShrink: 0
            }}>
              <button onClick={onClose} style={{
                padding: '10px 20px', borderRadius: '10px', border: '1px solid var(--border)',
                background: 'none', color: 'var(--text-secondary)',
                cursor: 'pointer', fontSize: '13px', fontWeight: 600
              }}>
                Close
              </button>
              <button onClick={() => { onReject(); onClose() }} style={{
                padding: '10px 20px', borderRadius: '10px', border: 'none',
                background: 'rgba(239,68,68,0.12)', color: '#f87171',
                cursor: 'pointer', fontSize: '13px', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: '6px'
              }}>
                <XCircle size={14} /> Reject Driver
              </button>
              <button onClick={() => { onApprove(); onClose() }} style={{
                padding: '10px 20px', borderRadius: '10px', border: 'none',
                background: 'linear-gradient(135deg, #16a34a, #15803d)',
                color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: '6px',
                boxShadow: '0 4px 12px rgba(22,163,74,0.3)'
              }}>
                <CheckCircle size={14} /> Approve Driver
              </button>
            </div>
          )}

          {driver.isApproved && (
            <div style={{
              padding: '16px 24px', borderTop: '1px solid var(--border)',
              display: 'flex', gap: '10px', justifyContent: 'flex-end',
              background: 'var(--surface)', flexShrink: 0
            }}>
              <button onClick={onClose} style={{
                padding: '10px 20px', borderRadius: '10px', border: '1px solid var(--border)',
                background: 'none', color: 'var(--text-secondary)',
                cursor: 'pointer', fontSize: '13px', fontWeight: 600
              }}>
                Close
              </button>
              <button onClick={() => { onSuspend(); onClose() }} style={{
                padding: '10px 20px', borderRadius: '10px', border: 'none',
                background: 'rgba(234,179,8,0.12)', color: '#fbbf24',
                cursor: 'pointer', fontSize: '13px', fontWeight: 700
              }}>
                Suspend Driver
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
          onClick={() => setLightboxUrl(null)}
        >
          <button style={{
            position: 'absolute', top: '16px', right: '16px',
            background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%',
            width: '36px', height: '36px', cursor: 'pointer', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <X size={18} />
          </button>
          <img
            src={lightboxUrl} alt="Document"
            style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: '12px', objectFit: 'contain' }}
            onClick={e => e.stopPropagation()}
          />
          <a href={lightboxUrl} target="_blank" rel="noreferrer" style={{
            position: 'absolute', bottom: '24px',
            padding: '10px 20px', borderRadius: '8px',
            background: 'rgba(255,255,255,0.1)', color: '#fff',
            textDecoration: 'none', fontSize: '13px', fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: '6px'
          }}>
            <ExternalLink size={14} /> Open full size
          </a>
        </div>
      )}
    </>
  )
}
