import { useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'

interface UseSessionGuardOptions {
  user: User | null
  isAdmin?: boolean
  loading?: boolean
  signOut: () => Promise<void>
  setIsLocked: (locked: boolean) => void
}

/**
 * useSessionGuard manages the active session lifecycle:
 * - Admin exemption: if isAdmin, does NOT register or heartbeat (admins never count against session limits)
 * - Calls register_session once per session restore (never on TOKEN_REFRESHED)
 * - Sends heartbeat_session every 60 seconds and on tab visibility changes
 * - Handles soft-eviction ('revoked') and security locks ('locked')
 */
export function useSessionGuard({
  user,
  isAdmin = false,
  loading = false,
  signOut,
  setIsLocked,
}: UseSessionGuardOptions) {
  const registeredUserIdRef = useRef<string | null>(null)
  const isHeartbeatInFlightRef = useRef(false)

  useEffect(() => {
    // Admin exemption: do NOT register or heartbeat for admins or while auth is loading
    if (loading || !user || isAdmin) {
      registeredUserIdRef.current = null
      return
    }

    let mounted = true

    // 1. Register session once per user session restore
    if (registeredUserIdRef.current !== user.id) {
      registeredUserIdRef.current = user.id

      const register = async () => {
        try {
          const { data, error } = await supabase.rpc('register_session')
          if (!mounted) return

          if (error) {
            // If token lacks session_id or temporary failure, do not crash
            return
          }

          if (data === 'locked') {
            setIsLocked(true)
            toast.error('Your account is locked due to multiple device switches. Please contact an administrator.')
          } else if (data === 'revoked') {
            toast.error('Your session was revoked because your account was opened on another device.')
            await signOut()
          } else {
            setIsLocked(false)
          }
        } catch {
          // Best effort registration
        }
      }

      void register()
    }

    // 2. Heartbeat execution function
    const sendHeartbeat = async () => {
      if (isHeartbeatInFlightRef.current || !mounted) return
      isHeartbeatInFlightRef.current = true

      try {
        const { data, error } = await supabase.rpc('heartbeat_session')
        if (!mounted || error) return

        if (data === 'locked') {
          setIsLocked(true)
          toast.error('Your account is locked. Please contact an administrator.')
        } else if (data === 'revoked') {
          toast.error('Your session was revoked because your account was opened on another device.')
          await signOut()
        } else if (data === 'ok' || data === 'exempt') {
          setIsLocked(false)
        }
      } catch {
        // Best effort heartbeat
      } finally {
        isHeartbeatInFlightRef.current = false
      }
    }

    // 3. Heartbeat interval every 60 seconds
    const intervalTimer = setInterval(() => {
      void sendHeartbeat()
    }, 60000)

    // 4. Send heartbeat on tab becoming visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void sendHeartbeat()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      mounted = false
      clearInterval(intervalTimer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [user, isAdmin, loading, signOut, setIsLocked])
}
