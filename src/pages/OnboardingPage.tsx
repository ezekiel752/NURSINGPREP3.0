import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export function OnboardingPage() {
  const navigate = useNavigate()
  const { user, loading: authLoading, level: userLevel, refreshProfile } = useAuth()
  const [level, setLevel] = useState('200')
  const [loading, setLoading] = useState(false)

  if (authLoading) {
    return (
      <div className="min-h-screen bg-bg text-text flex items-center justify-center">
        <p className="text-muted">Loading...</p>
      </div>
    )
  }

  if (userLevel !== null) {
    return <Navigate to="/app" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      navigate('/login')
      return
    }

    setLoading(true)
    try {
      const numericLevel = parseInt(level, 10)
      const { error } = await supabase
        .from('profiles')
        .update({
          level: numericLevel,
          university: 'Wellspring University',
        })
        .eq('id', user.id)

      if (error) {
        toast.error(error.message)
      } else {
        await refreshProfile()
        toast.success('Profile setup complete')
        navigate('/app')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update profile'
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
            Academic profile
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            Complete your onboarding
          </h1>
          <p className="text-sm text-muted">
            Configure your academic level to match relevant nursing exam preparation materials.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-muted">
              University
            </label>
            <div className="w-full border border-border bg-bg text-text rounded-xl px-4 py-2.5 text-sm font-semibold select-none">
              Wellspring University
            </div>
            <p className="text-xs text-muted">
              Fixed for your cohort.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="levelSelect" className="block text-xs font-bold uppercase tracking-wider text-muted">
              Academic Level
            </label>
            <select
              id="levelSelect"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="w-full border border-border bg-bg text-text rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-accent"
            >
              <option value="200">200 Level</option>
              <option value="300">300 Level</option>
              <option value="400">400 Level</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-on-primary py-3 text-sm font-semibold rounded-xl motion-safe:transition-transform motion-safe:active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? 'Saving profile...' : 'Save and continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
