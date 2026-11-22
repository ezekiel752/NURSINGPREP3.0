import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { AuthProvider } from '../contexts/AuthContext'
import { AdminRoute } from '../components/AdminRoute'
import { AdminLayout } from '../components/AdminLayout'
import { AdminOverviewPage } from './AdminOverviewPage'
import { supabase } from '../lib/supabase'

// Mock window.matchMedia for sonner / jsdom
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

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

const mockAdminUser = { id: 'admin-user-id', email: 'admin@nursingprep.com' }
const mockStudentUser = { id: 'student-user-id', email: 'student@example.com' }

const sampleOverviewData = {
  total_students: 42,
  active_students: 30,
  pending_students: 12,
  verified_revenue: 5000000, // 50,000 NGN in minor units
  question_bank: {
    total_approved: 150,
    by_level: {
      '200': 50,
      '300': 60,
      '400': 40,
    },
  },
  completed_exams: 88,
  recent_signups: [
    {
      id: 'student-1',
      full_name: 'Florence Nightingale',
      email: 'florence@example.com',
      level: 200,
      is_active: true,
      created_at: '2026-11-20T10:00:00Z',
    },
    {
      id: 'student-2',
      full_name: 'Mary Seacole',
      email: 'mary@example.com',
      level: 300,
      is_active: false,
      created_at: '2026-11-21T12:00:00Z',
    },
  ],
}

describe('Admin Shell & Overview Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()

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
  })

  afterEach(() => {
    cleanup()
  })

  it('non-admin sees access denied and admin_overview is not called', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: {
        session: {
          user: mockStudentUser,
          access_token: 'fake-student-token',
        } as unknown as Session,
      },
      error: null,
    })

    mockRpc.mockImplementation(async (fnName: string) => {
      if (fnName === 'is_admin') {
        return { data: false, error: null }
      }
      return { data: null, error: null }
    })

    render(
      <MemoryRouter initialEntries={['/admin']}>
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
              <Route index element={<AdminOverviewPage />} />
            </Route>
            <Route path="/login" element={<div>Login Page Target</div>} />
            <Route path="/app" element={<div>Student App Target</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Access Denied')).toBeDefined()
      expect(screen.getByText('Administrator Access Required')).toBeDefined()
    })

    // Displays signed-in email
    expect(screen.getByText(/student@example\.com/)).toBeDefined()

    // Sign out and Go to Student App buttons
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Go to Student App' })).toBeDefined()

    // Real admin RPC must NOT be called
    expect(mockRpc).not.toHaveBeenCalledWith('admin_overview')
  })

  it('admin sees stats with revenue formatted from minor units', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: {
        session: {
          user: mockAdminUser,
          access_token: 'fake-admin-token',
        } as unknown as Session,
      },
      error: null,
    })

    mockRpc.mockImplementation(async (fnName: string) => {
      if (fnName === 'is_admin') {
        return { data: true, error: null }
      }
      if (fnName === 'admin_overview') {
        return { data: sampleOverviewData, error: null }
      }
      return { data: null, error: null }
    })

    render(
      <MemoryRouter initialEntries={['/admin']}>
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
              <Route index element={<AdminOverviewPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Total Students')).toBeDefined()
    })
    expect(screen.getByText('Platform Metrics')).toBeDefined()

    // Total Students card
    expect(screen.getByText('Total Students')).toBeDefined()
    expect(screen.getByText('42')).toBeDefined()
    expect(screen.getByText('30 active · 12 pending')).toBeDefined()

    // Verified Revenue card (5,000,000 minor units -> 50,000 NGN)
    expect(screen.getByText('Verified Revenue')).toBeDefined()
    expect(screen.getByText(/50,000/)).toBeDefined()
    expect(screen.getByText('Paystack successful charges')).toBeDefined()

    // Question bank card & breakdown pills
    expect(screen.getByText('Question Bank')).toBeDefined()
    expect(screen.getByText('150')).toBeDefined()
    expect(screen.getByText('150 approved')).toBeDefined()
    expect(screen.getByText('200L: 50')).toBeDefined()
    expect(screen.getByText('300L: 60')).toBeDefined()
    expect(screen.getByText('400L: 40')).toBeDefined()

    // Completed exams card
    expect(screen.getByText('Completed Exams')).toBeDefined()
    expect(screen.getByText('88')).toBeDefined()
    expect(screen.getByText('Across all student levels')).toBeDefined()

    // Recent Student Signups table
    expect(screen.getByText('Recent Student Signups')).toBeDefined()
    expect(screen.getByText('Florence Nightingale')).toBeDefined()
    expect(screen.getByText('florence@example.com')).toBeDefined()
    expect(screen.getByText('200 Level')).toBeDefined()
    expect(screen.getByText('Active')).toBeDefined()

    expect(screen.getByText('Mary Seacole')).toBeDefined()
    expect(screen.getByText('mary@example.com')).toBeDefined()
    expect(screen.getByText('300 Level')).toBeDefined()
    expect(screen.getByText('Pending Payment')).toBeDefined()
  })

  it('refresh calls RPC once', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: {
        session: {
          user: mockAdminUser,
          access_token: 'fake-admin-token',
        } as unknown as Session,
      },
      error: null,
    })

    mockRpc.mockImplementation(async (fnName: string) => {
      if (fnName === 'is_admin') {
        return { data: true, error: null }
      }
      if (fnName === 'admin_overview') {
        return { data: sampleOverviewData, error: null }
      }
      return { data: null, error: null }
    })

    render(
      <MemoryRouter initialEntries={['/admin']}>
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
              <Route index element={<AdminOverviewPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Total Students')).toBeDefined()
    })

    const initialOverviewCalls = mockRpc.mock.calls.filter((call) => call[0] === 'admin_overview').length
    expect(initialOverviewCalls).toBe(1)

    const refreshButton = screen.getByRole('button', { name: 'Refresh Metrics' })
    expect(refreshButton).toBeDefined()
    await waitFor(() => {
      expect((refreshButton as HTMLButtonElement).disabled).toBe(false)
    })

    fireEvent.click(refreshButton)

    await waitFor(() => {
      const refreshedOverviewCalls = mockRpc.mock.calls.filter((call) => call[0] === 'admin_overview').length
      expect(refreshedOverviewCalls).toBe(2)
    })
  })

  it('RPC error shows retry', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: {
        session: {
          user: mockAdminUser,
          access_token: 'fake-admin-token',
        } as unknown as Session,
      },
      error: null,
    })

    let callCount = 0
    mockRpc.mockImplementation(async (fnName: string) => {
      if (fnName === 'is_admin') {
        return { data: true, error: null }
      }
      if (fnName === 'admin_overview') {
        callCount++
        if (callCount === 1) {
          return { data: null, error: { message: 'Database connection failed' } }
        }
        return { data: sampleOverviewData, error: null }
      }
      return { data: null, error: null }
    })

    render(
      <MemoryRouter initialEntries={['/admin']}>
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
              <Route index element={<AdminOverviewPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Metrics Unavailable')).toBeDefined()
      expect(screen.getByText('Database connection failed')).toBeDefined()
    })

    // Toast error called
    expect(toast.error).toHaveBeenCalledWith('Refresh failed: Database connection failed')

    // Retry button is available
    const retryButton = screen.getByRole('button', { name: 'Retry' })
    expect(retryButton).toBeDefined()

    fireEvent.click(retryButton)

    await waitFor(() => {
      expect(screen.getByText('42')).toBeDefined()
      expect(screen.getByText('Florence Nightingale')).toBeDefined()
    })
  })
})
