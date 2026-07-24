import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return `GH₵ ${amount.toFixed(2)}`
}

export function formatDate(date: any): string {
  if (!date) return '—'
  const d = date?.toDate ? date.toDate() : new Date(date)
  return new Intl.DateTimeFormat('en-GH', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(d)
}

export function formatDateShort(date: any): string {
  if (!date) return '—'
  const d = date?.toDate ? date.toDate() : new Date(date)
  return new Intl.DateTimeFormat('en-GH', {
    day: 'numeric', month: 'short', year: 'numeric'
  }).format(d)
}

export function getInitials(name: string): string {
  if (!name) return '?'
  return name.trim().split(' ').map((p: string) => p[0]).join('').toUpperCase().slice(0, 2)
}

export function timeAgo(date: any): string {
  if (!date) return '—'
  const d = date?.toDate ? date.toDate() : new Date(date)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}



export async function logAudit(
  adminUid: string,
  adminEmail: string,
  action: string,
  targetType: string,
  targetId: string,
  details: string
) {
  try {
    await addDoc(collection(db, 'audit_log'), {
      adminUid, adminEmail, action, targetType, targetId, details,
      createdAt: serverTimestamp(),
    })
  } catch (e) {
    console.error('Audit log failed:', e)
  }
}
