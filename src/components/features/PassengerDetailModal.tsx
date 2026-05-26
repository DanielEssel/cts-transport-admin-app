'use client'
import { useState } from 'react'
import { Passenger } from '@/types'
import { Avatar } from '@/components/shared'
import { formatDateShort } from '@/lib/utils'
import { X, ExternalLink, User, Wallet, MapPin, Phone, Mail, Clock } from 'lucide-react'

interface PassengerDetailModalProps {
  passenger: Passenger & { walletBalance?: number; tripCount?: number }
  onClose: () => void
}

export function PassengerDetailModal({ passenger, onClose }: PassengerDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'stats'>('info')

  const displayName =
    passenger.displayName ||
    [passenger.firstName, passenger.lastName].filter(Boolean).join(' ') ||
    'Unknown'

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
          width: '100%', maxWidth: '620px', maxHeight: '90vh',
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
            <Avatar name={displayName} photoUrl={passenger.photoURL} size={44} />
            <div style={{ flex: 1 }}>
              <h2 style={{
                fontFamily: "'Syne', sans-serif",
                fontSize: '18px', fontWeight: 800,
                color: 'var(--text-primary)', marginBottom: '4px'
              }}>
                {displayName}
              </h2>
              <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                {passenger.phoneNumber && <span>{passenger.phoneNumber}</span>}
                {passenger.email && <span>{passenger.email}</span>}
                <span>Joined {formatDateShort(passenger.createdAt)}</span>
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
            {(['info', 'stats'] as const).map(tab => (
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
                {tab === 'info' ? 'Personal Info' : 'Stats & Wallet'}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>

            {/* ── INFO TAB ── */}
            {activeTab === 'info' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ background: 'var(--surface-alt)', borderRadius: '12px', padding: '16px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <User size={14} /> Personal Information
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    {[
                      ['Full Name',   displayName],
                      ['Phone',       passenger.phoneNumber || '—'],
                      ['Email',       passenger.email       || '—'],
                      ['UID',         passenger.uid],
                      ['Joined',      formatDateShort(passenger.createdAt)],
                    ].map(([label, val]) => (
                      <div key={label}>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                        <div style={{
                          fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)',
                          fontFamily: label === 'UID' ? "'JetBrains Mono', monospace" : undefined,
                          wordBreak: 'break-all'
                        }}>
                          {val}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── STATS TAB ── */}
            {activeTab === 'stats' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                  {[
                    { label: 'Wallet Balance', value: `GH₵ ${(passenger.walletBalance || 0).toFixed(2)}`, color: '#4ade80' },
                    { label: 'Total Trips',    value: passenger.tripCount ?? '—',                          color: '#60a5fa' },
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
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '16px 24px', borderTop: '1px solid var(--border)',
            display: 'flex', justifyContent: 'flex-end',
            background: 'var(--surface)', flexShrink: 0
          }}>
            <button onClick={onClose} style={{
              padding: '10px 20px', borderRadius: '10px', border: '1px solid var(--border)',
              background: 'none', color: 'var(--text-secondary)',
              cursor: 'pointer', fontSize: '13px', fontWeight: 600
            }}>
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  )
}