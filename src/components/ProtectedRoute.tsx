import { type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

interface ProtectedRouteProps {
  children: ReactNode
  requireLevel?: boolean
  requireActive?: boolean
  blockIfOnboarded?: boolean
  blockIfActive?: boolean
}

export function ProtectedRoute({
  children,
  requireLevel = false,
  requireActive = false,
  blockIfOnboarded = false,
  blockIfActive = false,
}: ProtectedRouteProps) {
  const { user, loading, level, isActive, isLocked, signOut } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-bg text-text flex items-center justify-center">
        <p className="text-muted">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (isLocked) {
    return (
      <div className="min-h-screen bg-bg text-text flex flex-col justify-center items-center p-6">
        <div className="w-full max-w-md border border-border bg-surface p-8 rounded-2xl space-y-6 text-center shadow-xs">
          <div className="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center mx-auto text-xl font-bold" aria-hidden="true">
            🔒
          </div>
          <div className="space-y-2">
            <span className="text-xs uppercase font-extrabold tracking-widest text-danger">
              Account Suspended
            </span>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Account Locked
            </h1>
            <p className="text-sm text-muted">
              Your account has been locked due to frequent device switching. Please contact an administrator to review and unlock your account.
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={signOut}
              className="w-full bg-primary text-on-primary py-3 text-sm font-semibold rounded-xl hover:opacity-95 motion-safe:transition-transform motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (requireLevel && level === null) {
    return <Navigate to="/onboarding" replace />
  }

  if (requireActive && !isActive) {
    return <Navigate to="/pay" replace />
  }

  if (blockIfOnboarded && level !== null) {
    return <Navigate to="/app" replace />
  }

  if (blockIfActive && isActive) {
    return <Navigate to="/app" replace />
  }

  return <>{children}</>
}
