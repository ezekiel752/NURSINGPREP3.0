import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function AdminLayout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const navItems = [
    { name: 'Overview', path: '/admin', end: true, icon: '◈' },
    { name: 'Questions', path: '/admin/questions', end: false, icon: '☷' },
    { name: 'Students', path: '/admin/students', end: false, icon: '👥' },
    { name: 'Payments', path: '/admin/payments', end: false, icon: '💳' },
  ]

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside
        className="w-full md:w-64 border-b md:border-b-0 md:border-r border-border bg-surface flex flex-col shrink-0"
        aria-label="Admin Navigation"
      >
        <div className="p-6 border-b border-border flex items-center justify-between">
          <Link to="/admin" className="flex items-center gap-2 group">
            <span className="font-extrabold text-lg tracking-tight">
              Nursing<strong className="text-accent font-extrabold">Prep</strong>
            </span>
            <span className="text-[10px] uppercase font-extrabold tracking-wider px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30">
              Admin
            </span>
          </Link>
        </div>

        <nav className="p-4 space-y-1 flex-1" aria-label="Admin sections">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-muted hover:text-text hover:bg-border/30'
                }`
              }
            >
              <span className="text-base select-none" aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.name}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-border mt-auto space-y-3">
          <div className="text-xs space-y-0.5">
            <span className="text-muted block text-[11px] font-medium uppercase tracking-wider">
              Admin Account
            </span>
            <span
              className="text-text font-medium truncate block max-w-[200px]"
              title={user?.email || ''}
            >
              {user?.email || '—'}
            </span>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full border border-border hover:border-accent bg-surface text-text py-2 px-3 text-xs font-semibold rounded-lg motion-safe:transition-transform motion-safe:active:scale-[0.98]"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-border bg-surface px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase font-extrabold tracking-widest text-accent">
              Administrative Workspace
            </p>
            <h1 className="text-xl font-extrabold tracking-tight">
              Platform Administration
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/app"
              className="border border-border hover:border-accent bg-surface text-text px-3.5 py-1.5 text-xs font-semibold rounded-lg motion-safe:transition-transform motion-safe:active:scale-[0.98] inline-flex items-center gap-1.5"
            >
              Student App <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </header>

        <main className="flex-1 p-6 md:p-8 max-w-6xl w-full mx-auto" aria-live="polite">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
