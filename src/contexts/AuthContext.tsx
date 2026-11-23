import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useSessionGuard } from '../hooks/useSessionGuard'

export interface AuthContextType {
  user: User | null
  loading: boolean
  level: number | null
  isActive: boolean
  isAdmin: boolean
  isLocked: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  level: null,
  isActive: false,
  isAdmin: false,
  isLocked: false,
  refreshProfile: async () => {},
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [level, setLevel] = useState<number | null>(null)
  const [isActive, setIsActive] = useState<boolean>(false)
  const [isAdmin, setIsAdmin] = useState<boolean>(false)
  const [isLocked, setIsLocked] = useState<boolean>(false)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('level, is_active, is_locked')
        .eq('id', userId)
        .maybeSingle()
      if (!error && data) {
        setLevel(data.level ?? null)
        setIsActive(Boolean(data.is_active))
        setIsLocked(Boolean(data.is_locked))
      } else {
        setLevel(null)
        setIsActive(false)
        setIsLocked(false)
      }
    } catch {
      setLevel(null)
      setIsActive(false)
      setIsLocked(false)
    }
  }

  const fetchAdminStatus = async () => {
    try {
      if (typeof supabase.rpc === 'function') {
        const { data, error } = await supabase.rpc('is_admin')
        if (!error && typeof data === 'boolean') {
          setIsAdmin(data)
          return
        }
      }
      setIsAdmin(false)
    } catch {
      setIsAdmin(false)
    }
  }

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (currentUser) {
        await Promise.all([fetchProfile(currentUser.id), fetchAdminStatus()])
      } else {
        setLevel(null)
        setIsActive(false)
        setIsAdmin(false)
        setIsLocked(false)
      }
      if (mounted) setLoading(false)
    }).catch(() => {
      if (mounted) setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (currentUser) {
        // Do NOT set loading to true on token refresh or refocus
        await Promise.all([fetchProfile(currentUser.id), fetchAdminStatus()])
      } else {
        setLevel(null)
        setIsActive(false)
        setIsAdmin(false)
        setIsLocked(false)
      }
      if (mounted) setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const refreshProfile = async () => {
    if (user) {
      await Promise.all([fetchProfile(user.id), fetchAdminStatus()])
    }
  }

  const signOut = async () => {
    try {
      if (typeof supabase.rpc === 'function') {
        await supabase.rpc('end_session')
      }
    } catch {
      // Best effort end_session
    }
    await supabase.auth.signOut()
    setUser(null)
    setLevel(null)
    setIsActive(false)
    setIsAdmin(false)
    setIsLocked(false)
  }

  // Active session and device limit guard (exempts admins)
  useSessionGuard({ user, isAdmin, loading, signOut, setIsLocked })

  return (
    <AuthContext.Provider value={{ user, loading, level, isActive, isAdmin, isLocked, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
