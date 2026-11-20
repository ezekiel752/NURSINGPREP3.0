import { useNavigate } from 'react-router-dom'

export function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Header */}
      <header className="border-b border-border bg-surface">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="font-extrabold text-lg tracking-tight">NursingPrep</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="border border-border hover:border-accent bg-surface text-text px-3.5 py-1.5 text-sm font-semibold rounded-lg motion-safe:transition-transform motion-safe:active:scale-[0.98] hover:underline hover:decoration-accent"
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => navigate('/signup')}
              className="bg-primary text-on-primary px-3.5 py-1.5 text-sm font-semibold rounded-lg motion-safe:transition-transform motion-safe:active:scale-[0.98]"
            >
              Create account
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12 space-y-20">
        {/* Hero */}
        <section className="text-center max-w-3xl mx-auto space-y-6 pt-6">
          <div className="text-xs uppercase font-extrabold tracking-widest text-accent">
            Nursing CBT preparation
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            Your next level starts with practice.
          </h1>
          <p className="text-lg text-muted leading-relaxed max-w-2xl mx-auto">
            A focused nursing exam-prep space built around the questions you need, clear explanations, and progress you can track over time.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <button
              type="button"
              onClick={() => navigate('/signup')}
              className="w-full sm:w-auto bg-primary text-on-primary px-6 py-3 text-base font-semibold rounded-xl motion-safe:transition-transform motion-safe:active:scale-[0.98]"
            >
              Create your account
            </button>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="w-full sm:w-auto border border-border hover:border-accent bg-surface text-text px-6 py-3 text-base font-semibold rounded-xl motion-safe:transition-transform motion-safe:active:scale-[0.98] hover:underline hover:decoration-accent"
            >
              Already have an account? Log in
            </button>
          </div>
          <p className="text-xs text-muted max-w-md mx-auto pt-2">
            For learning and exam practice only. Always follow current clinical guidance and local protocols.
          </p>
        </section>

        {/* Study cycle */}
        <section aria-label="Study cycle">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border border-border bg-surface p-6 rounded-2xl">
              <p className="font-bold text-base">
                <span className="text-accent">01</span> Practice / Build a habit
              </p>
            </div>
            <div className="border border-border bg-surface p-6 rounded-2xl">
              <p className="font-bold text-base">
                <span className="text-accent">02</span> Understand / Learn from feedback
              </p>
            </div>
            <div className="border border-border bg-surface p-6 rounded-2xl">
              <p className="font-bold text-base">
                <span className="text-accent">03</span> Progress / Track your growth
              </p>
            </div>
          </div>
        </section>

        {/* At a glance */}
        <section aria-label="At a glance">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="border border-border bg-surface p-5 rounded-xl text-center">
              <p className="font-bold text-lg">300 questions</p>
            </div>
            <div className="border border-border bg-surface p-5 rounded-xl text-center">
              <p className="font-bold text-lg">150 / 150 medium and hard questions</p>
            </div>
            <div className="border border-border bg-surface p-5 rounded-xl text-center">
              <p className="font-bold text-lg">70 / 30 written response and multiple choice</p>
            </div>
            <div className="border border-border bg-surface p-5 rounded-xl text-center">
              <p className="font-bold text-lg">One-time assessment fee · amount to be announced</p>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="space-y-8">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-center tracking-tight">
            How Nursing Prep works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border border-border bg-surface p-6 rounded-2xl space-y-3">
              <h3 className="text-lg font-bold">Practice your way</h3>
              <p className="text-sm text-muted leading-relaxed">
                Choose medium, hard, or a mix. Filter by topic, take an untimed session, or set a timer for exam-style practice.
              </p>
            </div>
            <div className="border border-border bg-surface p-6 rounded-2xl space-y-3">
              <h3 className="text-lg font-bold">Understand every answer</h3>
              <p className="text-sm text-muted leading-relaxed">
                Check answers as you go, then review explanations when you finish a session.
              </p>
            </div>
            <div className="border border-border bg-surface p-6 rounded-2xl space-y-3">
              <h3 className="text-lg font-bold">Made for your level</h3>
              <p className="text-sm text-muted leading-relaxed">
                Create an account with your university and academic level, and get questions matched to where you are.
              </p>
            </div>
          </div>
        </section>

        {/* Get started */}
        <section className="border border-border bg-surface p-8 sm:p-12 rounded-3xl text-center max-w-3xl mx-auto space-y-6">
          <div className="text-xs uppercase font-extrabold tracking-widest text-accent">
            Get started
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Make your next study session count.
          </h2>
          <p className="text-base text-muted max-w-xl mx-auto leading-relaxed">
            Sign up with Wellspring University and your level. One-time assessment fee, amount to be announced.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => navigate('/signup')}
              className="bg-primary text-on-primary px-8 py-3.5 text-base font-semibold rounded-xl motion-safe:transition-transform motion-safe:active:scale-[0.98]"
            >
              Join Nursing Prep
            </button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-20 py-8 bg-surface">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted">
          <p className="font-semibold text-text">Nursing CBT practice</p>
          <p>Practice with purpose · Progress with confidence</p>
        </div>
      </footer>
    </div>
  )
}
