import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export function PayReturnPage() {
  const navigate = useNavigate()
  const { user, isActive, refreshProfile } = useAuth()
  const [isTimedOut, setIsTimedOut] = useState(false)
  const hasNavigatedRef = useRef(false)

  useEffect(() => {
    if (isActive && !hasNavigatedRef.current) {
      hasNavigatedRef.current = true
      navigate('/app', { replace: true })
      return
    }

    const checkStatus = async () => {
      if (hasNavigatedRef.current) return

      try {
        const query = user?.id
          ? supabase.from('profiles').select('is_active').eq('id', user.id)
          : supabase.from('profiles').select('is_active')
        const { data, error } = await query.maybeSingle()

        if (!error && data?.is_active) {
          hasNavigatedRef.current = true
          await refreshProfile()
          navigate('/app', { replace: true })
        }
      } catch {
        // Continue polling on transient errors
      }
    }

    void checkStatus()

    const intervalId = setInterval(() => {
      void checkStatus()
    }, 3000)

    const timeoutId = setTimeout(() => {
      setIsTimedOut(true)
      clearInterval(intervalId)
    }, 60000)

    return () => {
      clearInterval(intervalId)
      clearTimeout(timeoutId)
    }
  }, [user, isActive, refreshProfile, navigate])

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col justify-center items-center p-6">
      <div className="w-full max-w-md border border-border bg-surface p-8 rounded-2xl space-y-6 text-center">
        {!isTimedOut ? (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
            <h1 className="text-xl font-extrabold tracking-tight">
              Confirming your payment...
            </h1>
            <p className="text-sm text-muted">
              Please wait while we confirm your payment status.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <h1 className="text-xl font-extrabold tracking-tight">
                Payment status
              </h1>
              <p className="text-sm text-muted">
                Payment received but not confirmed yet. Refresh in a minute or contact support.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/pay')}
              className="w-full bg-primary text-on-primary py-3 text-sm font-semibold rounded-xl hover:opacity-95 motion-safe:transition-transform motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Back to /pay
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
