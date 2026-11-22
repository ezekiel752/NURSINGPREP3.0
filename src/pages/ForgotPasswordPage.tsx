import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const emailInputRef = useRef<HTMLInputElement>(null)

  // Focus on initial email input on mount
  useEffect(() => {
    emailInputRef.current?.focus()
  }, [])

  // Cooldown countdown timer (60s)
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading || cooldown > 0) return

    const trimmedEmail = email.trim()
    if (!trimmedEmail) return

    setLoading(true)
    setErrorMsg('')

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) {
        const msg = (error.message || '').toLowerCase()
        const isRateLimit = error.status === 429 || msg.includes('rate limit') || msg.includes('too many requests')
        const isNetwork = msg.includes('network') || msg.includes('failed to fetch') || msg.includes('timeout')

        if (isRateLimit) {
          setErrorMsg('Too many requests. Please wait a moment before trying again.')
          return
        }

        if (isNetwork) {
          setErrorMsg('Network error. Please check your connection and try again.')
          return
        }

        // For all other errors (e.g. user not found), show neutral success to prevent enumeration
      }

      // Always show neutral success message
      setSubmitted(true)
      setCooldown(60)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message.toLowerCase() : ''
      if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('timeout')) {
        setErrorMsg('Network error. Please check your connection and try again.')
      } else {
        // Neutral success path for unknown emails or uncaught non-network errors
        setSubmitted(true)
        setCooldown(60)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col justify-center items-center p-6">
      <div className="w-full max-w-md border border-border bg-surface p-8 rounded-2xl space-y-6">
        <div className="space-y-1">
          <div className="text-xs uppercase font-extrabold tracking-widest text-accent">
            Account recovery
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            Reset your password
          </h1>
          <p className="text-sm text-muted">
            Enter your registered email address and we will send you a link to reset your password.
          </p>
        </div>

        {/* Success message with live region */}
        {submitted && (
          <div
            role="status"
            aria-live="polite"
            className="border border-emerald-500/30 bg-emerald-500/10 text-text p-4 rounded-xl text-xs space-y-1"
          >
            <p className="font-semibold text-emerald-700 dark:text-emerald-400">
              Check your email
            </p>
            <p className="text-muted leading-relaxed">
              If an account exists for this email, you will receive password reset instructions shortly. Please check your inbox and spam folder.
            </p>
          </div>
        )}

        {/* Error message with live region */}
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
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-xs font-bold uppercase tracking-wider text-muted">
              Email
            </label>
            <input
              ref={emailInputRef}
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-border bg-bg text-text rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          <button
            type="submit"
            disabled={loading || cooldown > 0}
            className="w-full bg-primary text-on-primary py-3 text-sm font-semibold rounded-xl motion-safe:transition-transform motion-safe:active:scale-[0.98] disabled:opacity-50"
          >
            {loading
              ? 'Sending...'
              : cooldown > 0
              ? `Resend in ${cooldown}s`
              : submitted
              ? 'Resend reset instructions'
              : 'Send reset instructions'}
          </button>
        </form>

        <div className="text-center text-sm text-muted pt-2 border-t border-border">
          <span>Remember your password? </span>
          <Link to="/login" className="font-semibold text-text hover:underline hover:decoration-accent">
            Log in
          </Link>
        </div>
      </div>
    </div>
  )
}
