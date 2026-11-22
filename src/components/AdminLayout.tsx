import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext'
import { useFocusTrap } from '../hooks/useFocusTrap'

// Shared navigation items between desktop sidebar and mobile slide-in panel
const ADMIN_NAV_ITEMS = [
  { name: 'Overview', path: '/admin', end: true, icon: '◈' },
  { name: 'Questions', path: '/admin/questions', end: false, icon: '☷' },
  { name: 'Students', path: '/admin/students', end: false, icon: '👥' },
  { name: 'Payments', path: '/admin/payments', end: false, icon: '💳' },
] as const

export function AdminLayout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  const handleSignOut = async () => {
    setIsMobileNavOpen(false)
    await signOut()
    navigate('/login')
  }

  // Focus trap for mobile navigation slide-in panel
  const mobileNavRef = useFocusTrap<HTMLDivElement>({
    active: isMobileNavOpen,
    onClose: () => setIsMobileNavOpen(false),
    triggerRef: menuButtonRef,
  })

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col md:flex-row">
      {/* Mobile Topbar (< md breakpoint) */}
      <header className="md:hidden border-b border-border bg-surface px-4 py-3 flex items-center justify-between shrink-0">
        <Link to="/admin" className="flex items-center gap-2 group">
          <span className="font-extrabold text-base tracking-tight">
            Nursing<strong className="text-accent font-extrabold">Prep</strong>
          </span>
          <span className="text-[9px] uppercase font-extrabold tracking-wider px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30">
            Admin
          </span>
        </Link>

        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setIsMobileNavOpen((open) => !open)}
          aria-label={isMobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={isMobileNavOpen}
          aria-controls="admin-mobile-nav-panel"
          className="p-2 rounded-lg border border-border bg-surface text-text hover:border-accent motion-safe:transition-transform motion-safe:active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="text-lg leading-none" aria-hidden="true">
            {isMobileNavOpen ? '✕' : '☰'}
          </span>
        </button>
      </header>

      {/* Desktop Sidebar (md breakpoint and up) */}
      <aside
        className="hidden md:flex md:w-64 md:border-r border-border bg-surface flex-col shrink-0"
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
          {ADMIN_NAV_ITEMS.map((item) => (
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

      {/* Mobile Navigation Drawer Panel */}
      {createPortal(
        <AnimatePresence>
          {isMobileNavOpen && (
            <div className="fixed inset-0 z-50 flex md:hidden">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMobileNavOpen(false)}
                className="fixed inset-0 bg-black/40 backdrop-blur-xs"
                aria-hidden="true"
              />

              {/* Slide-in panel */}
              <motion.div
                id="admin-mobile-nav-panel"
                ref={mobileNavRef}
                role="dialog"
                aria-modal="true"
                aria-label="Navigation menu"
                initial={reducedMotion ? { opacity: 0 } : { x: '-100%' }}
                animate={reducedMotion ? { opacity: 1 } : { x: 0 }}
                exit={reducedMotion ? { opacity: 0 } : { x: '-100%' }}
                transition={{ type: 'spring', damping: 26, stiffness: 260 }}
                className="relative w-72 max-w-[80vw] bg-surface border-r border-border h-full shadow-2xl flex flex-col z-10 overflow-hidden"
              >
                <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
                  <span className="font-extrabold text-base tracking-tight">
                    Nursing<strong className="text-accent font-extrabold">Prep</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsMobileNavOpen(false)}
                    aria-label="Close menu"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-border/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    ✕
                  </button>
                </div>

                <nav className="p-4 space-y-1 flex-1 overflow-y-auto" aria-label="Mobile admin sections">
                  {ADMIN_NAV_ITEMS.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.end}
                      onClick={() => setIsMobileNavOpen(false)}
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

                <div className="p-4 border-t border-border mt-auto space-y-3 shrink-0">
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
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

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
