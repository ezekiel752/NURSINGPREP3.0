import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { Session, AuthChangeEvent } from '@supabase/supabase-js'
import { AuthProvider, useAuth } from '../contexts/AuthContext'
import { ProtectedRoute } from '../components/ProtectedRoute'
import { StudentDetailDrawer } from '../components/StudentDetailDrawer'
import { supabase } from '../lib/supabase'
import { toast } from 'sonner'

// Mock matchMedia for jsdom
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

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

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

const mockUser = {
  id: 'user-123',
  email: 'student@example.com',
}

describe('Session Limit & Device Security Tests', () => {
  let authCallback: ((event: AuthChangeEvent, session: Session | null) => void) | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    authCallback = null

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: {
        session: {
          user: mockUser,
          access_token: 'fake-jwt',
        } as unknown as Session,
      },
      error: null,
    })

    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation(
      (callback: (event: AuthChangeEvent, session: Session | null) => void) => {
        authCallback = callback
        return {
          data: {
            subscription: {
              unsubscribe: vi.fn(),
            },
          },
        } as unknown as ReturnType<typeof supabase.auth.onAuthStateChange>
      }
    )

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { level: 200, is_active: true, is_locked: false },
        error: null,
      }),
    } as unknown as ReturnType<typeof supabase.from>)

    mockRpc.mockImplementation(async (fn: string) => {
      if (fn === 'is_admin') {
        return { data: false, error: null }
      }
      return { data: 'ok', error: null }
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('calls register_session once on user session restore', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <div>App Loaded</div>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('App Loaded')).toBeDefined()
    })

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('register_session')
    })
  })

  it('does NOT call register_session again on TOKEN_REFRESHED event', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <div>App Loaded</div>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('App Loaded')).toBeDefined()
    })

    await waitFor(() => {
      const initialCalls = mockRpc.mock.calls.filter((c) => c[0] === 'register_session').length
      expect(initialCalls).toBe(1)
    })

    // Simulate token refresh event
    act(() => {
      if (authCallback) {
        authCallback('TOKEN_REFRESHED', {
          user: mockUser,
          access_token: 'new-token',
        } as unknown as Session)
      }
    })

    const subsequentCalls = mockRpc.mock.calls.filter((c) => c[0] === 'register_session').length
    expect(subsequentCalls).toBe(1)
  })

  it('signs out and shows toast when register_session returns revoked', async () => {
    mockRpc.mockImplementation(async (fn: string) => {
      if (fn === 'is_admin') {
        return { data: false, error: null }
      }
      if (fn === 'register_session') {
        return { data: 'revoked', error: null }
      }
      return { data: 'ok', error: null }
    })

    render(
      <MemoryRouter>
        <AuthProvider>
          <div>App Loaded</div>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('opened on another device')
      )
    })

    expect(supabase.auth.signOut).toHaveBeenCalled()
  })

  it('sends heartbeat_session every 60 seconds and on tab visibility change', async () => {
    vi.useFakeTimers()

    render(
      <MemoryRouter>
        <AuthProvider>
          <div>App Loaded</div>
        </AuthProvider>
      </MemoryRouter>
    )

    // Flush initial auth resolve
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })

    expect(mockRpc).toHaveBeenCalledWith('register_session')

    // Advance 60s for heartbeat
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000)
    })

    expect(mockRpc).toHaveBeenCalledWith('heartbeat_session')

    // Simulate visibility change to visible
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    const heartbeatCalls = mockRpc.mock.calls.filter((c) => c[0] === 'heartbeat_session').length
    expect(heartbeatCalls).toBeGreaterThanOrEqual(2)
  })

  it('signs out when heartbeat_session returns revoked', async () => {
    vi.useFakeTimers()

    mockRpc.mockImplementation(async (fn: string) => {
      if (fn === 'is_admin') {
        return { data: false, error: null }
      }
      if (fn === 'heartbeat_session') {
        return { data: 'revoked', error: null }
      }
      return { data: 'ok', error: null }
    })

    render(
      <MemoryRouter>
        <AuthProvider>
          <div>App Loaded</div>
        </AuthProvider>
      </MemoryRouter>
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000)
    })

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('opened on another device')
    )
    expect(supabase.auth.signOut).toHaveBeenCalled()
  })

  it('renders Account Locked screen when account is locked in ProtectedRoute', async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { level: 200, is_active: true, is_locked: true },
        error: null,
      }),
    } as unknown as ReturnType<typeof supabase.from>)

    mockRpc.mockImplementation(async (fn: string) => {
      if (fn === 'is_admin') {
        return { data: false, error: null }
      }
      if (fn === 'register_session') {
        return { data: 'locked', error: null }
      }
      return { data: 'ok', error: null }
    })

    function TestContent() {
      const { isLocked } = useAuth()
      return <div>Protected Exam Area (Locked: {String(isLocked)})</div>
    }

    render(
      <MemoryRouter initialEntries={['/exam']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/exam"
              element={
                <ProtectedRoute>
                  <TestContent />
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Account Locked')).toBeDefined()
    })

    expect(
      screen.getByText(/Your account has been locked due to frequent device switching/)
    ).toBeDefined()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeDefined()
    expect(screen.queryByText(/Protected Exam Area/)).toBeNull()
  })

  it('StudentDetailDrawer displays lock status, switches, and unlocks account on click', async () => {
    mockRpc.mockImplementation(async (fn: string) => {
      if (fn === 'admin_student_detail') {
        return {
          data: {
            id: 'student-99',
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            university: 'Oxford',
            level: 300,
            is_active: true,
            paid_date: '2026-11-20T10:00:00Z',
            joined_date: '2026-11-20T10:00:00Z',
            stats: null,
            recent_attempts: null,
          },
          error: null,
        }
      }
      if (fn === 'admin_get_lock_status') {
        return {
          data: {
            is_locked: true,
            lock_pending: false,
            switches_in_window: 3,
            last_events: [{ event: 'lock', created_at: '2026-11-22T10:00:00Z' }],
          },
          error: null,
        }
      }
      if (fn === 'admin_unlock_student') {
        return { data: true, error: null }
      }
      return { data: null, error: null }
    })

    const onClose = vi.fn()

    render(
      <StudentDetailDrawer
        studentId="student-99"
        isOpen={true}
        onClose={onClose}
      />
    )

    // Wait for drawer content to load
    await waitFor(() => {
      expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0)
    })

    // Check Device & Session Security section
    expect(screen.getByText('Device & Session Security')).toBeDefined()
    expect(screen.getByText('Account Locked')).toBeDefined()
    expect(screen.getByText('3 / 3 in last 30 days')).toBeDefined()

    // Unlock button should be visible
    const unlockButton = screen.getByRole('button', { name: /unlock account/i })
    expect(unlockButton).toBeDefined()

    // Click Unlock Account
    fireEvent.click(unlockButton)

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('admin_unlock_student', {
        p_user_id: 'student-99',
      })
      expect(toast.success).toHaveBeenCalledWith('Account unlocked')
    })
  })
})
