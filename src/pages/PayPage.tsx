import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function PayPage() {
  const navigate = useNavigate()
  const { loading: authLoading, isActive, signOut } = useAuth()
  const paymentAmount = import.meta.env.VITE_PAYMENT_AMOUNT || ''

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
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
            disabled
            aria-label="Pay now"
            className="w-full bg-primary text-on-primary py-3 text-sm font-semibold rounded-xl disabled:opacity-50 cursor-not-allowed"
          >
            Coming soon
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="w-full border border-border hover:border-accent bg-surface text-text py-2.5 text-sm font-semibold rounded-xl motion-safe:transition-transform motion-safe:active:scale-[0.98]"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
