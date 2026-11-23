import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { useFocusTrap } from '../hooks/useFocusTrap'

export interface StudentLockStatus {
  is_locked: boolean
  lock_pending: boolean
  switches_in_window: number
  last_events: Array<{ event: string; created_at: string }>
}

export interface StudentDetailData {
  id: string
  name: string | null
  email: string | null
  university: string | null
  level: number | null
  is_active: boolean
  paid_date: string | null
  joined_date: string | null
  stats: {
    attempts_submitted: number
    questions_answered: number
    accuracy_percent: number
  } | null
  recent_attempts: Array<{
    id: string
    score: number
    total: number
    percent: number
    submitted_at: string
  }> | null
}

interface StudentDetailDrawerProps {
  studentId: string | null
  isOpen: boolean
  onClose: () => void
  triggerElement?: HTMLElement | null
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return '—'
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(d)
  } catch {
    return '—'
  }
}

function formatPaidDate(iso: string | null | undefined): string {
  if (!iso) return 'No payment on record'
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return 'No payment on record'
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(d)
  } catch {
    return 'No payment on record'
  }
}

export function StudentDetailDrawer({
  studentId,
  isOpen,
  onClose,
  triggerElement,
}: StudentDetailDrawerProps) {
  const [data, setData] = useState<StudentDetailData | null>(null)
  const [lockStatus, setLockStatus] = useState<StudentLockStatus | null>(null)
  const [unlocking, setUnlocking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchKey, setFetchKey] = useState(0)

  const headingRef = useRef<HTMLHeadingElement>(null)

  // Use focus trap hook to manage Tab wrapping, Escape closing, inert background, and focus return
  const drawerRef = useFocusTrap<HTMLDivElement>({
    active: isOpen,
    onClose,
    triggerElement,
    initialFocusRef: headingRef,
  })

  // Asynchronously fetch student detail without synchronous setState before await
  useEffect(() => {
    if (!isOpen || !studentId) {
      return
    }

    let active = true

    const loadDetail = async () => {
      try {
        const [detailRes, lockRes] = await Promise.all([
          supabase.rpc('admin_student_detail', {
            p_user_id: studentId,
          }),
          supabase.rpc('admin_get_lock_status', {
            p_user_id: studentId,
          }),
        ])
        if (!active) return
        if (detailRes.error) {
          throw new Error(detailRes.error.message || 'Failed to load student details')
        }
        setData(detailRes.data as StudentDetailData)
        if (lockRes.data) {
          setLockStatus(lockRes.data as unknown as StudentLockStatus)
        } else {
          setLockStatus(null)
        }
      } catch (err: unknown) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to load student details')
      }
    }

    void loadDetail()

    return () => {
      active = false
    }
  }, [isOpen, studentId, fetchKey])

  const loading = isOpen && Boolean(studentId) && (!data || data.id !== studentId) && !error
  const questionsCount = data?.stats?.questions_answered ?? 0
  const accuracyText = questionsCount > 0 ? `${data?.stats?.accuracy_percent ?? 0}%` : '—'

  const handleRetry = () => {
    setError(null)
    setFetchKey((k) => k + 1)
  }

  const handleUnlock = async () => {
    if (!studentId || unlocking) return
    setUnlocking(true)
    try {
      const { error: rpcErr } = await supabase.rpc('admin_unlock_student', {
        p_user_id: studentId,
      })
      if (rpcErr) throw rpcErr
      toast.success('Account unlocked')
      setFetchKey((k) => k + 1)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to unlock account'
      toast.error(msg)
    } finally {
      setUnlocking(false)
    }
  }

  // Render modal drawer directly into document.body portal so siblings can be marked inert
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            aria-hidden="true"
          />

          {/* Drawer panel */}
          <motion.div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-drawer-title"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
            className="relative w-full max-w-md bg-surface border-l border-border h-full shadow-2xl flex flex-col z-10 overflow-hidden"
          >
            {/* Header */}
            <div className="p-6 border-b border-border flex items-center justify-between shrink-0">
              <h2
                id="student-drawer-title"
                ref={headingRef}
                tabIndex={-1}
                className="text-lg font-extrabold tracking-tight focus-visible:outline-none"
              >
                {data?.name || 'Student Profile'}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close details drawer"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-border/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Loading State */}
              {loading && (
                <div className="space-y-4 animate-pulse">
                  <div className="h-4 w-1/3 bg-border/60 rounded" />
                  <div className="space-y-2">
                    <div className="h-8 w-full bg-border/40 rounded" />
                    <div className="h-8 w-full bg-border/40 rounded" />
                    <div className="h-8 w-full bg-border/40 rounded" />
                  </div>
                  <div className="h-24 w-full bg-border/30 rounded-xl" />
                </div>
              )}

              {/* Error State */}
              {error && !loading && (
                <div
                  role="alert"
                  className="border border-danger/30 bg-danger/10 text-text p-6 rounded-2xl space-y-3"
                >
                  <p className="text-xs uppercase font-extrabold tracking-widest text-danger">
                    Failed to Load Details
                  </p>
                  <p className="text-sm text-muted">{error}</p>
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="border border-border bg-surface hover:border-accent text-text px-3.5 py-1.5 text-xs font-semibold rounded-lg motion-safe:transition-transform motion-safe:active:scale-[0.98]"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Content */}
              {data && !loading && (
                <div className="space-y-6 text-sm">
                  {/* Section 1: Student Information */}
                  <section className="space-y-3">
                    <h3 className="text-xs uppercase font-extrabold tracking-wider text-muted">
                      Student Information
                    </h3>
                    <div className="border border-border rounded-xl divide-y divide-border bg-surface/50">
                      <div className="px-4 py-2.5 flex justify-between gap-4">
                        <span className="text-muted text-xs font-medium">Full Name</span>
                        <span className="font-semibold text-text text-right">{data.name || '—'}</span>
                      </div>
                      <div className="px-4 py-2.5 flex justify-between gap-4">
                        <span className="text-muted text-xs font-medium">Email</span>
                        <span className="text-text text-right truncate max-w-[220px]" title={data.email || ''}>
                          {data.email || '—'}
                        </span>
                      </div>
                      <div className="px-4 py-2.5 flex justify-between gap-4">
                        <span className="text-muted text-xs font-medium">University</span>
                        <span className="text-text text-right">{data.university || '—'}</span>
                      </div>
                      <div className="px-4 py-2.5 flex justify-between gap-4">
                        <span className="text-muted text-xs font-medium">Academic Level</span>
                        <span className="text-text text-right">
                          {data.level ? `${data.level} Level` : '—'}
                        </span>
                      </div>
                      <div className="px-4 py-2.5 flex justify-between items-center gap-4">
                        <span className="text-muted text-xs font-medium">Status</span>
                        {data.is_active ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                            Pending Payment
                          </span>
                        )}
                      </div>
                      <div className="px-4 py-2.5 flex justify-between gap-4">
                        <span className="text-muted text-xs font-medium">Payment Verified</span>
                        <span className="text-text text-right font-medium">
                          {formatPaidDate(data.paid_date)}
                        </span>
                      </div>
                      <div className="px-4 py-2.5 flex justify-between gap-4">
                        <span className="text-muted text-xs font-medium">Joined Date</span>
                        <span className="text-text text-right">{formatDate(data.joined_date)}</span>
                      </div>
                    </div>
                  </section>

                  {/* Section 2: Device & Session Security */}
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs uppercase font-extrabold tracking-wider text-muted">
                        Device & Session Security
                      </h3>
                      {lockStatus?.is_locked && (
                        <button
                          type="button"
                          onClick={handleUnlock}
                          disabled={unlocking}
                          className="px-3 py-1 text-xs font-semibold rounded-lg bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50"
                        >
                          {unlocking ? 'Unlocking...' : 'Unlock Account'}
                        </button>
                      )}
                    </div>
                    <div className="border border-border rounded-xl divide-y divide-border bg-surface/50">
                      <div className="px-4 py-2.5 flex justify-between items-center gap-4">
                        <span className="text-muted text-xs font-medium">Account Status</span>
                        {lockStatus?.is_locked ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-danger/15 text-danger border border-danger/30">
                            Account Locked
                          </span>
                        ) : lockStatus?.lock_pending ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                            Lock Pending
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                            Normal
                          </span>
                        )}
                      </div>
                      <div className="px-4 py-2.5 flex justify-between gap-4">
                        <span className="text-muted text-xs font-medium">Device Switches</span>
                        <span className="text-text text-right font-medium">
                          {lockStatus ? `${lockStatus.switches_in_window} / 3 in last 30 days` : '0 / 3 in last 30 days'}
                        </span>
                      </div>
                    </div>
                  </section>

                  {/* Section 3: Study Progress Stats */}
                  <section className="space-y-3">
                    <h3 className="text-xs uppercase font-extrabold tracking-wider text-muted">
                      Study Progress
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="border border-border rounded-xl p-3 text-center bg-surface/50">
                        <span className="text-xl font-extrabold tracking-tight block text-text">
                          {data.stats?.attempts_submitted ?? 0}
                        </span>
                        <span className="text-[11px] text-muted font-medium uppercase tracking-wider">
                          Sessions
                        </span>
                      </div>
                      <div className="border border-border rounded-xl p-3 text-center bg-surface/50">
                        <span className="text-xl font-extrabold tracking-tight block text-text">
                          {questionsCount}
                        </span>
                        <span className="text-[11px] text-muted font-medium uppercase tracking-wider">
                          Questions
                        </span>
                      </div>
                      <div className="border border-border rounded-xl p-3 text-center bg-surface/50">
                        <span className="text-xl font-extrabold tracking-tight block text-text">
                          {accuracyText}
                        </span>
                        <span className="text-[11px] text-muted font-medium uppercase tracking-wider">
                          Accuracy
                        </span>
                      </div>
                    </div>
                  </section>

                  {/* Section 3: Recent Sessions (up to 10) */}
                  <section className="space-y-3">
                    <h3 className="text-xs uppercase font-extrabold tracking-wider text-muted">
                      Recent Sessions
                    </h3>
                    {data.recent_attempts && data.recent_attempts.length > 0 ? (
                      <div className="border border-border rounded-xl divide-y divide-border bg-surface/50">
                        {data.recent_attempts.map((attempt) => (
                          <div
                            key={attempt.id}
                            className="px-4 py-2.5 flex items-center justify-between text-xs"
                          >
                            <span className="font-semibold text-text">
                              {attempt.score}/{attempt.total} ({attempt.percent}%)
                            </span>
                            <span className="text-muted">{formatDate(attempt.submitted_at)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted italic p-3 border border-border/50 rounded-xl bg-surface/30">
                        No completed exam or practice sessions recorded yet.
                      </p>
                    )}
                  </section>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}
