import { render, screen, waitFor, fireEvent, cleanup, act, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { AuthProvider } from '../contexts/AuthContext'
import { AdminRoute } from '../components/AdminRoute'
import { AdminLayout } from '../components/AdminLayout'
import { AdminStudentsPage } from './AdminStudentsPage'
import { supabase } from '../lib/supabase'

// Mock window.matchMedia for jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

const mockRpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>

const mockAdminUser = { id: 'admin-user-id', email: 'admin@nursingprep.com' }

const sampleStudentsList = [
  {
    id: 'student-1',
    full_name: 'Florence Nightingale',
    email: 'florence@example.com',
    level: 300,
    is_active: true,
    created_at: '2026-11-20T10:00:00Z',
    total_count: 25,
  },
  {
    id: 'student-2',
    full_name: 'Mary Seacole',
    email: 'mary@example.com',
    level: 200,
    is_active: false,
    created_at: '2026-11-21T12:00:00Z',
    total_count: 25,
  },
]

const sampleStudentDetail = {
  id: 'student-1',
  name: 'Florence Nightingale',
  email: 'florence@example.com',
  university: 'London University',
  level: 300,
  is_active: true,
  paid_date: '2026-11-20T11:00:00Z',
  joined_date: '2026-11-20T10:00:00Z',
  stats: {
    attempts_submitted: 5,
    questions_answered: 100,
    accuracy_percent: 82.5,
  },
  recent_attempts: [
    {
      id: 'attempt-1',
      score: 18,
      total: 20,
      percent: 90.0,
      submitted_at: '2026-11-22T08:00:00Z',
    },
  ],
}

describe('AdminStudentsPage Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: {
        session: {
          user: mockAdminUser,
          access_token: 'fake-admin-token',
        } as unknown as Session,
      },
      error: null,
    })

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as unknown as ReturnType<typeof supabase.auth.onAuthStateChange>)

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { level: 200, is_active: true },
        error: null,
      }),
    } as unknown as ReturnType<typeof supabase.from>)

    mockRpc.mockImplementation(async (fnName: string) => {
      if (fnName === 'is_admin') {
        return { data: true, error: null }
      }
      if (fnName === 'admin_list_students') {
        return { data: sampleStudentsList, error: null }
      }
      if (fnName === 'admin_student_detail') {
        return { data: sampleStudentDetail, error: null }
      }
      return { data: null, error: null }
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('list renders students table with correct columns and data', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/students']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminLayout />
                </AdminRoute>
              }
            >
              <Route path="students" element={<AdminStudentsPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Florence Nightingale')).toBeDefined()
    })

    expect(screen.getByText('Student Directory')).toBeDefined()

    const table = screen.getByRole('table')
    expect(within(table).getByRole('columnheader', { name: 'Name' })).toBeDefined()
    expect(within(table).getByRole('columnheader', { name: 'Email' })).toBeDefined()
    expect(within(table).getByRole('columnheader', { name: 'Level' })).toBeDefined()
    expect(within(table).getByRole('columnheader', { name: 'Status' })).toBeDefined()
    expect(within(table).getByRole('columnheader', { name: 'Joined' })).toBeDefined()

    // Rows rendered
    expect(within(table).getByText('Florence Nightingale')).toBeDefined()
    expect(within(table).getByText('florence@example.com')).toBeDefined()
    expect(within(table).getByText('300 Level')).toBeDefined()
    expect(within(table).getByText('Active')).toBeDefined()

    expect(within(table).getByText('Mary Seacole')).toBeDefined()
    expect(within(table).getByText('mary@example.com')).toBeDefined()
    expect(within(table).getByText('200 Level')).toBeDefined()
    expect(within(table).getByText('Pending Payment')).toBeDefined()
  })

  it('filters combine into one rpc call with the right params', async () => {
    vi.useFakeTimers()

    render(
      <MemoryRouter initialEntries={['/admin/students']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminLayout />
                </AdminRoute>
              }
            >
              <Route path="students" element={<AdminStudentsPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    // Flush initial auth and fetch
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    // Apply email search
    const searchInput = screen.getByPlaceholderText('Search by email…')
    fireEvent.change(searchInput, { target: { value: 'florence' } })

    // Apply status filter
    const statusSelect = screen.getByLabelText('Filter by status')
    fireEvent.change(statusSelect, { target: { value: 'active' } })

    // Apply level filter
    const levelSelect = screen.getByLabelText('Filter by level')
    fireEvent.change(levelSelect, { target: { value: '300' } })

    // Fast-forward debounce timer (300ms)
    await act(async () => {
      vi.advanceTimersByTime(350)
      await vi.runAllTimersAsync()
    })

    vi.useRealTimers()

    // Verify admin_list_students was called with combined parameters
    const calls = mockRpc.mock.calls.filter((call) => call[0] === 'admin_list_students')
    const lastCall = calls[calls.length - 1]
    expect(lastCall[1]).toEqual({
      p_search: 'florence',
      p_status: 'active',
      p_level: 300,
      p_limit: 20,
      p_offset: 0,
    })
  })

  it('pagination resets on filter change', async () => {
    mockRpc.mockImplementation(async (fnName: string) => {
      if (fnName === 'is_admin') return { data: true, error: null }
      if (fnName === 'admin_list_students') {
        return {
          data: [
            {
              id: 'student-1',
              full_name: 'Student 1',
              email: 'student1@example.com',
              level: 200,
              is_active: true,
              created_at: '2026-11-20T10:00:00Z',
              total_count: 50,
            },
          ],
          error: null,
        }
      }
      return { data: null, error: null }
    })

    render(
      <MemoryRouter initialEntries={['/admin/students']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminLayout />
                </AdminRoute>
              }
            >
              <Route path="students" element={<AdminStudentsPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 3')).toBeDefined()
    })

    // Click Next to go to Page 2
    const nextBtn = screen.getByRole('button', { name: 'Next page' })
    fireEvent.click(nextBtn)

    await waitFor(() => {
      expect(screen.getByText('Page 2 of 3')).toBeDefined()
    })

    // Change status filter
    const statusSelect = screen.getByLabelText('Filter by status')
    fireEvent.change(statusSelect, { target: { value: 'active' } })

    // Page must reset to 1
    await waitFor(() => {
      expect(screen.getByText('Page 1 of 3')).toBeDefined()
    })
  })

  it('drawer opens and closes', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/students']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminLayout />
                </AdminRoute>
              }
            >
              <Route path="students" element={<AdminStudentsPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Florence Nightingale')).toBeDefined()
    })

    // Click row to open detail drawer
    const row = screen.getByRole('button', {
      name: 'View details for Florence Nightingale',
    })
    fireEvent.click(row)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined()
      expect(screen.getByText('Student Information')).toBeDefined()
      expect(screen.getByText('London University')).toBeDefined()
    })

    // Verify admin_student_detail was called with student-1
    expect(mockRpc).toHaveBeenCalledWith('admin_student_detail', { p_user_id: 'student-1' })

    // Close drawer via Escape key
    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('null paid date shows "No payment on record"', async () => {
    mockRpc.mockImplementation(async (fnName: string) => {
      if (fnName === 'is_admin') return { data: true, error: null }
      if (fnName === 'admin_list_students') return { data: sampleStudentsList, error: null }
      if (fnName === 'admin_student_detail') {
        return {
          data: {
            ...sampleStudentDetail,
            paid_date: null,
          },
          error: null,
        }
      }
      return { data: null, error: null }
    })

    render(
      <MemoryRouter initialEntries={['/admin/students']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminLayout />
                </AdminRoute>
              }
            >
              <Route path="students" element={<AdminStudentsPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Florence Nightingale')).toBeDefined()
    })

    const row = screen.getByRole('button', {
      name: 'View details for Florence Nightingale',
    })
    fireEvent.click(row)

    await waitFor(() => {
      expect(screen.getByText('No payment on record')).toBeDefined()
    })
  })

  it('zero-question accuracy shows a dash', async () => {
    mockRpc.mockImplementation(async (fnName: string) => {
      if (fnName === 'is_admin') return { data: true, error: null }
      if (fnName === 'admin_list_students') return { data: sampleStudentsList, error: null }
      if (fnName === 'admin_student_detail') {
        return {
          data: {
            ...sampleStudentDetail,
            stats: {
              attempts_submitted: 0,
              questions_answered: 0,
              accuracy_percent: 0.0,
            },
          },
          error: null,
        }
      }
      return { data: null, error: null }
    })

    render(
      <MemoryRouter initialEntries={['/admin/students']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminLayout />
                </AdminRoute>
              }
            >
              <Route path="students" element={<AdminStudentsPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Florence Nightingale')).toBeDefined()
    })

    const row = screen.getByRole('button', {
      name: 'View details for Florence Nightingale',
    })
    fireEvent.click(row)

    await waitFor(() => {
      expect(screen.getByText('Study Progress')).toBeDefined()
    })

    // Accuracy stat box shows '—' (dash) instead of 0% or NaN
    const accuracyLabel = screen.getByText('Accuracy')
    const statBox = accuracyLabel.parentElement
    expect(statBox?.textContent).toContain('—')
    expect(statBox?.textContent).not.toContain('NaN')
  })

  it('stale response is ignored', async () => {
    let resolveFirstRequest: (value: unknown) => void = () => {}
    const firstPromise = new Promise((resolve) => {
      resolveFirstRequest = resolve
    })

    let callCount = 0
    mockRpc.mockImplementation(async (fnName: string) => {
      if (fnName === 'is_admin') return { data: true, error: null }
      if (fnName === 'admin_list_students') {
        callCount++
        if (callCount === 1) {
          // Slow request
          await firstPromise
          return {
            data: [
              {
                id: 'slow-student',
                full_name: 'Slow Response Student',
                email: 'slow@example.com',
                level: 200,
                is_active: true,
                created_at: '2026-11-20T10:00:00Z',
                total_count: 1,
              },
            ],
            error: null,
          }
        }
        // Fast subsequent request
        return {
          data: [
            {
              id: 'fast-student',
              full_name: 'Fast Response Student',
              email: 'fast@example.com',
              level: 400,
              is_active: true,
              created_at: '2026-11-21T10:00:00Z',
              total_count: 1,
            },
          ],
          error: null,
        }
      }
      return { data: null, error: null }
    })

    render(
      <MemoryRouter initialEntries={['/admin/students']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminLayout />
                </AdminRoute>
              }
            >
              <Route path="students" element={<AdminStudentsPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Filter by status')).toBeDefined()
    })

    // Trigger second search request while first is still pending
    const statusSelect = screen.getByLabelText('Filter by status')
    fireEvent.change(statusSelect, { target: { value: 'active' } })

    // Wait for the second (fast) request to render
    await waitFor(() => {
      expect(screen.getByText('Fast Response Student')).toBeDefined()
    })

    // Now resolve the first (slow) request
    await act(async () => {
      resolveFirstRequest(true)
    })

    // Fast response data must remain, slow response must be ignored
    expect(screen.getByText('Fast Response Student')).toBeDefined()
    expect(screen.queryByText('Slow Response Student')).toBeNull()
  })
})
