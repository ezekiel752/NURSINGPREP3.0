import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { toast } from 'sonner'
import { PayPage } from './PayPage'
import { PayReturnPage } from './PayReturnPage'
import { AuthProvider } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(),
    functions: {
      invoke: vi.fn(),
    },
  },
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

const mockUser = { id: 'test-user-id', email: 'student@example.com' }

describe('PayPage & PayReturnPage', () => {
  const originalLocation = window.location

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock window.location.assign
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...originalLocation,
        assign: vi.fn(),
      },
    })

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: {
        session: {
          user: mockUser,
          access_token: 'fake-token',
        } as unknown as import('@supabase/supabase-js').Session,
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
        data: { level: 200, is_active: false },
        error: null,
      }),
      update: vi.fn().mockReturnThis(),
    } as unknown as ReturnType<typeof supabase.from>)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    })
  })

  it('click calls payment-initialize once with no body and redirects on valid Paystack URL', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        authorization_url: 'https://checkout.paystack.com/access-code-1234',
        reference: 'nursing-test-ref',
      },
      error: null,
    })

    render(
      <MemoryRouter>
        <AuthProvider>
          <PayPage />
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /pay now/i })).toBeDefined()
    })

    const payBtn = screen.getByRole('button', { name: /pay now/i })
    fireEvent.click(payBtn)

    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledTimes(1)
      expect(supabase.functions.invoke).toHaveBeenCalledWith('payment-initialize')
      expect(window.location.assign).toHaveBeenCalledWith('https://checkout.paystack.com/access-code-1234')
    })
  })

  it('rejects non-Paystack authorization URL, triggers toast, and re-enables button', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        authorization_url: 'https://malicious-site.com/checkout',
        reference: 'bad-ref',
      },
      error: null,
    })

    render(
      <MemoryRouter>
        <AuthProvider>
          <PayPage />
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /pay now/i })).toBeDefined()
    })

    const payBtn = screen.getByRole('button', { name: /pay now/i })
    fireEvent.click(payBtn)

    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledTimes(1)
      expect(window.location.assign).not.toHaveBeenCalled()
      expect(toast.error).toHaveBeenCalledWith('Invalid payment authorization URL received.')
      expect(payBtn.hasAttribute('disabled')).toBe(false)
    })
  })

  it('handles payment-initialize error, triggers toast, and re-enables button', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: new Error('Payment service unavailable'),
    })

    render(
      <MemoryRouter>
        <AuthProvider>
          <PayPage />
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /pay now/i })).toBeDefined()
    })

    const payBtn = screen.getByRole('button', { name: /pay now/i })
    fireEvent.click(payBtn)

    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledTimes(1)
      expect(window.location.assign).not.toHaveBeenCalled()
      expect(toast.error).toHaveBeenCalledWith('Payment service unavailable')
      expect(payBtn.hasAttribute('disabled')).toBe(false)
    })
  })

  it('/pay/return polls profile and redirects to /app when is_active becomes true', async () => {
    vi.useFakeTimers()

    let queryCount = 0
    vi.mocked(supabase.from).mockImplementation(() => {
      queryCount++
      const isActiveValue = queryCount >= 2 // becomes active on second check
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { level: 200, is_active: isActiveValue },
          error: null,
        }),
      } as unknown as ReturnType<typeof supabase.from>
    })

    render(
      <MemoryRouter initialEntries={['/pay/return']}>
        <AuthProvider>
          <Routes>
            <Route path="/pay/return" element={<PayReturnPage />} />
            <Route path="/app" element={<div>Dashboard Destination</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    expect(screen.getByText('Confirming your payment...')).toBeDefined()

    // Advance 3 seconds for polling interval and flush promises
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })

    expect(screen.getByText('Dashboard Destination')).toBeDefined()
  })

  it('/pay/return shows timeout message and Back to /pay button after 60 seconds of no change', async () => {
    vi.useFakeTimers()

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { level: 200, is_active: false },
        error: null,
      }),
    } as unknown as ReturnType<typeof supabase.from>)

    render(
      <MemoryRouter initialEntries={['/pay/return']}>
        <AuthProvider>
          <Routes>
            <Route path="/pay/return" element={<PayReturnPage />} />
            <Route path="/pay" element={<div>Pay Destination</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    expect(screen.getByText('Confirming your payment...')).toBeDefined()

    // Advance 60 seconds and flush promises
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000)
    })

    expect(
      screen.getByText(
        'Payment received but not confirmed yet. Refresh in a minute or contact support.'
      )
    ).toBeDefined()
    expect(screen.getByRole('button', { name: /back to \/pay/i })).toBeDefined()

    // Click Back to /pay
    fireEvent.click(screen.getByRole('button', { name: /back to \/pay/i }))
    expect(screen.getByText('Pay Destination')).toBeDefined()
  })
})
