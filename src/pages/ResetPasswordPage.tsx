import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [isRecoverySession, setIsRecoverySession] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const passwordInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let mounted = true

    const hash = typeof window !== 'undefined' ? window.location.hash || '' : ''
    const search = typeof window !== 'undefined' ? window.location.search || '' : ''
    const hasRecoveryHint =
      hash.includes('type=recovery') ||
      search.includes('type=recovery') ||
      hash.includes('access_token=')

    // Initial session verification
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      if (session && (hasRecoveryHint || (session.user as { recovery?: boolean })?.recovery)) {
        setIsRecoverySession(true)
      }
      setCheckingSession(false)
    }).catch(() => {
      if (mounted) setCheckingSession(false)
    })

    // Listen for auth state changes, specifically PASSWORD_RECOVERY
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoverySession(true)
        setCheckingSession(false)
      } else if (event === 'SIGNED_IN' && (hasRecoveryHint || (session?.user as { recovery?: boolean })?.recovery)) {
        setIsRecoverySession(true)
        setCheckingSession(false)
      } else if (event === 'SIGNED_OUT') {
        setIsRecoverySession(false)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  // Focus the first password field once recovery state is verified
  useEffect(() => {
    if (isRecoverySession && passwordInputRef.current) {
      passwordInputRef.current.focus()
    }
  }, [isRecoverySession])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')

    if (password.length < 8) {
      const err = 'Password must be at least 8 characters'
      setErrorMsg(err)
      toast.error(err)
      return
    }

    if (password !== confirmPassword) {
      const err = 'Passwords do not match'
      setErrorMsg(err)
      toast.error(err)
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        setErrorMsg(error.message)
        toast.error(error.message)
      } else {
        await supabase.auth.signOut()
        toast.success('Password updated successfully. Please log in with your new password.')
        navigate('/login')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred while updating your password'
      setErrorMsg(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  // Initial loading state before auth recovery verification completes
  if (checkingSession) {
    return (
      <div className="min-h-screen bg-bg text-text flex items-center justify-center p-6">
        <p className="text-sm text-muted animate-pulse">Verifying recovery session...</p>
      </div>
    )
  }

  // Invalid or expired recovery link state
  if (!isRecoverySession) {
    return (
      <div className="min-h-screen bg-bg text-text flex flex-col justify-center items-center p-6">
        <div className="w-full max-w-md border border-border bg-surface p-8 rounded-2xl space-y-6 text-center">
          <div className="space-y-2">
            <div className="text-xs uppercase font-extrabold tracking-widest text-accent">
              Password Reset
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Link Expired or Invalid
            </h1>
            <p className="text-sm text-muted">
              This link is invalid or has expired. Please request a new one.
            </p>
          </div>

          <div className="pt-2">
            <Link
              to="/forgot-password"
              className="inline-block w-full bg-primary text-on-primary py-3 text-sm font-semibold rounded-xl motion-safe:transition-transform motion-safe:active:scale-[0.98]"
            >
              Request a new one
            </Link>
          </div>

          <div className="text-center text-sm text-muted pt-2 border-t border-border">
            <Link to="/login" className="font-semibold text-text hover:underline hover:decoration-accent">
              Back to log in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Active recovery session: render password reset form
  return (
    <div className="min-h-screen bg-bg text-text flex flex-col justify-center items-center p-6">
      <div className="w-full max-w-md border border-border bg-surface p-8 rounded-2xl space-y-6">
        <div className="space-y-1">
          <div className="text-xs uppercase font-extrabold tracking-widest text-accent">
            Secure Reset
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            Set new password
          </h1>
          <p className="text-sm text-muted">
            Create a strong, unique password for your account.
          </p>
        </div>

        {errorMsg && (
          <div
            role="alert"
            aria-live="assertive"
            className="border border-danger/30 bg-danger/10 text-danger p-4 rounded-xl text-xs font-semibold"
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* New Password */}
          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-xs font-bold uppercase tracking-wider text-muted">
              New Password (min 8 characters)
            </label>
            <div className="relative">
              <input
                ref={passwordInputRef}
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-border bg-bg text-text rounded-xl px-4 py-2.5 pr-16 text-sm focus:outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-primary"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted hover:text-text px-1 py-0.5 rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* Confirm New Password */}
          <div className="space-y-1.5">
            <label htmlFor="confirmPassword" className="block text-xs font-bold uppercase tracking-wider text-muted">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-border bg-bg text-text rounded-xl px-4 py-2.5 pr-16 text-sm focus:outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-primary"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted hover:text-text px-1 py-0.5 rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                {showConfirmPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-on-primary py-3 text-sm font-semibold rounded-xl motion-safe:transition-transform motion-safe:active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? 'Updating password...' : 'Update password'}
          </button>
        </form>

        <div className="text-center text-sm text-muted pt-2 border-t border-border">
          <Link to="/login" className="font-semibold text-text hover:underline hover:decoration-accent">
            Back to log in
          </Link>
        </div>
      </div>
    </div>
  )
}
