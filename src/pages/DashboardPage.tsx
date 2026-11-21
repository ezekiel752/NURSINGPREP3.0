import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function DashboardPage() {
  const navigate = useNavigate()
  const { user, level, signOut } = useAuth()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="border-b border-border bg-surface">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="font-extrabold text-lg tracking-tight">NursingPrep</span>
          <button
            type="button"
            onClick={handleSignOut}
            className="border border-border hover:border-accent bg-surface text-text px-3.5 py-1.5 text-sm font-semibold rounded-lg motion-safe:transition-transform motion-safe:active:scale-[0.98]"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12 space-y-6">
        <div className="space-y-1">
          <div className="text-xs uppercase font-extrabold tracking-widest text-accent">
            Workspace
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Dashboard
          </h1>
          <p className="text-muted">
            Welcome back{user?.email ? `, ${user.email}` : ''}. You are set up for Level {level}.
          </p>
        </div>

        <div className="border border-border bg-surface p-6 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-bold">Standard Practice Exam</h2>
            <p className="text-sm text-muted">
              Practice 20 timed questions tailored to your academic level.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/app/exam')}
            aria-label="Start exam"
            className="bg-primary text-on-primary hover:opacity-90 px-5 py-2.5 text-sm font-semibold rounded-xl motion-safe:transition-transform motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Start exam
          </button>
        </div>
      </main>
    </div>
  )
}
