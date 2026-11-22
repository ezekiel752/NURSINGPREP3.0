import { useEffect, useState, useRef } from 'react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'

export interface OverviewData {
  total_students: number
  active_students: number
  pending_students: number
  verified_revenue: number | string
  question_bank: {
    total_approved: number
    by_level?: Record<string, number>
  }
  completed_exams: number
  recent_signups: Array<{
    id: string
    full_name: string | null
    email: string | null
    level: number | null
    is_active: boolean
    created_at: string
  }>
}

function formatRevenue(minor: number | string | undefined): string {
  const minorNum = Number(minor || 0)
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      maximumFractionDigits: 2,
    }).format(minorNum / 100)
  } catch {
    return `NGN ${(minorNum / 100).toFixed(2)}`
  }
}

function formatJoinedDate(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(dateStr))
  } catch {
    return dateStr
  }
}

export function AdminOverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isFetchingRef = useRef(false)

  useEffect(() => {
    let mounted = true

    const loadInitialOverview = async () => {
      try {
        const { data: resData, error: rpcError } = await supabase.rpc('admin_overview')
        if (!mounted) return
        if (rpcError) {
          throw new Error(rpcError.message || 'Failed to fetch administrative metrics')
        }
        setData(resData as OverviewData)
      } catch (err: unknown) {
        if (!mounted) return
        const message = err instanceof Error ? err.message : 'Failed to fetch administrative metrics'
        setError(message)
        toast.error(`Refresh failed: ${message}`)
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void loadInitialOverview()

    return () => {
      mounted = false
    }
  }, [])

  const handleRefresh = async () => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    setIsRefreshing(true)
    setError(null)

    try {
      const { data: resData, error: rpcError } = await supabase.rpc('admin_overview')
      if (rpcError) {
        throw new Error(rpcError.message || 'Failed to fetch administrative metrics')
      }
      setData(resData as OverviewData)
      toast.success('Metrics refreshed successfully')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch administrative metrics'
      setError(message)
      toast.error(`Refresh failed: ${message}`)
    } finally {
      setIsRefreshing(false)
      isFetchingRef.current = false
    }
  }

  const handleRetry = async () => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    setLoading(true)
    setError(null)

    try {
      const { data: resData, error: rpcError } = await supabase.rpc('admin_overview')
      if (rpcError) {
        throw new Error(rpcError.message || 'Failed to fetch administrative metrics')
      }
      setData(resData as OverviewData)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch administrative metrics'
      setError(message)
      toast.error(`Refresh failed: ${message}`)
    } finally {
      setLoading(false)
      isFetchingRef.current = false
    }
  }

  const isLoadingInitial = loading && !data
  const isActionDisabled = loading || isRefreshing

  return (
    <div className="space-y-8">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Platform Metrics</h2>
          <p className="text-sm text-muted">
            High-level operational overview and performance statistics
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isActionDisabled}
          aria-label="Refresh Metrics"
          className="inline-flex items-center justify-center gap-2 border border-border hover:border-accent bg-surface text-text px-4 py-2 text-xs font-semibold rounded-xl motion-safe:transition-transform motion-safe:active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary self-start sm:self-auto"
        >
          <span className={isRefreshing ? 'animate-spin' : ''} aria-hidden="true">
            ↻
          </span>
          {isRefreshing ? 'Refreshing…' : 'Refresh Metrics'}
        </button>
      </div>

      {/* Error state if metrics failed to load */}
      {error && !data && (
        <div
          role="alert"
          className="border border-danger/30 bg-danger/10 text-text p-6 rounded-2xl space-y-3"
        >
          <div className="space-y-1">
            <span className="text-xs uppercase font-extrabold tracking-widest text-danger">
              Metrics Unavailable
            </span>
            <p className="text-sm text-muted">{error}</p>
          </div>
          <button
            type="button"
            onClick={handleRetry}
            disabled={isActionDisabled}
            className="border border-border bg-surface hover:border-accent text-text px-4 py-2 text-xs font-semibold rounded-lg motion-safe:transition-transform motion-safe:active:scale-[0.98]"
          >
            Retry
          </button>
        </div>
      )}

      {/* Initial loading skeleton */}
      {isLoadingInitial && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="border border-border bg-surface p-6 rounded-2xl space-y-3"
            >
              <div className="h-3 w-1/2 bg-border/60 rounded" />
              <div className="h-8 w-3/4 bg-border/80 rounded" />
              <div className="h-3 w-2/3 bg-border/50 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Metrics Grid */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Students */}
          <div className="border border-border bg-surface p-6 rounded-2xl space-y-2 flex flex-col justify-between shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">
              Total Students
            </span>
            <div className="text-3xl font-extrabold tracking-tight">
              {data.total_students.toLocaleString()}
            </div>
            <p className="text-xs text-muted font-medium">
              {data.active_students} active · {data.pending_students} pending
            </p>
          </div>

          {/* Card 2: Verified Revenue */}
          <div className="border border-border bg-surface p-6 rounded-2xl space-y-2 flex flex-col justify-between shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">
              Verified Revenue
            </span>
            <div className="text-3xl font-extrabold tracking-tight">
              {formatRevenue(data.verified_revenue)}
            </div>
            <p className="text-xs text-muted font-medium">Paystack successful charges</p>
          </div>

          {/* Card 3: Question Bank */}
          <div className="border border-border bg-surface p-6 rounded-2xl space-y-2 flex flex-col justify-between shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">
              Question Bank
            </span>
            <div className="text-3xl font-extrabold tracking-tight">
              {(data.question_bank?.total_approved ?? 0).toLocaleString()}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
                {data.question_bank?.total_approved ?? 0} approved
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-surface border border-border text-muted">
                200L: {data.question_bank?.by_level?.['200'] ?? 0}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-surface border border-border text-muted">
                300L: {data.question_bank?.by_level?.['300'] ?? 0}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-surface border border-border text-muted">
                400L: {data.question_bank?.by_level?.['400'] ?? 0}
              </span>
            </div>
          </div>

          {/* Card 4: Completed Exams */}
          <div className="border border-border bg-surface p-6 rounded-2xl space-y-2 flex flex-col justify-between shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">
              Completed Exams
            </span>
            <div className="text-3xl font-extrabold tracking-tight">
              {data.completed_exams.toLocaleString()}
            </div>
            <p className="text-xs text-muted font-medium">Across all student levels</p>
          </div>
        </div>
      )}

      {/* Recent Student Signups section */}
      <div className="space-y-4 pt-4">
        <div>
          <h3 className="text-xl font-extrabold tracking-tight">Recent Student Signups</h3>
          <p className="text-xs text-muted">Five most recent student registrations</p>
        </div>

        {isLoadingInitial && (
          <div className="border border-border bg-surface rounded-2xl p-6 space-y-4 animate-pulse">
            <div className="h-4 w-1/4 bg-border/60 rounded" />
            <div className="h-10 w-full bg-border/40 rounded" />
            <div className="h-10 w-full bg-border/40 rounded" />
            <div className="h-10 w-full bg-border/40 rounded" />
          </div>
        )}

        {data && data.recent_signups && data.recent_signups.length > 0 ? (
          <div className="border border-border bg-surface rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Five most recent student registrations</caption>
                <thead>
                  <tr className="border-b border-border bg-border/10 text-xs uppercase font-extrabold tracking-wider text-muted">
                    <th scope="col" className="py-3 px-4">
                      Name
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Email
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Level
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Status
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Joined
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.recent_signups.map((student) => (
                    <tr
                      key={student.id}
                      className="hover:bg-border/20 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-semibold text-text whitespace-nowrap">
                        {student.full_name || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-muted whitespace-nowrap">
                        {student.email || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-muted whitespace-nowrap">
                        {student.level ? `${student.level} Level` : '—'}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {student.is_active ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                            Pending Payment
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-muted whitespace-nowrap">
                        {formatJoinedDate(student.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          !isLoadingInitial &&
          !error && (
            <div className="border border-border bg-surface rounded-2xl p-12 text-center space-y-2">
              <p className="text-base font-bold text-text">No registered students yet</p>
              <p className="text-sm text-muted">
                When students create an account, their details will appear here.
              </p>
            </div>
          )
        )}
      </div>
    </div>
  )
}
