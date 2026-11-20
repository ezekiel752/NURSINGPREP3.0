import { type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

interface ProtectedRouteProps {
  children: ReactNode
  requireLevel?: boolean
  blockIfOnboarded?: boolean
}

export function ProtectedRoute({
  children,
  requireLevel = false,
  blockIfOnboarded = false,
}: ProtectedRouteProps) {
  const { user, loading, level } = useAuth()

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

  if (requireLevel && level === null) {
    return <Navigate to="/onboarding" replace />
  }

  if (blockIfOnboarded && level !== null) {
    return <Navigate to="/app" replace />
  }

  return <>{children}</>
}
