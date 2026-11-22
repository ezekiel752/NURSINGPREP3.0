import { useState, useRef } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export function PayPage() {
  const navigate = useNavigate()
  const { loading: authLoading, isActive, signOut } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isSubmittingRef = useRef(false)
  const paymentAmount = import.meta.env.VITE_PAYMENT_AMOUNT || ''

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const handlePay = async () => {
    if (isSubmittingRef.current) return
    isSubmittingRef.current = true
    setIsSubmitting(true)

    try {
      const { data, error } = await supabase.functions.invoke('payment-initialize')

      if (error) {
        throw error
      }

      const authUrl = data?.authorization_url
      if (!authUrl || typeof authUrl !== 'string' || !authUrl.startsWith('https://checkout.paystack.com')) {
        throw new Error('Invalid payment authorization URL received.')
      }

      window.location.assign(authUrl)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to initialize payment. Please try again.'
      toast.error(msg)
      isSubmittingRef.current = false
      setIsSubmitting(false)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-bg text-text flex items-center justify-center">
        <p className="text-muted">Loading...</p>
      </div>
    )
  }

  if (isActive) {
    return <Navigate to="/app" replace />
  }

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col justify-center items-center p-6">
      <div className="w-full max-w-md border border-border bg-surface p-8 rounded-2xl space-y-6">
        <div className="space-y-1">
          <div className="text-xs uppercase font-extrabold tracking-widest text-accent">
            Access required
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            Payment required
          </h1>
          <p className="text-sm text-muted">
            Complete the one-time access payment to unlock your dashboard and study materials.
          </p>
        </div>

        {paymentAmount && (
          <div className="border border-border bg-bg p-4 rounded-xl text-center space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">
              One-time access fee
            </span>
            <div className="text-2xl font-extrabold tracking-tight text-text">
              {paymentAmount}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <button
            type="button"
            onClick={handlePay}
            disabled={isSubmitting}
            aria-label="Pay now"
            className="w-full bg-primary text-on-primary py-3 text-sm font-semibold rounded-xl hover:opacity-95 disabled:opacity-50 motion-safe:transition-transform motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {isSubmitting ? 'Initializing payment...' : 'Pay now'}
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSubmitting}
            className="w-full border border-border hover:border-accent bg-surface text-text py-2.5 text-sm font-semibold rounded-xl motion-safe:transition-transform motion-safe:active:scale-[0.98]"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
