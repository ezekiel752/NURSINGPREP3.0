import { type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

/**
 * SECURITY NOTE:
 * Never trust the client for authorization: all admin data comes from database
 * RPCs (e.g. admin_overview) which enforce is_admin() server-side using security
 * definer permissions. This client-side guard is strictly for UX routing.
 */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, loading, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className="min-h-screen bg-bg text-text flex items-center justify-center">
        <div className="space-y-4 text-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted text-sm font-medium">Verifying administrative access…</p>
        </div>
      </div>
    )
  }

  // Signed out -> redirect to /login
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Signed in but not admin -> access-denied screen (not blocked by level or is_active)
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-bg text-text flex flex-col justify-center items-center p-6">
        <div className="w-full max-w-md border border-border bg-surface p-8 rounded-2xl space-y-6 text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-accent/10 text-accent flex items-center justify-center mx-auto text-xl font-bold" aria-hidden="true">
            ✕
          </div>

          <div className="space-y-2">
            <p className="text-xs font-extrabold uppercase tracking-widest text-accent">
              Access Denied
            </p>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Administrator Access Required
            </h1>
            <p className="text-sm text-muted leading-relaxed">
              You are signed in as <strong className="text-text font-semibold">{user.email || 'this account'}</strong>, but this account has not been assigned administrative privileges.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={async () => {
                await signOut()
                navigate('/login')
              }}
              className="w-full sm:w-1/2 bg-primary text-on-primary py-2.5 px-4 text-sm font-semibold rounded-xl hover:opacity-90 motion-safe:transition-transform motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Sign out
            </button>
            <button
              type="button"
              onClick={() => navigate('/app')}
              className="w-full sm:w-1/2 border border-border hover:border-accent bg-surface text-text py-2.5 px-4 text-sm font-semibold rounded-xl motion-safe:transition-transform motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Go to Student App
            </button>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
