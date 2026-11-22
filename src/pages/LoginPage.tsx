import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        toast.error(error.message)
      } else {
        navigate('/app')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred during log in'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col justify-center items-center p-6">
      <div className="w-full max-w-md border border-border bg-surface p-8 rounded-2xl space-y-6">
        <div className="space-y-1">
          <div className="text-xs uppercase font-extrabold tracking-widest text-accent">
            Welcome back
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            Log in to NursingPrep
          </h1>
          <p className="text-sm text-muted">
            Enter your credentials to continue your study sessions.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-xs font-bold uppercase tracking-wider text-muted">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-border bg-bg text-text rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-accent"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="block text-xs font-bold uppercase tracking-wider text-muted">
                Password
              </label>
              <Link
                to="/forgot-password"
                className="text-xs text-muted hover:text-text hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-border bg-bg text-text rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-accent"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-on-primary py-3 text-sm font-semibold rounded-xl motion-safe:transition-transform motion-safe:active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? 'Logging in...' : 'Log in'}
          </button>
        </form>

        <div className="text-center text-sm text-muted pt-2 border-t border-border">
          <span>Don't have an account? </span>
          <Link to="/signup" className="font-semibold text-text hover:underline hover:decoration-accent">
            Create account
          </Link>
        </div>
      </div>
    </div>
  )
}
