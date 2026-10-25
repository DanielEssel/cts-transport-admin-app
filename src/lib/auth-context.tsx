'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { Admin } from '@/types'

interface AuthContextType {
  user: User | null
  admin: Admin | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [admin, setAdmin] = useState<Admin | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        const adminDoc = await getDoc(doc(db, 'admins', u.uid))
        if (adminDoc.exists() && adminDoc.data().active === true) {
          setAdmin({ uid: u.uid, ...adminDoc.data() } as Admin)
        } else {
          setAdmin(null)
        }
      } else {
        setAdmin(null)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  const signIn = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    const adminDoc = await getDoc(doc(db, 'admins', cred.user.uid))
    if (!adminDoc.exists() || adminDoc.data().active !== true) {
      await firebaseSignOut(auth)
      const reason = !adminDoc.exists()
        ? `no admins/${cred.user.uid} document`
        : `admins/${cred.user.uid}.active must be boolean true (got ${JSON.stringify(adminDoc.data().active)})`
      console.error('Admin check failed:', reason, cred.user.email)
      throw new Error(`Access denied. Not an admin account (${reason}).`)
    }
  }

  const signOut = async () => {
    await firebaseSignOut(auth)
    setAdmin(null)
  }

  return (
    <AuthContext.Provider value={{ user, admin, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
