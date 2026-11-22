import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { StudentDetailDrawer } from '../components/StudentDetailDrawer'

export interface StudentListItem {
  id: string
  full_name: string | null
  email: string | null
  level: number | null
  is_active: boolean
  created_at: string
  total_count: number
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

export function AdminStudentsPage() {
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [pageSize, setPageSize] = useState(20)
  const [page, setPage] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)

  const [students, setStudents] = useState<StudentListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Drawer state
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [triggerEl, setTriggerEl] = useState<HTMLElement | null>(null)

  // Counter to discard responses from obsolete in-flight requests
  const requestIdRef = useRef(0)

  // Debounce search input (~300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Filter & pagination change handlers (resetting to page 1 on filter/size change)
  const handleSearchChange = (val: string) => {
    setSearchInput(val)
    setPage(1)
  }

  const handleStatusChange = (val: string) => {
    setStatusFilter(val)
    setPage(1)
  }

  const handleLevelChange = (val: string) => {
    setLevelFilter(val)
    setPage(1)
  }

  const handlePageSizeChange = (val: number) => {
    setPageSize(val)
    setPage(1)
  }

  useEffect(() => {
    let mounted = true
    const requestId = ++requestIdRef.current

    const loadStudents = async () => {
      try {
        const { data: resData, error: rpcError } = await supabase.rpc('admin_list_students', {
          p_search: debouncedSearch.trim() || null,
          p_status: statusFilter || null,
          p_level: levelFilter ? Number(levelFilter) : null,
          p_limit: pageSize,
          p_offset: (page - 1) * pageSize,
        })

        // Ignore stale responses if a newer request has already fired
        if (!mounted || requestId !== requestIdRef.current) return

        if (rpcError) {
          throw new Error(rpcError.message || 'Failed to fetch students list')
        }

        setStudents((resData as StudentListItem[]) || [])
      } catch (err: unknown) {
        if (!mounted || requestId !== requestIdRef.current) return
        setError(err instanceof Error ? err.message : 'Failed to fetch students list')
      } finally {
        if (mounted && requestId === requestIdRef.current) {
          setLoading(false)
        }
      }
    }

    void loadStudents()

    return () => {
      mounted = false
    }
  }, [debouncedSearch, statusFilter, levelFilter, pageSize, page, refreshKey])

  const handleOpenDetail = (id: string, el: HTMLElement) => {
    setSelectedStudentId(id)
    setTriggerEl(el)
    setIsDrawerOpen(true)
  }

  const handleCloseDetail = () => {
    setIsDrawerOpen(false)
  }

  const handleRetry = () => {
    setLoading(true)
    setError(null)
    setRefreshKey((k) => k + 1)
  }

  const totalCount = students.length > 0 ? Number(students[0].total_count || 0) : 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Student Directory</h2>
        <p className="text-sm text-muted">
          Manage, inspect, and monitor student accounts across all academic cohorts
        </p>
      </div>

      {/* Toolbar: Search, Filters, Page Size */}
      <section
        className="flex flex-col md:flex-row md:items-center justify-between gap-4 border border-border bg-surface p-4 rounded-2xl"
        aria-label="Filter and search students"
      >
        <div className="flex-1 flex flex-col sm:flex-row gap-3">
          {/* Email Search */}
          <div className="relative flex-1">
            <input
              id="student-search-input"
              type="search"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by email…"
              aria-label="Search by email"
              className="w-full border border-border bg-bg text-text px-3.5 py-2 text-xs font-medium rounded-xl placeholder:text-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          {/* Status Filter */}
          <select
            id="student-status-filter"
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
            aria-label="Filter by status"
            className="border border-border bg-bg text-text px-3 py-2 text-xs font-semibold rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="pending_payment">Pending Payment</option>
          </select>

          {/* Level Filter */}
          <select
            id="student-level-filter"
            value={levelFilter}
            onChange={(e) => handleLevelChange(e.target.value)}
            aria-label="Filter by level"
            className="border border-border bg-bg text-text px-3 py-2 text-xs font-semibold rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="">All Levels</option>
            <option value="200">200 Level</option>
            <option value="300">300 Level</option>
            <option value="400">400 Level</option>
          </select>
        </div>

        {/* Page Size Selector */}
        <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
          <label htmlFor="student-page-size" className="text-xs text-muted font-medium">
            Rows per page:
          </label>
          <select
            id="student-page-size"
            value={pageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            aria-label="Page size selector"
            className="border border-border bg-bg text-text px-2.5 py-1.5 text-xs font-semibold rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={30}>30</option>
            <option value={50}>50</option>
          </select>
        </div>
      </section>

      {/* Error state */}
      {error && (
        <div
          role="alert"
          className="border border-danger/30 bg-danger/10 text-text p-6 rounded-2xl space-y-3"
        >
          <div className="space-y-1">
            <span className="text-xs uppercase font-extrabold tracking-widest text-danger">
              Unable to Load Students
            </span>
            <p className="text-sm text-muted">{error}</p>
          </div>
          <button
            type="button"
            onClick={handleRetry}
            className="border border-border bg-surface hover:border-accent text-text px-4 py-2 text-xs font-semibold rounded-lg motion-safe:transition-transform motion-safe:active:scale-[0.98]"
          >
            Retry
          </button>
        </div>
      )}

      {/* Skeleton loading table */}
      {loading && students.length === 0 && !error && (
        <div className="border border-border bg-surface rounded-2xl p-6 space-y-4 animate-pulse">
          <div className="h-4 w-1/4 bg-border/60 rounded" />
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 w-full bg-border/40 rounded-xl" />
            ))}
          </div>
        </div>
      )}

      {/* Table view */}
      {!error && (students.length > 0 || (!loading && students.length === 0)) && (
        <div className="space-y-4">
          <div className="border border-border bg-surface rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Registered students directory</caption>
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
                  {students.map((student) => (
                    <tr
                      key={student.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`View details for ${student.full_name || student.email || 'student'}`}
                      onClick={(e) => handleOpenDetail(student.id, e.currentTarget)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleOpenDetail(student.id, e.currentTarget)
                        }
                      }}
                      className="hover:bg-border/20 focus-visible:bg-border/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer transition-colors"
                    >
                      <td className="py-3.5 px-4 font-semibold text-text whitespace-nowrap">
                        <button
                          type="button"
                          tabIndex={-1}
                          className="hover:underline text-left"
                        >
                          {student.full_name || '—'}
                        </button>
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
                        {formatDate(student.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Empty state */}
            {!loading && students.length === 0 && (
              <div className="p-12 text-center space-y-2">
                <p className="text-base font-bold text-text">No students match</p>
                <p className="text-sm text-muted">
                  Try adjusting your search criteria or filter selections.
                </p>
              </div>
            )}
          </div>

          {/* Pagination Controls */}
          {students.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs">
              <span className="text-muted font-medium">
                Showing {Math.min((page - 1) * pageSize + 1, totalCount)} to{' '}
                {Math.min(page * pageSize, totalCount)} of {totalCount} students
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page <= 1 || loading}
                  aria-label="Previous page"
                  className="border border-border hover:border-accent bg-surface text-text px-3.5 py-1.5 rounded-lg font-semibold disabled:opacity-40 disabled:cursor-not-allowed motion-safe:transition-transform motion-safe:active:scale-[0.98]"
                >
                  Prev
                </button>
                <span className="px-2 font-semibold text-text">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page >= totalPages || loading}
                  aria-label="Next page"
                  className="border border-border hover:border-accent bg-surface text-text px-3.5 py-1.5 rounded-lg font-semibold disabled:opacity-40 disabled:cursor-not-allowed motion-safe:transition-transform motion-safe:active:scale-[0.98]"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Student Detail Drawer */}
      <StudentDetailDrawer
        studentId={selectedStudentId}
        isOpen={isDrawerOpen}
        onClose={handleCloseDetail}
        triggerElement={triggerEl}
      />
    </div>
  )
}
