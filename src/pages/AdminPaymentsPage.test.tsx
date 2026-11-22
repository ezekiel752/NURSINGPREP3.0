import { render, screen, waitFor, fireEvent, cleanup, act, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { AuthProvider } from '../contexts/AuthContext'
import { AdminRoute } from '../components/AdminRoute'
import { AdminLayout } from '../components/AdminLayout'
import { AdminPaymentsPage } from './AdminPaymentsPage'
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

const samplePaymentsList = [
  {
    id: 'pay-uuid-1',
    reference: 'PAY-1050-REF',
    email: 'florence@example.com',
    full_name: 'Florence Nightingale',
    amount_minor: 105000, // 1,050.00 NGN
    currency: 'NGN',
    status: 'success',
    verified_at: '2026-11-20T11:00:00Z',
    created_at: '2026-11-20T10:00:00Z',
    total_count: 25,
  },
  {
    id: 'pay-uuid-2',
    reference: 'PAY-UNVERIFIED-REF',
    email: 'mary@example.com',
    full_name: 'Mary Seacole',
    amount_minor: 500000, // 5,000.00 NGN
    currency: 'NGN',
    status: 'pending',
    verified_at: null, // Unverified, should show "-"
    created_at: '2026-11-21T12:00:00Z',
    total_count: 25,
  },
]

describe('AdminPaymentsPage Tests', () => {
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
      if (fnName === 'admin_list_payments') {
        return { data: samplePaymentsList, error: null }
      }
      return { data: null, error: null }
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('list renders payments table with correct columns and data', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/payments']}>
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
              <Route path="payments" element={<AdminPaymentsPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('PAY-1050-REF')).toBeDefined()
    })

    expect(screen.getByText('Payments Directory')).toBeDefined()

    const table = screen.getByRole('table')
    expect(within(table).getByRole('columnheader', { name: 'Student' })).toBeDefined()
    expect(within(table).getByRole('columnheader', { name: 'Reference' })).toBeDefined()
    expect(within(table).getByRole('columnheader', { name: 'Amount' })).toBeDefined()
    expect(within(table).getByRole('columnheader', { name: 'Status' })).toBeDefined()
    expect(within(table).getByRole('columnheader', { name: 'Paid Date' })).toBeDefined()
    expect(within(table).getByRole('columnheader', { name: 'Created' })).toBeDefined()

    // Rows rendered
    expect(within(table).getByText('Florence Nightingale')).toBeDefined()
    expect(within(table).getByText('florence@example.com')).toBeDefined()
    expect(within(table).getByText('PAY-1050-REF')).toBeDefined()
    expect(within(table).getByText('Success')).toBeDefined()

    expect(within(table).getByText('Mary Seacole')).toBeDefined()
    expect(within(table).getByText('mary@example.com')).toBeDefined()
    expect(within(table).getByText('PAY-UNVERIFIED-REF')).toBeDefined()
    expect(within(table).getByText('Pending')).toBeDefined()
  })

  it('amount shows minor/100 as NGN', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/payments']}>
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
              <Route path="payments" element={<AdminPaymentsPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('PAY-1050-REF')).toBeDefined()
    })

    // 105,000 minor units -> 1,050.00
    expect(screen.getByText(/1,050\.00/)).toBeDefined()
    // 500,000 minor units -> 5,000.00
    expect(screen.getByText(/5,000\.00/)).toBeDefined()
  })

  it('filters combine into ONE rpc call with right params', async () => {
    vi.useFakeTimers()

    render(
      <MemoryRouter initialEntries={['/admin/payments']}>
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
              <Route path="payments" element={<AdminPaymentsPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    // Apply search input
    const searchInput = screen.getByPlaceholderText('Search by email or reference…')
    fireEvent.change(searchInput, { target: { value: 'PAY-1050' } })

    // Apply status filter
    const statusSelect = screen.getByLabelText('Filter by status')
    fireEvent.change(statusSelect, { target: { value: 'success' } })

    // Fast-forward debounce timer (300ms)
    await act(async () => {
      vi.advanceTimersByTime(350)
      await vi.runAllTimersAsync()
    })

    vi.useRealTimers()

    // Verify admin_list_payments was called with combined parameters
    const calls = mockRpc.mock.calls.filter((call) => call[0] === 'admin_list_payments')
    const lastCall = calls[calls.length - 1]
    expect(lastCall[1]).toEqual({
      p_search: 'PAY-1050',
      p_status: 'success',
      p_limit: 20,
      p_offset: 0,
    })
  })

  it('page change sends p_offset = pageSize', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/payments']}>
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
              <Route path="payments" element={<AdminPaymentsPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 2')).toBeDefined()
    })

    // Click Next page button
    const nextBtn = screen.getByRole('button', { name: 'Next page' })
    fireEvent.click(nextBtn)

    await waitFor(() => {
      const calls = mockRpc.mock.calls.filter((call) => call[0] === 'admin_list_payments')
      const lastCall = calls[calls.length - 1]
      expect(lastCall[1].p_offset).toBe(20) // pageSize is 20, p_offset = 20
      expect(lastCall[1].p_limit).toBe(20)
    })
  })

  it('filter change resets offset to 0', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/payments']}>
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
              <Route path="payments" element={<AdminPaymentsPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 2')).toBeDefined()
    })

    // Advance to page 2
    const nextBtn = screen.getByRole('button', { name: 'Next page' })
    fireEvent.click(nextBtn)

    await waitFor(() => {
      expect(screen.getByText('Page 2 of 2')).toBeDefined()
    })

    // Change status filter
    const statusSelect = screen.getByLabelText('Filter by status')
    fireEvent.change(statusSelect, { target: { value: 'failed' } })

    await waitFor(() => {
      const calls = mockRpc.mock.calls.filter((call) => call[0] === 'admin_list_payments')
      const lastCall = calls[calls.length - 1]
      expect(lastCall[1].p_offset).toBe(0)
      expect(lastCall[1].p_status).toBe('failed')
    })
  })

  it('Next disabled on last page using total_count', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/payments']}>
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
              <Route path="payments" element={<AdminPaymentsPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 2')).toBeDefined()
    })

    // Navigate to page 2 (last page, total_count 25 with pageSize 20)
    const nextBtn = screen.getByRole('button', { name: 'Next page' })
    fireEvent.click(nextBtn)

    await waitFor(() => {
      expect(screen.getByText('Page 2 of 2')).toBeDefined()
    })

    // On last page, Next must be disabled
    expect(nextBtn.hasAttribute('disabled')).toBe(true)
  })

  it('null verified_at shows "-"', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/payments']}>
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
              <Route path="payments" element={<AdminPaymentsPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('PAY-UNVERIFIED-REF')).toBeDefined()
    })

    // The second row has verified_at: null -> rendered as '-'
    const table = screen.getByRole('table')
    const row2 = within(table).getByText('PAY-UNVERIFIED-REF').closest('tr')
    expect(row2).toBeDefined()
    expect(within(row2 as HTMLElement).getByText('-')).toBeDefined()
  })

  it('stale response ignored', async () => {
    let resolveFirstRequest: (value: unknown) => void = () => {}
    const firstRequestPromise = new Promise((resolve) => {
      resolveFirstRequest = resolve
    })

    let callCount = 0
    mockRpc.mockImplementation(async (fnName: string) => {
      if (fnName === 'is_admin') return { data: true, error: null }
      if (fnName === 'admin_list_payments') {
        callCount++
        if (callCount === 1) {
          await firstRequestPromise
          return {
            data: [
              {
                id: 'pay-slow',
                reference: 'PAY-SLOW-RESPONSE',
                email: 'slow@example.com',
                full_name: 'Slow Response Student',
                amount_minor: 10000,
                currency: 'NGN',
                status: 'pending',
                verified_at: null,
                created_at: '2026-11-20T10:00:00Z',
                total_count: 1,
              },
            ],
            error: null,
          }
        }
        return {
          data: [
            {
              id: 'pay-fast',
              reference: 'PAY-FAST-RESPONSE',
              email: 'fast@example.com',
              full_name: 'Fast Response Student',
              amount_minor: 20000,
              currency: 'NGN',
              status: 'success',
              verified_at: '2026-11-21T10:00:00Z',
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
      <MemoryRouter initialEntries={['/admin/payments']}>
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
              <Route path="payments" element={<AdminPaymentsPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Filter by status')).toBeDefined()
    })

    // Trigger second request while first is pending
    const statusSelect = screen.getByLabelText('Filter by status')
    fireEvent.change(statusSelect, { target: { value: 'success' } })

    // Wait for the second (fast) request to render
    await waitFor(() => {
      expect(screen.getByText('PAY-FAST-RESPONSE')).toBeDefined()
    })

    // Now resolve the first (slow) request
    await act(async () => {
      resolveFirstRequest(true)
    })

    // Fast response data must remain, slow response must be ignored
    expect(screen.getByText('PAY-FAST-RESPONSE')).toBeDefined()
    expect(screen.queryByText('PAY-SLOW-RESPONSE')).toBeNull()
  })

  it('drawer opens and Escape closes', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/payments']}>
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
              <Route path="payments" element={<AdminPaymentsPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('PAY-1050-REF')).toBeDefined()
    })

    // Click row to open payment detail drawer
    const row = screen.getByRole('button', {
      name: 'View details for payment PAY-1050-REF',
    })
    fireEvent.click(row)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined()
      expect(screen.getByText('Payment Details')).toBeDefined()
      expect(screen.getByText('Transaction Data')).toBeDefined()
    })

    // Drawer includes currency field
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Currency')).toBeDefined()
    expect(within(dialog).getByText('NGN')).toBeDefined()

    // Close drawer via Escape key
    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })
})
