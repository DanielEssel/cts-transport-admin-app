'use client'
// Supplier logins for one supplier, managed through the supplier portal's
// staff API (/api/staff/members). The portal owns the membership model
// (gas_supplier_members/{uid}): it verifies this admin's ID token, requires
// an active super admin, validates every request and writes the audit
// trail. This panel only sends the signed-in admin's token and the inputs.
// The reserved gas_suppliers/{sid}/members subcollection is not used.
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { auth } from '@/lib/firebase'
import { portalBaseUrl } from '@/lib/gas-supplier-ops'
import { Card, Field, Modal, Notice, Select, TextArea, TextInput, buttonStyle } from './ui'

interface Member { uid: string; email: string | null; role: string; status: string; version: number }

const PORTAL = portalBaseUrl(process.env.NEXT_PUBLIC_SUPPLIER_PORTAL_URL)
const ROLES = ['owner', 'staff'] as const

async function staffApi(method: 'GET' | 'POST', body?: unknown, query = '') {
  const user = auth.currentUser
  if (!user || !PORTAL) throw new Error('Not available.')
  const res = await fetch(`${PORTAL}/api/staff/members${query}`, {
    method, cache: 'no-store', credentials: 'omit',
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message ?? (res.status === 403 ? 'Only an active super admin can manage supplier logins.' : `The supplier portal refused the request (${res.status}).`))
  return data
}

export function SupplierLogins({ supplierId }: { supplierId: string }) {
  const [members, setMembers] = useState<Member[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'owner' | 'staff'>('owner')
  const [issued, setIssued] = useState<{ email: string; link: string } | null>(null)
  const [revoking, setRevoking] = useState<Member | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!PORTAL) return
    try { setMembers(await staffApi('GET', undefined, `?supplierId=${encodeURIComponent(supplierId)}`)); setError(null) }
    catch (e) { setMembers([]); setError((e as Error).message) }
  }, [supplierId])
  useEffect(() => { load() }, [load])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  if (!PORTAL) {
    return (
      <Card title="Supplier logins">
        <Notice>Supplier logins are managed by the supplier portal. Set NEXT_PUBLIC_SUPPLIER_PORTAL_URL to the portal&apos;s address (and allow this dashboard&apos;s origin in the portal&apos;s PORTAL_STAFF_ALLOWED_ORIGINS) to manage them here.</Notice>
      </Card>
    )
  }

  return (
    <Card title="Supplier logins">
      {error && <Notice tone="danger">{error}</Notice>}
      {members === null ? <div style={{ fontSize: '13px' }}>Loading…</div> : members.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>No logins linked to this supplier.</div>
      ) : (
        <table className="data-table">
          <thead><tr><th>Email</th><th>Role</th><th>Status</th><th /></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.uid}>
                <td>{m.email ?? m.uid}</td>
                <td>{m.role}</td>
                <td>{m.status}</td>
                <td style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                  {m.status === 'active' && <button style={buttonStyle('secondary', busy)} disabled={busy} onClick={() => run(async () => {
                    const r = await staffApi('POST', { action: 'setup_link', uid: m.uid })
                    setIssued({ email: r.email, link: r.setupLink })
                  })}>New setup link</button>}
                  {m.status === 'active' && <button style={buttonStyle('danger', busy)} disabled={busy} onClick={() => setRevoking(m)}>Revoke</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {issued && (
        <Notice tone="warning">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <strong>Password setup link for {issued.email}. No email has been sent.</strong>
            <input readOnly value={issued.link} aria-label="Setup link" onFocus={(e) => e.currentTarget.select()} style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '8px', borderRadius: '8px', border: '1px solid var(--border)' }} />
            <span>Anyone with this link can set the password. Send it only to the supplier, directly. It works once and expires; it is not stored and will not be shown again.</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={buttonStyle('secondary')} onClick={() => navigator.clipboard?.writeText(issued.link).then(() => toast.success('Copied'), () => {})}>Copy</button>
              <button style={buttonStyle('secondary')} onClick={() => setIssued(null)}>Hide</button>
            </div>
          </div>
        </Notice>
      )}

      <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', alignItems: 'end' }}>
        <Field label="Email"><TextInput value={email} onChange={setEmail} placeholder="supplier@example.com" /></Field>
        <Field label="Name (optional)"><TextInput value={name} onChange={setName} /></Field>
        <Field label="Role"><Select value={role} options={ROLES} onChange={setRole} /></Field>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={buttonStyle('primary', busy || !email.trim())} disabled={busy || !email.trim()} onClick={() => run(async () => {
            const r = await staffApi('POST', { action: 'provision', email, supplierId, role, ...(name.trim() ? { displayName: name.trim() } : {}) })
            setIssued({ email: r.email, link: r.setupLink }); setEmail(''); setName(''); toast.success('Login created and linked.'); await load()
          })}>Create login</button>
          <button style={buttonStyle('secondary', busy || !email.trim())} disabled={busy || !email.trim()} onClick={() => run(async () => {
            await staffApi('POST', { action: 'link', email, supplierId, role }); setEmail(''); toast.success('Existing login linked.'); await load()
          })}>Link existing</button>
        </div>
      </div>

      {revoking && (
        <Modal title={`Revoke ${revoking.email ?? revoking.uid}?`} onClose={() => setRevoking(null)} footer={
          <button style={buttonStyle('danger', busy || reason.trim().length < 3)} disabled={busy || reason.trim().length < 3} onClick={() => run(async () => {
            await staffApi('POST', { action: 'revoke', uid: revoking.uid, reason: reason.trim() }); setRevoking(null); setReason(''); toast.success('Login revoked.'); await load()
          })}>Revoke</button>
        }>
          <Field label="Reason" hint="Required and recorded. Access ends immediately."><TextArea value={reason} onChange={setReason} /></Field>
        </Modal>
      )}
    </Card>
  )
}
